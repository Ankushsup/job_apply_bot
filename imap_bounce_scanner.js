require('dotenv').config();
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const user = process.env.EMAIL_USER;
const pass = (process.env.EMAIL_PASS || '').replace(/["'\s]/g, '');

const BOUNCED_FILE = path.join(__dirname, 'data', 'bounced_emails.json');
const APPLIED_FILE = path.join(__dirname, 'data', 'applied_jobs.json');

function extractBouncedRecipientsFromText(text) {
  const found = new Set();
  if (!text) return [];

  // Patterns for bounce notifications across Google, Microsoft 365, Postfix, Sendmail, Exim
  const regexes = [
    /Final-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/gi,
    /Original-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/gi,
    /Your message to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s+couldn't be delivered/gi,
    /Your email couldn't be forwarded from\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /group,?\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}),?\s+is configured to reject/gi,
    /Delivery to the following recipient failed permanently:\s*[\r\n\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /The email account that you tried to reach does not exist.*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gis,
    /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>:\s*(?:550|554|553|551|552|501|451|Host or domain name not found|user unknown|Recipient address rejected|does not exist)/gi,
    /To:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /failed permanently:[\s\r\n]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
  ];

  for (const reg of regexes) {
    let match;
    while ((match = reg.exec(text)) !== null) {
      const email = (match[1] || match[0]).toLowerCase().trim().replace(/[<>]/g, '');
      if (
        email.includes('@') &&
        !email.includes('ankush.upadhyay') &&
        !email.includes('googlemail.com') &&
        !email.includes('gmail.com') &&
        !email.includes('mailer-daemon') &&
        !email.includes('postmaster') &&
        !email.endsWith('.png') &&
        !email.endsWith('.svg') &&
        !email.endsWith('.jpg') &&
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
      ) {
        found.add(email);
      }
    }
  }

  return Array.from(found);
}

function fetchBouncesFromFolder(folderName) {
  return new Promise((resolve) => {
    const client = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false }, () => {});
    let buffer = '';
    let step = 0;
    const allFound = new Set();

    client.on('data', (chunk) => {
      buffer += chunk.toString();

      if (step === 0 && buffer.includes('* OK')) {
        step = 1;
        buffer = '';
        client.write(`b1 LOGIN "${user}" "${pass}"\r\n`);
      } else if (step === 1 && buffer.includes('b1 OK')) {
        step = 2;
        buffer = '';
        client.write(`b2 SELECT "${folderName}"\r\n`);
      } else if (step === 2 && buffer.includes('b2 OK')) {
        step = 3;
        buffer = '';
        client.write(`b3 SEARCH OR (FROM "mailer-daemon") (FROM "postmaster")\r\n`);
      } else if (step === 3 && buffer.includes('b3 OK')) {
        step = 4;
        const match = buffer.match(/\* SEARCH ([\d\s]+)/);
        const uids = match && match[1] ? match[1].trim().split(/\s+/).filter(Boolean) : [];
        console.log(`[${folderName}] Found ${uids.length} bounce messages.`);

        if (uids.length === 0) {
          client.write(`b4 LOGOUT\r\n`);
          client.end();
          return resolve(Array.from(allFound));
        }

        // Fetch headers and body snippet for all bounce messages
        // Batch in groups of 25
        const batches = [];
        for (let i = 0; i < uids.length; i += 25) {
          batches.push(uids.slice(i, i + 25).join(','));
        }

        let batchIdx = 0;
        function fetchNextBatch() {
          if (batchIdx >= batches.length) {
            client.write(`b_end LOGOUT\r\n`);
            client.end();
            return resolve(Array.from(allFound));
          }
          const batchUids = batches[batchIdx++];
          buffer = '';
          const tag = `b_fetch_${batchIdx}`;
          client.write(`${tag} FETCH ${batchUids} (BODY.PEEK[TEXT]<0.8000> BODY.PEEK[HEADER.FIELDS (SUBJECT TO FROM)])\r\n`);

          const onBatchData = (data) => {
            const str = data.toString();
            const extracted = extractBouncedRecipientsFromText(str);
            extracted.forEach(e => allFound.add(e));

            if (str.includes(`${tag} OK`)) {
              client.removeListener('data', onBatchData);
              fetchNextBatch();
            }
          };
          client.on('data', onBatchData);
        }

        fetchNextBatch();
      }
    });

    client.on('error', (err) => {
      console.error(`Error on ${folderName}:`, err.message);
      resolve(Array.from(allFound));
    });

    setTimeout(() => {
      client.end();
      resolve(Array.from(allFound));
    }, 15000);
  });
}

async function scanAndSyncBounces() {
  console.log('🔄 Starting Deep Bounce Scan (Trash + Inbox + Spam)...');
  const folders = ['[Gmail]/Trash', 'Trash', 'INBOX', '[Gmail]/Spam'];
  const allBounced = new Set();

  for (const f of folders) {
    try {
      const list = await fetchBouncesFromFolder(f);
      list.forEach(e => allBounced.add(e));
    } catch (e) {
      console.error(`Folder scan failed for ${f}:`, e.message);
    }
  }

  // Load existing bounced emails from file
  if (fs.existsSync(BOUNCED_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(BOUNCED_FILE, 'utf-8'));
      prev.forEach(e => allBounced.add(e.toLowerCase().trim()));
    } catch {}
  }

  // Filter out any known good domains or self
  const finalBounced = Array.from(allBounced).filter(e => {
    return e && e.includes('@') && !e.includes('ankush') && !e.includes('gmail.com');
  });

  console.log(`\n✅ Total unique bounced addresses identified: ${finalBounced.length}`);
  console.log(finalBounced);

  // Save to bounced_emails.json
  fs.writeFileSync(BOUNCED_FILE, JSON.stringify(finalBounced, null, 2), 'utf-8');
  console.log(`💾 Saved updated bounce list to: ${BOUNCED_FILE}`);

  // Cross-reference applied_jobs.json and mark bounced applications
  if (fs.existsSync(APPLIED_FILE)) {
    try {
      const apps = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));
      let markedCount = 0;
      apps.forEach(app => {
        if (app.target && finalBounced.includes(app.target.toLowerCase().trim())) {
          if (app.status !== 'BOUNCED') {
            app.status = 'BOUNCED';
            app.bounced = true;
            markedCount++;
          }
        }
      });
      if (markedCount > 0) {
        fs.writeFileSync(APPLIED_FILE, JSON.stringify(apps, null, 2), 'utf-8');
        console.log(`🏷️ Marked ${markedCount} applications in applied_jobs.json as BOUNCED!`);
      }
    } catch (err) {
      console.error('Error updating applied_jobs.json:', err.message);
    }
  }

  return finalBounced;
}

if (require.main === module) {
  scanAndSyncBounces().then(() => process.exit(0));
}

module.exports = { scanAndSyncBounces, extractBouncedRecipientsFromText };

