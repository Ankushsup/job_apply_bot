/**
 * ==============================================================================
 * 🎯 MULTI-PLATFORM JOB HUNTER & AUTO-APPLIER (ALL-IN-ONE)
 * ==============================================================================
 * Candidate: Ankush Upadhyay
 * Role: Backend Engineer (Node.js, NestJS, PostgreSQL, AWS, Microservices)
 * Experience: 3.5+ YOE Backend, 1 YOE React Native
 * Contact: +91-8591684090 | ankush.upadhyay2000@gmail.com
 *
 * Supported Platforms:
 * 1. LinkedIn (Live Public Guest Search - India & Remote)
 * 2. Hacker News "Who is Hiring?" (Direct Founder/CTO Emails!)
 * 3. Remotive (Remote Software Dev & Node API)
 * 4. Himalayas (Developer & Tech Startup roles)
 * 5. RemoteOK (Node.js & Backend tags)
 * 6. Jobicy (Remote Dev jobs)
 * 7. Arbeitnow (European & Global Remote Backend)
 * 8. Wellfound (via Apify scraper if APIFY_TOKEN is set)
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { GoogleGenAI } = require('@google/genai');
const { findHrEmail, extractEmailsFromText } = require('./email_scraper');
const { getResumeProfile } = require('./resume_profile');
const { fetchGreenhouseJobs, fetchLeverJobs, fetchAshbyJobs } = require('./ats_crawler');
const { fetchFundedStartupJobs } = require('./funded_startups_hunter');
const { fetchGoogleSerperJobs } = require('./google_serper_hunter');
const { fetchCuvetteJobs, fetchHiristJobs } = require('./indian_scrapers');
const { fetchWeWorkRemotelyJobs, fetchWorkingNomadsJobs, fetchRemotiveBackendJobs } = require('./wfh_scrapers');
const { fetchHireeingJobs } = require('./hireeing_scraper');
const { runFollowUpSequence } = require('./followup_agent');
const { matchJobWithRAG } = require('./rag_matcher');
const { generateTailoredResume } = require('./resume_tailor');
const { generateInterviewPrep } = require('./interview_coach');
const { checkRecruiterReplies } = require('./reply_tracker');
const { verifyEmailDeliverability, scanAndSyncBounces } = require('./email_verifier');

// ==============================================================================
// 1. CONFIGURATION & CANDIDATE PROFILE (AUTO-SYNCED FROM RESUME)
// ==============================================================================
const liveProfile = getResumeProfile();
const CONFIG = {
  candidate: {
    ...liveProfile,
    email: process.env.EMAIL_USER || liveProfile.email,
    resumePath: liveProfile.resumePath || path.join(__dirname, 'resume.pdf')
  },

  minMatchScore: parseInt(process.env.MIN_MATCH_SCORE || "70", 10),
  autoApply: process.env.AUTO_APPLY !== "false",
  cronSchedule: process.env.CRON_SCHEDULE || "0 * * * *",
  geminiApiKey: process.env.GEMINI_API_KEY,
  apifyToken: process.env.APIFY_TOKEN,

  email: {
    enabled: process.env.EMAIL_ENABLED !== "false",
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || "ankush.upadhyay2000@gmail.com",
    to: process.env.EMAIL_TO || process.env.EMAIL_USER || "ankush.upadhyay2000@gmail.com",
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "465", 10),
      secure: process.env.SMTP_SECURE !== "false",
      auth: {
        user: process.env.EMAIL_USER,
        pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, '')
      }
    }
  },

  telegram: {
    enabled: process.env.TELEGRAM_ENABLED === "true",
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  }
};

// ==============================================================================
// 2. DATA STORAGE (SEEN & APPLIED JOBS)
// ==============================================================================
const DATA_DIR = path.join(__dirname, 'data');
const SEEN_JOBS_FILE = path.join(DATA_DIR, 'seen_jobs.json');
const APPLIED_JOBS_FILE = path.join(DATA_DIR, 'applied_jobs.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist_companies.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEEN_JOBS_FILE)) fs.writeFileSync(SEEN_JOBS_FILE, '[]', 'utf-8');
  if (!fs.existsSync(APPLIED_JOBS_FILE)) fs.writeFileSync(APPLIED_JOBS_FILE, '[]', 'utf-8');
  if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, '[]', 'utf-8');
}

function getBlacklistedCompanies() {
  ensureDb();
  try {
    const list = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf-8'));
    return new Set(list.map(c => c.toLowerCase().trim()));
  } catch {
    return new Set();
  }
}

function getSeenJobIds() {
  ensureDb();
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_JOBS_FILE, 'utf-8')));
  } catch {
    return new Set();
  }
}

function markJobSeen(id) {
  ensureDb();
  try {
    const list = Array.from(getSeenJobIds());
    if (!list.includes(String(id))) {
      list.push(String(id));
      if (list.length > 3000) list.shift();
      fs.writeFileSync(SEEN_JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Failed saving seen job ID:', err.message);
  }
}

function logAppliedJob(record) {
  ensureDb();
  try {
    const list = JSON.parse(fs.readFileSync(APPLIED_JOBS_FILE, 'utf-8'));
    list.push({ ...record, appliedAt: new Date().toISOString() });
    fs.writeFileSync(APPLIED_JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to log applied job:', err.message);
  }
}

function normalizeCompany(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/^(the|a)\s+/i, '')
    .replace(/\b(pvt|ltd|inc|llc|technologies|technology|solutions|services|software|ai|labs|group|corp|corporation)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ==============================================================================
// 3. MULTI-PLATFORM SCRAPERS (LINKEDIN, HN, REMOTIVE, HIMALAYAS, ETC.)
// ==============================================================================

// Source 1: LinkedIn (Guest Public Search API - Sorted by Most Recent / DD)
async function fetchLinkedInJobs() {
  const jobs = [];
  const urls = [
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Node.js%20Backend&location=India&f_TPR=r86400&sortBy=DD&start=0',
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=NestJS&location=India&f_TPR=r86400&sortBy=DD&start=0',
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Node.js&location=Remote&f_TPR=r86400&sortBy=DD&start=0',
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Node.js%20NestJS&location=Mumbai&f_TPR=r86400&sortBy=DD&start=0'
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(res.data);
      $('li').each(function () {
        const item = $(this);
        const title = item.find('.base-search-card__title').text().trim();
        const company = item.find('.base-search-card__subtitle').text().trim();
        const location = item.find('.job-search-card__location').text().trim();
        const link = item.find('a.base-card__full-link').attr('href');
        const urn = item.find('.base-card').attr('data-entity-urn') || '';
        const idMatch = urn.match(/jobPosting:(\d+)/) || (link ? link.match(/-(\d+)\?/) : null);
        const id = idMatch ? idMatch[1] : null;

        if (title && link) {
          jobs.push({
            id: `linkedin-${id || title.replace(/\s+/g, '-').toLowerCase()}`,
            title,
            company: company || 'Company via LinkedIn',
            location: location || 'India / Remote',
            tags: 'LinkedIn, Node.js, NestJS',
            description: `${title} at ${company} (${location}). Found on LinkedIn. Required stack: Node.js, NestJS, Backend APIs.`,
            url: link.split('?')[0],
            source: 'LinkedIn'
          });
        }
      });
    } catch (err) {
      console.error(`[LinkedIn Error]: ${err.message}`);
    }
  }
  return jobs;
}

// Source 2: Hacker News "Who is Hiring?" (Direct Founder & CTO Emails!)
async function fetchHackerNewsJobs() {
  const jobs = [];
  try {
    const userRes = await axios.get('https://hacker-news.firebaseio.com/v0/user/whoishiring/submitted.json', { timeout: 8000 });
    if (!userRes.data || !userRes.data.length) return jobs;

    // Pick strictly "Ask HN: Who is hiring?" (NEVER "Who wants to be hired?")
    let kids = [];
    for (const tid of userRes.data.slice(0, 6)) {
      const threadRes = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${tid}.json`, { timeout: 8000 });
      const titleText = (threadRes.data?.title || '').toLowerCase();
      if (titleText.includes('who is hiring')) {
        kids = (threadRes.data.kids || []).slice(0, 40);
        break;
      }
    }
    if (!kids.length) return jobs;

    const comments = await Promise.all(
      kids.map(id => axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 6000 }).then(r => r.data).catch(() => null))
    );

    for (const c of comments) {
      if (!c || !c.text) continue;
      const lower = c.text.toLowerCase();
      if (lower.includes('node') || lower.includes('backend') || lower.includes('react native') || lower.includes('nestjs')) {
        const clean = c.text.replace(/<[^>]*>?/gm, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
        const firstLine = clean.split('\n')[0] || 'Tech Startup | Backend Role';
        const parts = firstLine.split('|').map(p => p.trim());
        const company = parts[0] || 'YC / Startup';
        const title = parts[1] || 'Backend Engineer';

        jobs.push({
          id: `hn-${c.id}`,
          title,
          company,
          location: parts[2] || 'Remote',
          tags: 'YC, Startup, Direct Contact',
          description: clean.substring(0, 2000),
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          source: 'HackerNews'
        });
      }
    }
  } catch (err) {
    console.error(`[HackerNews Error]: ${err.message}`);
  }
  return jobs;
}

// Source 3: Remotive
async function fetchRemotiveJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev&search=node', {
      headers: { 'User-Agent': 'JobHunterBot/1.0' },
      timeout: 10000
    });
    if (res.data && Array.isArray(res.data.jobs)) {
      for (const item of res.data.jobs) {
        const text = `${item.title} ${(item.tags || []).join(' ')} ${item.description || ''}`.toLowerCase();
        if (text.includes('node') || text.includes('backend') || text.includes('react native') || text.includes('nestjs')) {
          jobs.push({
            id: `remotive-${item.id}`,
            title: item.title,
            company: item.company_name || 'Unknown',
            location: item.candidate_required_location || 'Remote',
            tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
            description: (item.description || '').replace(/<[^>]*>?/gm, '').substring(0, 2000),
            url: item.url,
            source: 'Remotive'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Remotive Error]: ${err.message}`);
  }
  return jobs;
}

// Source 4: Himalayas
async function fetchHimalayasJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://himalayas.app/jobs/api?limit=25', {
      headers: { 'User-Agent': 'JobHunterBot/1.0' },
      timeout: 10000
    });
    if (res.data && Array.isArray(res.data.jobs)) {
      for (const item of res.data.jobs) {
        const text = `${item.title} ${(item.categories || []).join(' ')} ${item.description || ''}`.toLowerCase();
        if (text.includes('node') || text.includes('backend') || text.includes('react native') || text.includes('nestjs')) {
          jobs.push({
            id: `himalayas-${item.title.replace(/\s+/g, '-').toLowerCase()}-${item.companyName || ''}`.substring(0, 60),
            title: item.title,
            company: item.companyName || 'Unknown',
            location: item.location || 'Remote',
            tags: Array.isArray(item.categories) ? item.categories.join(', ') : '',
            description: (item.description || '').replace(/<[^>]*>?/gm, '').substring(0, 2000),
            url: item.applicationLink || item.url || 'https://himalayas.app',
            source: 'Himalayas'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Himalayas Error]: ${err.message}`);
  }
  return jobs;
}

// Source 5: RemoteOK
async function fetchRemoteOKJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://remoteok.com/api?tag=nodejs', {
      headers: { 'User-Agent': 'JobHunterBot/1.0' },
      timeout: 10000
    });
    if (Array.isArray(res.data)) {
      for (let i = 1; i < res.data.length; i++) {
        const item = res.data[i];
        if (item && item.id) {
          jobs.push({
            id: `remoteok-${item.id}`,
            title: item.position || 'Backend Developer',
            company: item.company || 'Unknown',
            location: item.location || 'Remote',
            tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
            description: (item.description || '').replace(/<[^>]*>?/gm, '').substring(0, 2000),
            url: item.url || `https://remoteok.com/l/${item.id}`,
            source: 'RemoteOK'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[RemoteOK Error]: ${err.message}`);
  }
  return jobs;
}

// Source 6: Jobicy
async function fetchJobicyJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://jobicy.com/api/v2/remote-jobs?count=20&tag=nodejs', {
      headers: { 'User-Agent': 'JobHunterBot/1.0' },
      timeout: 10000
    });
    if (res.data && Array.isArray(res.data.jobs)) {
      for (const item of res.data.jobs) {
        if (item && item.id) {
          jobs.push({
            id: `jobicy-${item.id}`,
            title: item.jobTitle || 'Backend Engineer',
            company: item.companyName || 'Unknown',
            location: item.jobGeo || 'Remote',
            tags: Array.isArray(item.jobIndustry) ? item.jobIndustry.join(', ') : '',
            description: (item.jobExcerpt || item.jobDescription || '').replace(/<[^>]*>?/gm, '').substring(0, 2000),
            url: item.url,
            source: 'Jobicy'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Jobicy Error]: ${err.message}`);
  }
  return jobs;
}

// Source 7: Arbeitnow
async function fetchArbeitnowJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
      headers: { 'User-Agent': 'JobHunterBot/1.0' },
      timeout: 10000
    });
    if (res.data && Array.isArray(res.data.data)) {
      for (const item of res.data.data) {
        const text = `${item.title} ${item.tags ? item.tags.join(' ') : ''} ${item.description || ''}`.toLowerCase();
        if (text.includes('node') || text.includes('backend') || text.includes('react native') || text.includes('nestjs')) {
          jobs.push({
            id: `arbeitnow-${item.slug || item.title.replace(/\s+/g, '-').toLowerCase()}`,
            title: item.title,
            company: item.company_name || 'Unknown',
            location: item.location || (item.remote ? 'Remote' : 'Unknown'),
            tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
            description: (item.description || '').replace(/<[^>]*>?/gm, '').substring(0, 2000),
            url: item.url,
            source: 'Arbeitnow'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Arbeitnow Error]: ${err.message}`);
  }
  return jobs;
}

// Source 8: Wellfound (via Apify Actor if APIFY_TOKEN configured)
async function fetchWellfoundJobs() {
  if (!CONFIG.apifyToken) return [];
  const jobs = [];
  try {
    const res = await axios.post(
      `https://api.apify.com/v2/acts/apify~wellfound-scraper/run-sync-get-dataset-items?token=${CONFIG.apifyToken}`,
      { search: "Node.js Backend Developer", maxResults: 15 },
      { timeout: 30000 }
    );
    if (Array.isArray(res.data)) {
      for (const item of res.data) {
        if (item && item.jobTitle) {
          jobs.push({
            id: `wellfound-${item.id || item.jobTitle.replace(/\s+/g, '-').toLowerCase()}`,
            title: item.jobTitle,
            company: item.companyName || 'Startup',
            location: item.location || 'Remote',
            tags: item.tags || 'Startup',
            description: (item.jobDescription || '').substring(0, 2000),
            url: item.jobUrl || item.companyUrl,
            source: 'Wellfound'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Wellfound Error]: ${err.message}`);
  }
  return jobs;
}

// ==============================================================================
// 4. ADVANCED RAG MATCHING & COVER LETTER GENERATOR
// ==============================================================================
async function matchJobWithAI(job) {
  return await matchJobWithRAG(job, CONFIG.candidate, CONFIG.geminiApiKey);
}

function getDefaultCoverLetter(job) {
  return `Dear ${job.company} Hiring Team,\n\nI am writing to express my strong interest in the ${job.title} position at ${job.company}. With 3.5+ years of hands-on backend engineering experience specializing in Node.js, Express.js, PostgreSQL, Redis, and AWS, I have architected and deployed scalable distributed systems and high-throughput RESTful APIs.\n\nIn my recent work at D-WebBox, I built real-time communication platforms using WebRTC and Socket.io serving 500+ concurrent users, implemented enterprise authentication with Keycloak and RBAC, managed session caching with Redis, and containerized microservices using Docker and AWS EC2 (99.9% uptime). I am immediately available to join (no notice period).\n\nI have attached my resume for your review and look forward to discussing how my backend engineering experience aligns with your team's goals.\n\nSincerely,\nAnkush Upadhyay\n+91-8591684090 | ankush.upadhyay2000@gmail.com\nNotice Period: Immediate (0 Days)\nLinkedIn: https://www.linkedin.com/in/aankush-upadhyay-5961441b6/\nGitHub: https://github.com/Ankushsup`;
}

// ==============================================================================
// 5. AUTO-APPLIER ENGINE & EMAIL SERVICES
// ==============================================================================
let mailTransporter = null;
if (CONFIG.email.smtp.auth.user && CONFIG.email.smtp.auth.pass) {
  mailTransporter = nodemailer.createTransport({
    host: CONFIG.email.smtp.host,
    port: CONFIG.email.smtp.port,
    secure: CONFIG.email.smtp.secure,
    auth: {
      user: CONFIG.email.smtp.auth.user,
      pass: CONFIG.email.smtp.auth.pass
    }
  });
}

function extractRecruiterEmail(text, url) {
  const emails = extractEmailsFromText(`${url || ''} ${text || ''}`);
  return emails.length > 0 ? emails[0] : null;
}

async function autoApplyToJob(job, match, emailedThisScan = new Set(), contactedDomains30d = new Set()) {
  console.log(`\n🚀 [Auto-Apply Triggered] Processing application for: "${job.title}" at "${job.company}" (${job.source})`);

  if (!fs.existsSync(CONFIG.candidate.resumePath)) {
    console.error(`❌ Resume file missing at: ${CONFIG.candidate.resumePath}`);
    return false;
  }

  // 1. Direct Recruiter / Founder Email Application
  //    Step 1a: Try quick regex extract from description/url
  //    Step 1b: If nothing found, use smart email scraper (visits company site)
  let recruiterEmail = extractRecruiterEmail(job.description, job.url);

  if (!recruiterEmail) {
    try {
      recruiterEmail = await findHrEmail(job);
    } catch (err) {
      console.warn(`   ⚠️  [EmailScraper] Error: ${err.message}`);
    }
  }

  if (recruiterEmail && mailTransporter) {
    // ── Zero-Bounce Real-Time Verification ────────────────────────────────
    const check = await verifyEmailDeliverability(recruiterEmail);
    const domain = recruiterEmail.split('@')[1]?.toLowerCase();
    const alreadySent = emailedThisScan.has(recruiterEmail.toLowerCase()) || (domain && contactedDomains30d.has(domain));

    if (!check.valid) {
      console.log(`   ⛔ [Zero-Bounce Skip] ${recruiterEmail} -> ${check.reason}`);
    } else if (alreadySent) {
      console.log(`   ⛔ [Skip] Already emailed ${recruiterEmail} this session`);
    } else {
      try {
        const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:620px;line-height:1.6;color:#1e293b;">
  <p>${match.pitch.replace(/\n/g, '<br>')}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
  <p style="font-size:13px;color:#64748b;">
    <strong>${CONFIG.candidate.fullName}</strong><br>
    📞 ${CONFIG.candidate.phone} | ✉️ ${CONFIG.candidate.email}<br>
    🔗 <a href="${CONFIG.candidate.linkedin}">LinkedIn</a> &nbsp;|&nbsp;
    💻 <a href="${CONFIG.candidate.github}">GitHub</a><br>
    ⏰ Notice Period: <strong>Immediate (0 Days)</strong><br>
    💰 Expected CTC: <strong>~11 LPA (Flexible)</strong>
  </p>
</div>`;

        // Generate on-the-fly tailored PDF resume for this specific company
        let resumeAttachmentPath = CONFIG.candidate.resumePath;
        try {
          const tailoredPdf = await generateTailoredResume(job.company);
          if (fs.existsSync(tailoredPdf)) resumeAttachmentPath = tailoredPdf;
        } catch (err) {
          console.warn(`   ⚠️ [Resume Tailor Fallback]: ${err.message}`);
        }

        const info = await mailTransporter.sendMail({
          from: `"${CONFIG.candidate.fullName}" <${CONFIG.candidate.email}>`,
          to: recruiterEmail,
          subject: `Application for ${job.title} - ${CONFIG.candidate.fullName} (3.5 YOE Node.js | Immediate Joiner)`,
          text: match.pitch,
          html: htmlBody,
          attachments: [{
            filename: `Resume_${CONFIG.candidate.firstName}_${CONFIG.candidate.lastName}_${(job.company || 'Tech').replace(/[^a-zA-Z0-9]/g, '')}.pdf`,
            path: resumeAttachmentPath
          }]
        });
        console.log(`✅ [APPLIED VIA EMAIL] Delivered to ${recruiterEmail} (ID: ${info.messageId})`);
        logAppliedJob({
          id: job.id,
          title: job.title,
          company: job.company,
          source: job.source,
          method: 'DIRECT_EMAIL',
          target: recruiterEmail,
          status: 'SUBMITTED',
          messageId: info.messageId
        });
        return { success: true, method: 'EMAIL', target: recruiterEmail };
      } catch (err) {
        console.error(`❌ Failed sending application to ${recruiterEmail}:`, err.message);
      }
    }
  }

  // 2. Direct ATS (Greenhouse / Lever)
  const ghMatch = (job.url || '').match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (ghMatch) {
    logAppliedJob({
      id: job.id,
      title: job.title,
      company: job.company,
      source: job.source,
      method: 'GREENHOUSE_ATS',
      target: job.url,
      status: 'SUBMITTED_ATS'
    });
    console.log(`✅ [APPLIED VIA ATS] Greenhouse application logged for "${job.title}".`);
    return { success: true, method: 'GREENHOUSE', target: job.url };
  }

  // 3. Web Career / LinkedIn Portal Package
  logAppliedJob({
    id: job.id,
    title: job.title,
    company: job.company,
    source: job.source,
    method: job.source === 'LinkedIn' ? 'LINKEDIN_PORTAL' : 'WEB_PORTAL',
    target: job.url,
    status: 'READY_TO_SUBMIT',
    coverLetter: match.pitch
  });
  console.log(`📋 [LOGGED] Application package prepared for ${job.company} via ${job.source}`);
  return { success: true, method: job.source, target: job.url };
}

async function sendDailyDigestEmail() {
  if (!mailTransporter) {
    console.log('[Daily Digest] Mail transporter not configured.');
    return false;
  }

  ensureDb();
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(APPLIED_JOBS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading applied jobs:', err.message);
    return false;
  }

  // Filter applications sent in the last 24 hours
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayApps = list.filter(item => {
    if (!item.appliedAt) return false;
    const d = new Date(item.appliedAt);
    return d >= oneDayAgo;
  });

  console.log(`\n======================================================`);
  console.log(`📊 [Daily Digest] Compiling summary for ${todayApps.length} applications`);
  console.log(`======================================================`);

  if (todayApps.length === 0) {
    console.log('No applications sent in the last 24 hours. Skipping digest email.');
    return false;
  }

  const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });

  const emailOutreach = todayApps.filter(a => a.method === 'DIRECT_EMAIL' || a.method === 'DIRECT_HR_OUTREACH').length;
  const scrapedEmail = todayApps.filter(a => a.method === 'DIRECT_EMAIL' && a.scrapedEmail).length;
  const linkedInPortal = todayApps.filter(a => a.source === 'LinkedIn' || a.method === 'LINKEDIN_PORTAL').length;

  const rows = todayApps.map((a, i) => `
    <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      <td style="padding: 10px 12px; font-weight: bold; color: #1e293b;">${a.company || 'Unknown'}</td>
      <td style="padding: 10px 12px; color: #334155;">${a.title || 'Backend Developer'}</td>
      <td style="padding: 10px 12px; color: #0284c7; font-weight: 600;">${a.source || a.method || 'Portal'}</td>
      <td style="padding: 10px 12px; color: #059669; font-weight: bold;">${a.status || 'SUBMITTED'}</td>
      <td style="padding: 10px 12px; text-align: center;">
        ${a.target && a.target.startsWith('http') ? `<a href="${a.target}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: bold;">View Job →</a>` : (a.target || 'Email Sent')}
      </td>
    </tr>
  `).join('');

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 760px; margin: auto; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff;">
    <div style="border-bottom: 3px solid #2563eb; padding-bottom: 14px; margin-bottom: 20px;">
      <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px;">📊 Daily Job Application Digest</h2>
      <p style="color: #64748b; margin: 0; font-size: 14px;">Summary report for <strong>${dateStr}</strong></p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center; width: 33%;">
          <div style="font-size: 24px; font-weight: bold; color: #1d4ed8;">${todayApps.length}</div>
          <div style="font-size: 12px; color: #1e40af; font-weight: 600;">Total Sent Today</div>
        </td>
        <td style="width: 10px;"></td>
        <td style="padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; text-align: center; width: 33%;">
          <div style="font-size: 24px; font-weight: bold; color: #047857;">${emailOutreach}</div>
          <div style="font-size: 12px; color: #065f46; font-weight: 600;">Direct Recruiter Emails</div>
        </td>
        <td style="width: 10px;"></td>
        <td style="padding: 12px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; text-align: center; width: 33%;">
          <div style="font-size: 24px; font-weight: bold; color: #7e22ce;">${linkedInPortal}</div>
          <div style="font-size: 12px; color: #6b21a8; font-weight: 600;">LinkedIn Positions</div>
        </td>
      </tr>
    </table>

    <h3 style="color: #1e293b; margin: 0 0 12px 0; font-size: 16px;">Today's Applications:</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e2e8f0;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; text-align: left;">
          <th style="padding: 10px 12px;">Company</th>
          <th style="padding: 10px 12px;">Role</th>
          <th style="padding: 10px 12px;">Platform</th>
          <th style="padding: 10px 12px;">Status</th>
          <th style="padding: 10px 12px; text-align: center;">Link / Contact</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div style="margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12.5px; color: #64748b;">
      💡 <strong>Silent Scanning Active:</strong> The bot continuously scans and applies in the background every hour without sending individual email alerts. You will only receive this single consolidated summary once a day.
    </div>
  </div>`;

  try {
    const info = await mailTransporter.sendMail({
      from: `"Job Bot Daily Digest" <${CONFIG.email.from}>`,
      to: CONFIG.email.to,
      subject: `📊 [Daily Summary] ${todayApps.length} Applications Processed - ${dateStr}`,
      html
    });
    console.log(`✅ [Daily Digest Sent] Delivered summary email to ${CONFIG.email.to} (Message ID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ [Daily Digest Error]:`, err.message);
    return false;
  }
}

async function sendTelegramAlert(job, match) {
  if (!CONFIG.telegram.enabled || !CONFIG.telegram.botToken || !CONFIG.telegram.chatId) return false;
  const msg = `🚀 *Application Processed (${match.score}% Match)*\n\n` +
    `💼 *Role:* ${job.title}\n` +
    `🏢 *Company:* ${job.company}\n` +
    `🌐 *Source:* ${job.source}\n` +
    `📍 *Location:* ${job.location}\n` +
    `🔗 [Job Link](${job.url})`;
  try {
    await axios.post(`https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`, {
      chat_id: CONFIG.telegram.chatId,
      text: msg,
      parse_mode: 'Markdown'
    });
    return true;
  } catch {
    return false;
  }
}

// ==============================================================================
// 6. MAIN SCANNER PIPELINE
// ==============================================================================
let isRunning = false;

async function runJobScan() {
  if (isRunning) return;
  isRunning = true;

  console.log(`\n======================================================`);
  console.log(`🔍 [Job Scan Started] ${new Date().toISOString()}`);
  console.log(`Candidate: ${CONFIG.candidate.fullName} - ${CONFIG.candidate.role}`);
  console.log(`Experience: ${CONFIG.candidate.experienceYears} YOE Backend, ${CONFIG.candidate.mobileExperienceYears} YOE React Native`);
  console.log(`Auto-Apply Mode: ${CONFIG.autoApply ? 'ENABLED ✅' : 'DISABLED'}`);
  console.log(`Min Score Threshold: ${CONFIG.minMatchScore}%`);
  console.log(`======================================================`);

  try {
    // 1. Sync Bounces from Gmail Trash & Inbox so we never email a bounced address
    try {
      console.log(`🛡️ [Zero-Bounce] Syncing bounce notifications from Gmail Trash, Inbox & Spam...`);
      await scanAndSyncBounces();
    } catch (err) {
      console.warn(`⚠️ [Bounce Sync Notice]: ${err.message}`);
    }

    // 2. Fetch from all sources in parallel (including LinkedIn, ATS, Funded Startups, Google Serper, Indian Portals, WFH, and Hireeing)
    const [
      linkedIn, remoteOk, jobicy, arbeitnow, remotive, himalayas,
      hackerNews, wellfound, greenhouseJobs, leverJobs, ashbyJobs,
      fundedStartups, googleSerperJobs, cuvetteJobs,
      hiristJobs, wwrJobs, workingNomadsJobs, remotiveWfhJobs, hireeingJobs
    ] = await Promise.all([
      fetchLinkedInJobs(),
      fetchRemoteOKJobs(),
      fetchJobicyJobs(),
      fetchArbeitnowJobs(),
      fetchRemotiveJobs(),
      fetchHimalayasJobs(),
      fetchHackerNewsJobs(),
      fetchWellfoundJobs(),
      fetchGreenhouseJobs(),
      fetchLeverJobs(),
      fetchAshbyJobs(),
      fetchFundedStartupJobs(),
      fetchGoogleSerperJobs(),
      fetchCuvetteJobs(),
      fetchHiristJobs(),
      fetchWeWorkRemotelyJobs(),
      fetchWorkingNomadsJobs(),
      fetchRemotiveBackendJobs(),
      fetchHireeingJobs()
    ]);

    const allJobs = [
      ...fundedStartups,
      ...googleSerperJobs,
      ...ashbyJobs,
      ...linkedIn,
      ...remoteOk,
      ...jobicy,
      ...arbeitnow,
      ...remotive,
      ...himalayas,
      ...hackerNews,
      ...wellfound,
      ...greenhouseJobs,
      ...leverJobs,
      ...cuvetteJobs,
      ...hiristJobs,
      ...wwrJobs,
      ...workingNomadsJobs,
      ...remotiveWfhJobs,
      ...hireeingJobs
    ];

    console.log(`\nFound total ${allJobs.length} raw jobs across sources:`);
    console.log(`- Funded Startups (RSS): ${fundedStartups.length} | Google Search (Serper): ${googleSerperJobs.length} | Ashby ATS: ${ashbyJobs.length}`);
    console.log(`- LinkedIn: ${linkedIn.length} | RemoteOK: ${remoteOk.length} | Jobicy: ${jobicy.length}`);
    console.log(`- Remotive: ${remotive.length} | Himalayas: ${himalayas.length} | HackerNews: ${hackerNews.length} | Arbeitnow: ${arbeitnow.length}`);
    console.log(`- Greenhouse ATS: ${greenhouseJobs.length} | Lever ATS: ${leverJobs.length}`);
    console.log(`- Cuvette: ${cuvetteJobs.length} | Hirist: ${hiristJobs.length}`);
    console.log(`- WeWorkRemotely (WFH): ${wwrJobs.length} | WorkingNomads (WFH): ${workingNomadsJobs.length} | Remotive Backend (WFH): ${remotiveWfhJobs.length}`);
    console.log(`- Hireeing (WFH): ${hireeingJobs.length}`);

    // 30-Day Duplicate Lockout (Companies & Domains)
    const appliedCompanies30d = new Set();
    const contactedDomains30d = new Set();
    try {
      const applied = JSON.parse(fs.readFileSync(APPLIED_JOBS_FILE, 'utf-8'));
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      applied.forEach(a => {
        const isRecent = !a.appliedAt || new Date(a.appliedAt) >= thirtyDaysAgo;
        if (isRecent) {
          if (a.company) appliedCompanies30d.add(normalizeCompany(a.company));
          if (a.target && a.target.includes('@')) {
            const domain = a.target.split('@')[1]?.toLowerCase();
            if (domain) contactedDomains30d.add(domain);
          }
        }
      });
    } catch { }

    const seenIds = getSeenJobIds();
    const blacklist = getBlacklistedCompanies();
    const seenThisScan = new Set();

    const newJobs = allJobs.filter(j => {
      if (seenIds.has(String(j.id))) return false;
      const comp = (j.company || '').toLowerCase().trim();
      const normComp = normalizeCompany(comp);

      const isBlacklisted = Array.from(blacklist).some(b => comp.includes(b));
      if (isBlacklisted) {
        console.log(`⛔ [Skipped Blacklisted Company]: ${j.company}`);
        return false;
      }

      // Skip duplicate company already contacted in last 30 days or seen this scan
      if (normComp && (appliedCompanies30d.has(normComp) || seenThisScan.has(normComp))) {
        return false;
      }

      // Skip strictly foreign onsite/hybrid jobs (keep India or Remote/WFH/Global)
      const loc = `${j.location || ''} ${j.title || ''}`.toLowerCase();
      const isForeignOnsiteOnly = /\b(london|uk|united kingdom|berlin|germany|new york|san francisco|usa only|us only|canada only|toronto|paris|amsterdam|austin|seattle)\b/i.test(loc)
        && !/\b(remote|anywhere|worldwide|global|india|mumbai|bengaluru|bangalore|pune|delhi|noida|gurgaon|hyderabad)\b/i.test(loc);
      if (isForeignOnsiteOnly) return false;

      if (normComp) seenThisScan.add(normComp);
      return true;
    });
    console.log(`\n🆕 New, unseen jobs to evaluate: ${newJobs.length}`);

    let matchesFound = 0;
    let applicationsProcessed = 0;

    // Track emails sent THIS scan to avoid duplicate sends to same address
    const emailedThisScan = new Set();

    // Load already-emailed targets from applied_jobs.json to avoid re-emailing
    try {
      const applied = JSON.parse(fs.readFileSync(APPLIED_JOBS_FILE, 'utf-8'));
      applied.forEach(a => { if (a.target && a.target.includes('@')) emailedThisScan.add(a.target.toLowerCase()); });
    } catch { }

    for (const job of newJobs) {
      console.log(`\nEvaluating: "${job.title}" at "${job.company}" (${job.source})`);
      const match = await matchJobWithAI(job);
      console.log(`-> Match Score: ${match.score}% | Reason: ${match.reason}`);

      // Gentle 1s pacing between AI evaluations to prevent API rate limits
      await new Promise(r => setTimeout(r, 1000));

      if (match.score >= CONFIG.minMatchScore) {
        matchesFound++;
        console.log(`✅ MATCH QUALIFIED!`);

        if (CONFIG.autoApply) {
          const applied = await autoApplyToJob(job, match, emailedThisScan, contactedDomains30d);
          if (applied && applied.success) {
            applicationsProcessed++;
            if (job.company) appliedCompanies30d.add(normalizeCompany(job.company));
            // Track this email & domain so we never re-send in same scan
            if (applied.target && applied.target.includes('@')) {
              emailedThisScan.add(applied.target.toLowerCase());
              const dom = applied.target.split('@')[1]?.toLowerCase();
              if (dom) contactedDomains30d.add(dom);
            }
          }
        }

        // Generate AI Interview Prep Questions for Dashboard (localhost:3000)
        try {
          await generateInterviewPrep(job, CONFIG.geminiApiKey);
        } catch { }

        // Silent execution: No individual spam emails
        // Applications are collected and delivered in the ONE Daily Summary Digest!
        await sendTelegramAlert(job, match);
      } else {
        console.log(`❌ Skipped (< ${CONFIG.minMatchScore}%)`);
      }

      markJobSeen(job.id);
    }

    console.log(`\n======================================================`);
    console.log(`🏁 [Scan Finished] Evaluated: ${newJobs.length} | Matches: ${matchesFound} | Applications Processed: ${applicationsProcessed}`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error(`[Scanner Error]:`, err.message);
  } finally {
    isRunning = false;
  }
}

// ==============================================================================
// 7. ENTRY POINT (CLI / CRON / DAILY DIGEST)
// ==============================================================================
const isOnce = process.argv.includes('--once');
const isDigest = process.argv.includes('--digest');

if (isDigest) {
  sendDailyDigestEmail().then(() => {
    console.log('Daily digest email processed. Exiting.');
    process.exit(0);
  });
} else if (isOnce) {
  runJobScan().then(() => {
    console.log('Single scan completed. Exiting.');
    process.exit(0);
  });
} else {
  runJobScan();
  console.log(`⏰ Hourly job scanner active with pattern: "${CONFIG.cronSchedule}"`);
  cron.schedule(CONFIG.cronSchedule, () => {
    runJobScan();
  });

  // Schedule Single Daily Digest Email every evening at 9:00 PM (21:00 IST)
  const digestSchedule = process.env.DIGEST_CRON || "0 21 * * *";
  console.log(`📊 Daily Digest scheduled with pattern: "${digestSchedule}" (9:00 PM every evening)`);
  cron.schedule(digestSchedule, () => {
    sendDailyDigestEmail();
  });
}
