/**
 * ==============================================================================
 * 🔄 RECRUITER FOLLOW-UP ENGINE
 * ==============================================================================
 * Automatically checks applied_jobs.json for direct email applications sent
 * 3-5 days ago that haven't received a follow-up yet.
 * Sends a concise, respectful 2-line nudge with resume attached.
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { verifyEmailDeliverability } = require('./email_verifier');

const DATA_DIR = path.join(__dirname, 'data');
const APPLIED_FILE = path.join(DATA_DIR, 'applied_jobs.json');
const RESUME_PATH = path.join(__dirname, 'resume.pdf');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.EMAIL_USER,
    pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, '')
  }
});

async function runFollowUpSequence() {
  if (!fs.existsSync(APPLIED_FILE)) {
    console.log('No applied jobs file found.');
    return { processed: 0, sent: 0 };
  }

  const list = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));
  const now = new Date();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  let sentCount = 0;

  for (const app of list) {
    const isDirectEmail = app.method === 'DIRECT_EMAIL' || app.method === 'DIRECT_HR_OUTREACH';
    const hasTarget = app.target && app.target.includes('@');
    const alreadyFollowedUp = app.followedUp === true;
    const isBounced = app.bounced === true || app.status === 'BOUNCED';

    if (!isDirectEmail || !hasTarget || alreadyFollowedUp || isBounced) continue;

    const appliedTime = new Date(app.appliedAt).getTime();
    const age = now.getTime() - appliedTime;

    // Follow up between day 3 and day 7
    if (age >= THREE_DAYS_MS && age <= SEVEN_DAYS_MS) {
      // Zero-Bounce Check (Trash + Inbox synced + DNS MX verification)
      const check = await verifyEmailDeliverability(app.target);
      if (!check.valid) {
        console.log(`🛡️ [Zero-Bounce Blocked Follow-Up] Skipping ${app.company} (${app.target}) - ${check.reason}`);
        continue;
      }

      console.log(`\n⏳ Sending follow-up to: ${app.company} (${app.target})`);

      const textBody = `Dear ${app.company} Hiring Team,\n\nI am writing to briefly follow up on my recent application for the ${app.title || 'Backend Engineer'} role.\n\nWith 3.5+ years of production experience in Node.js, NestJS, PostgreSQL, Redis, and AWS, and as an **immediate joiner (0 notice period)**, I am enthusiastic about the opportunity to contribute to ${app.company}.\n\nI have re-attached my resume for your convenience and would welcome the chance to speak for 10-15 minutes if there is a mutual fit.\n\nBest regards,\nAnkush Upadhyay\n+91-8591684090 | ankush.upadhyay2000@gmail.com\nNotice Period: Immediate (0 Days)\nLinkedIn: https://www.linkedin.com/in/aankush-upadhyay-5961441b6/`;

      try {
        await transporter.sendMail({
          from: `"Ankush Upadhyay" <${process.env.EMAIL_USER}>`,
          to: app.target,
          subject: `Following Up: Application for ${app.title || 'Backend Engineer'} - Ankush Upadhyay (Immediate Joiner)`,
          text: textBody,
          attachments: fs.existsSync(RESUME_PATH) ? [{
            filename: 'Resume_Ankush_Upadhyay.pdf',
            path: RESUME_PATH
          }] : []
        });

        app.followedUp = true;
        app.followedUpAt = now.toISOString();
        sentCount++;
        console.log(`✅ [Delivered Follow-up] -> ${app.company} (${app.target})`);

        // Rate limit between sends
        await new Promise(r => setTimeout(r, 4000));
      } catch (err) {
        console.error(`❌ [Follow-up Failed]: ${app.target} - ${err.message}`);
      }
    }
  }

  if (sentCount > 0) {
    fs.writeFileSync(APPLIED_FILE, JSON.stringify(list, null, 2), 'utf-8');
  }

  console.log(`\n🏁 Follow-up sequence complete. Sent: ${sentCount}`);
  return { sent: sentCount };
}

if (require.main === module) {
  runFollowUpSequence().catch(console.error);
}

module.exports = { runFollowUpSequence };

