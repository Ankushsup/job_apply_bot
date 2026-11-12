/**
 * ==============================================================================
 * 🚀 DIRECT HR & TECH RECRUITER OUTREACH CAMPAIGN
 * ==============================================================================
 * Candidate: Ankush Upadhyay
 * Role: Backend Engineer (Node.js, PostgreSQL, Redis, AWS, Microservices)
 * Availability: Immediately Available (0 Notice Period)
 * Contact: +91-8591684090 | ankush.upadhyay2000@gmail.com
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { verifyEmailDeliverability } = require('./email_verifier');

const HR_FILE = path.join(__dirname, 'data', 'hr_contacts.json');
const APPLIED_FILE = path.join(__dirname, 'data', 'applied_jobs.json');
const RESUME_FILE = path.join(__dirname, 'resume.pdf');

// 1. Ensure Files Exist
if (!fs.existsSync(HR_FILE)) {
  console.error('❌ HR contacts file not found at:', HR_FILE);
  process.exit(1);
}
if (!fs.existsSync(RESUME_FILE)) {
  console.error('❌ resume.pdf not found at:', RESUME_FILE);
  process.exit(1);
}

const contacts = JSON.parse(fs.readFileSync(HR_FILE, 'utf-8'));
let appliedList = [];
if (fs.existsSync(APPLIED_FILE)) {
  try {
    appliedList = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));
  } catch { }
}

const alreadyEmailed = new Set(
  appliedList.filter(item => item.method === 'DIRECT_HR_OUTREACH' || item.method === 'DIRECT_EMAIL').map(i => i.target.toLowerCase())
);

// 2. Setup Nodemailer
const emailUser = process.env.EMAIL_USER;
const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

if (!emailUser || !emailPass) {
  console.error('❌ EMAIL_USER or EMAIL_PASS missing in .env');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: { user: emailUser, pass: emailPass }
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runHROutreach() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('======================================================');
  console.log(`🎯 [HR Outreach Campaign] Mode: ${isDryRun ? 'DRY-RUN (Preview Only)' : 'LIVE SENDING'}`);
  console.log(`Candidate: Ankush Upadhyay - Backend Engineer`);
  console.log(`Notice Period: Immediately Available (0 Days)`);
  console.log(`Total Curated HR Contacts: ${contacts.length}`);
  console.log('======================================================\n');

  let sentCount = 0;
  let skippedCount = 0;

  for (const c of contacts) {
    const emailLower = c.email.toLowerCase();

    if (alreadyEmailed.has(emailLower)) {
      console.log(`⏩ [Skipping] ${c.company} (${c.email}) - Already contacted previously.`);
      skippedCount++;
      continue;
    }

    // Zero-Bounce Check (Trash + Inbox synced + DNS MX verification)
    const check = await verifyEmailDeliverability(c.email);
    if (!check.valid) {
      console.log(`🛡️ [Zero-Bounce Blocked] Skipping ${c.company} (${c.email}) - ${check.reason}`);
      skippedCount++;
      continue;
    }

    const subject = `Application: Backend Developer (Node.js, PostgreSQL, Redis) - Ankush Upadhyay [Immediate Joiner]`;

    const bodyText = `Dear ${c.company} Hiring Team,

I am writing to express my strong interest in Backend Engineering opportunities at ${c.company}.

I am a Backend Engineer with 3.5+ years of experience specializing in Node.js, Express.js, PostgreSQL, Redis, and AWS. I have a proven track record of architecting scalable microservices, low-latency APIs, and real-time systems.

Key Highlights of My Experience:
• Real-time & High Concurrency: Engineered the MNM Fitness Platform with WebRTC and Socket.io supporting 500+ concurrent live video and chat users.
• Enterprise Security & Auth: Implemented enterprise authentication and RBAC using Keycloak, and built OTP login flows via AWS SNS with Redis session caching.
• Database Optimization: Designed optimized PostgreSQL schemas and views, reducing query latency by 30%, and integrated Elasticsearch improving search response times by ~60%.
• Cloud & DevOps: Containerized microservices using Docker, AWS EC2, and Nginx (achieving 99.9% uptime), with automated CI/CD deployment pipelines.
• Immediate Availability: I have completed my previous engagement and am available to join immediately (0 notice period).

I have attached my resume for your review. I would welcome the opportunity to discuss how my backend background and quick onboarding can add immediate value to ${c.company}'s engineering team.

Best regards,

Ankush Upadhyay
Backend Engineer | Node.js, PostgreSQL, Redis, AWS
Phone: +91-8591684090
Email: ankush.upadhyay2000@gmail.com
Location: Mumbai, India
Notice Period: Immediate (0 Days)
LinkedIn: https://www.linkedin.com/in/aankush-upadhyay-5961441b6/
GitHub: https://github.com/Ankushsup`;

    if (isDryRun) {
      console.log(`🔎 [DRY-RUN PREVIEW] Would send to: ${c.company} <${c.email}>`);
      console.log(`   Subject: ${subject}\n`);
      sentCount++;
      continue;
    }

    // Live send
    console.log(`📤 Sending application to ${c.company} <${c.email}>...`);
    try {
      const info = await transporter.sendMail({
        from: `"Ankush Upadhyay" <${emailUser}>`,
        to: c.email,
        subject,
        text: bodyText,
        attachments: [
          {
            filename: 'Resume_Ankush_Upadhyay.pdf',
            path: RESUME_FILE
          }
        ]
      });

      console.log(`✅ [Delivered] ${c.company} (Message ID: ${info.messageId})`);
      sentCount++;

      // Log to applied jobs database
      appliedList.push({
        id: `hr-${c.company.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        title: 'Backend Developer (Direct HR Outreach)',
        company: c.company,
        source: 'HR_Outreach_List',
        method: 'DIRECT_HR_OUTREACH',
        target: c.email,
        status: 'SUBMITTED',
        messageId: info.messageId,
        appliedAt: new Date().toISOString()
      });

      fs.writeFileSync(APPLIED_FILE, JSON.stringify(appliedList, null, 2), 'utf-8');
      alreadyEmailed.add(emailLower);

      // 4-second polite delay between sends to protect Gmail sender reputation
      console.log(`⏳ Waiting 4 seconds before next send...\n`);
      await sleep(4000);
    } catch (err) {
      console.error(`❌ Failed sending to ${c.company} (${c.email}):`, err.message);
    }
  }

  console.log('======================================================');
  console.log(`🏁 [Campaign Finished] Processed: ${sentCount} | Skipped: ${skippedCount}`);
  console.log('======================================================');
}

runHROutreach();
