/**
 * ==============================================================================
 * 🎯 AUTO-PITCH QUEUED PORTAL JOBS TO REAL HRs
 * ==============================================================================
 * Takes existing READY_TO_SUBMIT jobs sitting in data/applied_jobs.json,
 * skips duplicates / incompatible stacks / foreign onsite roles, uses
 * HR Hunter 3.0 + SMTP RCPT TO verification to find real HR/Talent emails,
 * and pitches them directly with Ankush's tailored resume!
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { findHrEmail } = require('./email_scraper');
const { verifyEmailDeliverability } = require('./email_verifier');
const { getResumeProfile } = require('./resume_profile');
const { generateTailoredResume } = require('./resume_tailor');
const { NEGATIVE_TITLE_REGEX } = require('./rag_matcher');

const APPLIED_FILE = path.join(__dirname, 'data', 'applied_jobs.json');

function normalizeCompany(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/^(the|a)\s+/i, '')
    .replace(/\b(pvt|ltd|inc|llc|technologies|technology|solutions|services|software|ai|labs|group|corp|corporation)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function huntAndPitchReadyJobs(maxToSend = 15) {
  if (!fs.existsSync(APPLIED_FILE)) {
    console.log('No applied_jobs.json found.');
    return { sent: 0, checked: 0 };
  }

  const profile = getResumeProfile();
  const list = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));

  const contactedCompanies = new Set();
  const contactedDomains = new Set();
  list.forEach(item => {
    if (item.status === 'SUBMITTED' || item.status === 'BOUNCED') {
      if (item.company) contactedCompanies.add(normalizeCompany(item.company));
      if (item.target && item.target.includes('@')) {
        const d = item.target.split('@')[1]?.toLowerCase();
        if (d) contactedDomains.add(d);
      }
    }
  });

  const emailUser = process.env.EMAIL_USER || profile.email;
  const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');
  const mailTransporter = (emailUser && emailPass)
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: process.env.SMTP_SECURE !== 'false',
        auth: { user: emailUser, pass: emailPass }
      })
    : null;

  let checked = 0;
  let sent = 0;

  // Iterate newest READY_TO_SUBMIT jobs first
  for (let i = list.length - 1; i >= 0 && sent < maxToSend; i--) {
    const job = list[i];
    if (job.status !== 'READY_TO_SUBMIT') continue;

    const title = (job.title || '').trim();
    const company = (job.company || '').trim();
    const normComp = normalizeCompany(company);

    if (!company || !normComp || contactedCompanies.has(normComp)) continue;
    if (NEGATIVE_TITLE_REGEX.test(title) && !/\b(node|nodejs|nest|nestjs|express|react native)\b/i.test(title)) continue;

    checked++;
    console.log(`\n🔎 [${checked}] Hunting HR for queued job: "${title}" at "${company}"`);

    const hrEmail = await findHrEmail({
      company,
      title,
      url: job.target && job.target.startsWith('http') ? job.target : '',
      description: job.coverLetter || title
    });

    if (!hrEmail) {
      contactedCompanies.add(normComp);
      continue;
    }

    const dom = hrEmail.split('@')[1]?.toLowerCase();
    if (dom && contactedDomains.has(dom)) {
      console.log(`   ⏩ Domain @${dom} already contacted. Skipping.`);
      continue;
    }

    const check = await verifyEmailDeliverability(hrEmail);
    if (!check.valid) {
      console.log(`   🛡️ Blocked (${hrEmail}): ${check.reason}`);
      continue;
    }

    if (!mailTransporter) {
      console.log(`   ℹ️ Would pitch ${hrEmail}, but SMTP credentials missing.`);
      continue;
    }

    const pitchText = job.coverLetter ||
      `Dear ${company} Hiring Team,\n\nI am writing to apply for the ${title} position at ${company}. With ${profile.experienceYears}+ years of backend engineering experience in Node.js, TypeScript, NestJS, PostgreSQL, Redis, and AWS, I have architected low-latency WebRTC/Socket.io platforms serving 500+ concurrent users, implemented Keycloak RBAC security, and improved PostgreSQL query performance by 30-40%.\n\nI am immediately available to join (0 days notice period) and have attached my resume for your review.\n\nBest regards,\n${profile.fullName}\n${profile.phone} | ${profile.email}`;

    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:620px;line-height:1.6;color:#1e293b;">
  <p>${pitchText.replace(/\n/g, '<br>')}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
  <p style="font-size:13px;color:#64748b;">
    <strong>${profile.fullName}</strong><br>
    📞 ${profile.phone} | ✉️ ${profile.email}<br>
    🔗 <a href="${profile.linkedin}">LinkedIn</a> &nbsp;|&nbsp;
    💻 <a href="${profile.github}">GitHub</a><br>
    ⏰ Notice Period: <strong>${profile.noticePeriod}</strong><br>
    💰 Expected CTC: <strong>${profile.expectedCtc} (Flexible)</strong>
  </p>
</div>`;

    let attachmentPath = profile.resumePath;
    try {
      const tailored = await generateTailoredResume(company);
      if (fs.existsSync(tailored)) attachmentPath = tailored;
    } catch {}

    try {
      const info = await mailTransporter.sendMail({
        from: `"${profile.fullName}" <${emailUser}>`,
        to: hrEmail,
        subject: `Application for ${title} - ${profile.fullName} (3.5+ YOE Node.js | Immediate Joiner)`,
        text: pitchText,
        html: htmlBody,
        attachments: [{
          filename: `Resume_${profile.firstName}_${profile.lastName}_${company.replace(/[^a-zA-Z0-9]/g, '')}.pdf`,
          path: attachmentPath
        }]
      });

      list[i] = {
        ...job,
        method: 'DIRECT_EMAIL',
        target: hrEmail,
        status: 'SUBMITTED',
        messageId: info.messageId,
        appliedAt: new Date().toISOString()
      };
      fs.writeFileSync(APPLIED_FILE, JSON.stringify(list, null, 2), 'utf-8');

      contactedCompanies.add(normComp);
      if (dom) contactedDomains.add(dom);
      sent++;
      console.log(`   ✅ Pitched ${company} directly via ${hrEmail}!`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`   ❌ Send failed for ${hrEmail}:`, err.message);
    }
  }

  console.log(`\n🏁 [Queued HR Hunter Done] Checked: ${checked} | Direct HR Emails Sent: ${sent}`);
  return { checked, sent };
}

if (require.main === module) {
  huntAndPitchReadyJobs(15);
}

module.exports = { huntAndPitchReadyJobs };

