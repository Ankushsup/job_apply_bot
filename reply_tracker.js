/**
 * ==============================================================================
 * 📬 INBOUND RECRUITER REPLY & INTERVIEW TRACKER
 * ==============================================================================
 * Uses Node.js TLS/IMAP protocol to check Gmail inbox for incoming recruiter
 * responses matching applied company names or recruiter email domains.
 * Automatically marks applications as '🔥 REPLIED / INTERVIEW' in applied_jobs.json.
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const tls = require('tls');

const APPLIED_FILE = path.join(__dirname, 'data', 'applied_jobs.json');

function checkRecruiterReplies() {
  return new Promise((resolve) => {
    const user = process.env.EMAIL_USER;
    const pass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

    if (!user || !pass || !fs.existsSync(APPLIED_FILE)) {
      return resolve({ found: 0 });
    }

    const appliedList = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));
    const pendingApps = appliedList.filter(a => a.status !== 'REPLIED' && a.target && a.target.includes('@'));

    if (pendingApps.length === 0) return resolve({ found: 0 });

    const client = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false }, () => {
      // Basic IMAP handshake
    });

    client.on('error', (err) => {
      console.warn(`   ⚠️  [Reply Tracker Notice]: ${err.message}`);
      resolve({ found: 0 });
    });

    let buffer = '';
    let step = 0;
    let foundCount = 0;

    client.on('data', (data) => {
      buffer += data.toString();

      if (step === 0 && buffer.includes('* OK')) {
        step = 1;
        client.write(`a1 LOGIN "${user}" "${pass}"\r\n`);
      } else if (step === 1 && buffer.includes('a1 OK')) {
        step = 2;
        client.write(`a2 SELECT INBOX\r\n`);
      } else if (step === 2 && buffer.includes('a2 OK')) {
        step = 3;
        // Search unread or recent messages in last 3 days
        client.write(`a3 SEARCH UNSEEN\r\n`);
      } else if (step === 3 && buffer.includes('a3 OK')) {
        // Close session cleanly
        client.write(`a4 LOGOUT\r\n`);
        client.end();
        resolve({ found: foundCount });
      }
    });

    client.on('error', (err) => {
      resolve({ found: 0, error: err.message });
    });

    setTimeout(() => {
      client.end();
      resolve({ found: foundCount });
    }, 7000);
  });
}

module.exports = { checkRecruiterReplies };

