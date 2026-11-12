/**
 * ==============================================================================
 * 🛡️ ZERO-BOUNCE EMAIL VERIFIER & LIVE SMTP PROBE 3.0
 * ==============================================================================
 * 1. Blocks non-HR junk prefixes (hiringaccommodation@, noreply@, support@, etc.).
 * 2. Cross-references data/bounced_emails.json (synced from Gmail Trash & Inbox).
 * 3. Checks live DNS MX records.
 * 4. Runs real TCP Port 25 SMTP RCPT TO verification to catch 550 User Unknown
 *    mailboxes BEFORE sending (without delivering any probe email).
 * 5. Detects catch-all mail servers vs strict validation servers.
 * ==============================================================================
 */

const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');
const { scanAndSyncBounces } = require('./imap_bounce_scanner');

const BOUNCED_FILE = path.join(__dirname, 'data', 'bounced_emails.json');

// Non-HR, accessibility, support, and system mailboxes that should NEVER be pitched
const JUNK_LOCAL_PART_REGEX = /^(hiringaccommodation|accommodations?|accessibility|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|support|help|helpdesk|info|privacy|legal|security|abuse|press|media|pr|marketing|sales|billing|accounts|accounting|finance|admin|webmaster|notifications?|alerts?|feedback|unsubscribe|demo|gdpr|dpo|compliance|hello|office|enquiries|inquiries|customercare|service|newsletter)$/i;

// Known dead/disabled corporate inboxes that reject cold emails
const PERMANENT_BLOCKLIST = new Set([
  'careers@groww.in',
  'careers@sliceit.com',
  'careers@cred.club',
  'careers@zeptonow.com',
  'careers@swiggy.in',
  'careers@postman.com',
  'careers@browserstack.com',
  'studio.rohini@yahoo.com',
  'manisha.r@genxhire.in',
  'smrit.singh@travelex.com',
  'alerts@hdfcbank.net'
]);

const catchAllCache = new Map();

function getBouncedEmailsSet() {
  const set = new Set(PERMANENT_BLOCKLIST);
  try {
    if (fs.existsSync(BOUNCED_FILE)) {
      const list = JSON.parse(fs.readFileSync(BOUNCED_FILE, 'utf-8'));
      list.forEach(e => set.add(e.toLowerCase().trim()));
    }
  } catch {}
  return set;
}

function addBouncedEmail(email) {
  if (!email) return;
  const normalized = email.toLowerCase().trim();
  try {
    const dir = path.dirname(BOUNCED_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let list = [];
    if (fs.existsSync(BOUNCED_FILE)) {
      list = JSON.parse(fs.readFileSync(BOUNCED_FILE, 'utf-8'));
    }
    if (!list.includes(normalized)) {
      list.push(normalized);
      fs.writeFileSync(BOUNCED_FILE, JSON.stringify(list, null, 2), 'utf-8');
    }
  } catch {}
}

/**
 * Low-level SMTP RCPT TO probe (never sends DATA, closes cleanly with QUIT).
 */
function smtpRcptProbe(mxHost, email, timeoutMs = 5500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let buffer = '';
    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      try { socket.write('QUIT\r\n'); } catch {}
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish({ status: 'UNKNOWN', code: 0, msg: 'SMTP timeout' }));
    socket.on('error', (err) => finish({ status: 'UNKNOWN', code: 0, msg: err.message }));

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (!buffer.endsWith('\n')) return;
      const lines = buffer.trim().split('\r\n');
      const lastLine = lines[lines.length - 1] || '';
      if (/^\d{3}-/.test(lastLine)) return;
      const code = parseInt(lastLine.slice(0, 3), 10);
      buffer = '';

      if (step === 0 && code === 220) {
        step = 1;
        socket.write('EHLO mailverify.local\r\n');
      } else if (step === 1 && code === 250) {
        step = 2;
        socket.write('MAIL FROM:<verify@gmail.com>\r\n');
      } else if (step === 2 && code === 250) {
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        if (code === 250 || code === 251) {
          finish({ status: 'EXISTS', code, msg: lastLine });
        } else if (code >= 500 && code < 600) {
          const isIpBlock = /(spamhaus|blocked using|client host|service unavailable|access denied|reputation|relay access denied|policy)/i.test(lastLine);
          const isUserUnknown = /(no such user|nosuchuser|does not exist|user unknown|invalid recipient|mailbox unavailable|recipient rejected|unknown user|5\.1\.1|address rejected|account.*disabled)/i.test(lastLine);

          if (isUserUnknown && !isIpBlock) {
            finish({ status: 'NOT_FOUND', code, msg: lastLine });
          } else if (isIpBlock) {
            finish({ status: 'IP_BLOCKED', code, msg: lastLine });
          } else {
            finish({ status: 'NOT_FOUND', code, msg: lastLine });
          }
        } else {
          finish({ status: 'UNKNOWN', code, msg: lastLine });
        }
      } else {
        finish({ status: 'UNKNOWN', code, msg: lastLine });
      }
    });
  });
}

async function checkIsCatchAll(domain, mxHost) {
  if (catchAllCache.has(domain)) return catchAllCache.get(domain);
  const probe = `zz_nonexistent_probe_991188@${domain}`;
  const res = await smtpRcptProbe(mxHost, probe, 5000);
  const info = {
    catchAll: res.status === 'EXISTS',
    probeStatus: res.status
  };
  catchAllCache.set(domain, info);
  return info;
}

/**
 * Real-time verification before sending
 * Returns { valid: boolean, verifiedLive: boolean, catchAll: boolean, reason: string }
 */
async function verifyEmailDeliverability(email, options = {}) {
  const { skipSmtp = false } = options;

  if (!email || typeof email !== 'string') {
    return { valid: false, verifiedLive: false, catchAll: false, reason: 'Empty or invalid email string' };
  }

  const normalized = email.toLowerCase().trim();
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return { valid: false, verifiedLive: false, catchAll: false, reason: 'Malformed email syntax' };
  }

  const [localPart, domain] = parts;

  if (JUNK_LOCAL_PART_REGEX.test(localPart)) {
    return { valid: false, verifiedLive: false, catchAll: false, reason: `Non-HR or system mailbox (${localPart}@)` };
  }

  const bouncedSet = getBouncedEmailsSet();
  if (bouncedSet.has(normalized)) {
    return { valid: false, verifiedLive: false, catchAll: false, reason: 'Previously bounced or blocked corporate inbox' };
  }

  const placeholders = ['you', 'test', 'example', 'sample', 'yourname', 'user', 'name', 'firstname'];
  if (placeholders.includes(localPart)) {
    return { valid: false, verifiedLive: false, catchAll: false, reason: 'Placeholder local part detected' };
  }

  const invalidDomains = ['example.com', 'placeholder.com', 'company.com', 'sample.com', 'test.com', 'domain.com', 'yourdomain.com'];
  if (invalidDomains.includes(domain)) {
    return { valid: false, verifiedLive: false, catchAll: false, reason: 'Fake or placeholder domain' };
  }

  let primaryMx = null;
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, verifiedLive: false, catchAll: false, reason: `No MX records found for domain @${domain}` };
    }
    mxRecords.sort((a, b) => a.priority - b.priority);
    primaryMx = mxRecords[0].exchange;
  } catch {
    return { valid: false, verifiedLive: false, catchAll: false, reason: `Domain @${domain} has no active mail exchange (DNS error)` };
  }

  if (skipSmtp) {
    return { valid: true, verifiedLive: false, catchAll: false, reason: 'Verified DNS MX record' };
  }

  try {
    const probeRes = await smtpRcptProbe(primaryMx, normalized, 5500);
    if (probeRes.status === 'NOT_FOUND') {
      addBouncedEmail(normalized);
      return {
        valid: false,
        verifiedLive: false,
        catchAll: false,
        reason: `SMTP rejected mailbox (${probeRes.code} - prevented bounce)`
      };
    }

    if (probeRes.status === 'EXISTS') {
      const ca = await checkIsCatchAll(domain, primaryMx);
      return {
        valid: true,
        verifiedLive: !ca.catchAll,
        catchAll: ca.catchAll,
        reason: ca.catchAll
          ? `Verified MX + catch-all server (${primaryMx})`
          : `CONFIRMED LIVE MAILBOX via SMTP (${primaryMx})`
      };
    }

    return {
      valid: true,
      verifiedLive: false,
      catchAll: false,
      reason: `Verified DNS MX (${primaryMx}); SMTP probe inconclusive (${probeRes.status})`
    };
  } catch {
    return { valid: true, verifiedLive: false, catchAll: false, reason: `Verified DNS MX (${primaryMx})` };
  }
}

module.exports = {
  verifyEmailDeliverability,
  getBouncedEmailsSet,
  addBouncedEmail,
  scanAndSyncBounces,
  JUNK_LOCAL_PART_REGEX
};
