/**
 * ==============================================================================
 * 💼 FREELANCE & CONTRACT ENGINE FOR ANKUSH UPADHYAY
 * ==============================================================================
 * Aggregates high-value freelance contracts & client gigs:
 * - Sources: Remotive Contract, Jobicy Freelance, WeWorkRemotely Contract,
 *            Arbeitnow Contract, Hirist C2H, Cuvette Contract.
 * - Tech Stack: Node.js, NestJS, PostgreSQL, React Native, WebRTC, APIs.
 * - Generates high-converting, winning client proposals ready to copy & paste.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const DATA_DIR = path.join(__dirname, 'data');
const FREELANCE_FILE = path.join(DATA_DIR, 'freelance_jobs.json');

const CANDIDATE = {
  name: "Ankush Upadhyay",
  email: "ankush.upadhyay2000@gmail.com",
  phone: "+91-8591684090",
  experience: "3.5+ years Backend (Node.js/NestJS/PostgreSQL), 1 year React Native",
  portfolio: "https://github.com/Ankushsup",
  availability: "Immediately Available (0 Days Notice / Can start today)"
};

function generateProposal(job) {
  const title = job.title || 'Backend Engineer';
  const comp = job.company || 'Client';

  return `Hi ${comp} Team,

I saw your posting for "${title}" and would love to help you build and ship this immediately.

Why I am a strong fit for this contract:
1. 3.5+ Years Production Backend: Specializing in Node.js, NestJS, and PostgreSQL, building clean microservices, high-throughput RESTful APIs, and scalable database schemas.
2. Real-Time & Security Scale: In my recent work, I built real-time WebRTC and Socket.io platforms handling 500+ concurrent live users, implemented enterprise Keycloak RBAC, and containerized deployments via Docker & AWS EC2.
3. Full-Stack / Mobile Coordination: With 1 year of hands-on React Native experience, I ensure tight coordination between backend endpoints and frontend mobile clients.
4. Immediate Availability: I can start immediately (0 days notice) and commit dedicated hours to hit your milestones rapidly.

Portfolio & Code:
• GitHub: ${CANDIDATE.portfolio}
• Direct Contact: ${CANDIDATE.phone} | ${CANDIDATE.email}

Let's connect for a brief 10-minute call to discuss your architecture and get started right away.

Best regards,
${CANDIDATE.name}
Full-Stack & Backend Engineer`;
}

async function scrapeFreelanceJobs() {
  const jobs = [];
  console.log('\n💼 [FREELANCE ENGINE] Scanning verified contract & freelance boards...');

  // 1. Remotive Contract / Freelance
  try {
    const res = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev', { timeout: 8000 });
    const list = res.data.jobs || [];
    for (const item of list) {
      const type = (item.job_type || '').toLowerCase();
      const text = `${item.title} ${item.tags ? item.tags.join(' ') : ''} ${item.description || ''}`.toLowerCase();
      const isContract = type.includes('contract') || type.includes('freelance') || text.includes('contract') || text.includes('freelance');
      const isTechMatch = text.includes('node') || text.includes('backend') || text.includes('react native') || text.includes('nestjs') || text.includes('api') || text.includes('postgres');

      if (isContract && isTechMatch) {
        jobs.push({
          id: `freelance-remotive-${item.id}`,
          title: item.title,
          company: item.company_name,
          source: 'Remotive Contract',
          type: 'Contract / Freelance',
          rate: item.salary || 'Competitive Hourly / Milestone',
          url: item.url,
          description: (item.description || '').replace(/<[^>]*>?/gm, '').substring(0, 1000),
          proposal: generateProposal({ title: item.title, company: item.company_name }),
          foundAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    console.error('[Freelance Remotive Error]:', err.message);
  }

  // 2. WeWorkRemotely Contract Gigs
  try {
    const res = await axios.get('https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss', { timeout: 8000 });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $('item').each((i, el) => {
      const rawTitle = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
      const desc = $(el).find('description').text().trim();
      const combined = `${rawTitle} ${desc}`.toLowerCase();

      if (combined.includes('contract') || combined.includes('freelance') || combined.includes('part-time')) {
        let comp = 'Remote Client';
        let cleanTitle = rawTitle;
        if (rawTitle.includes(':')) {
          const parts = rawTitle.split(':');
          comp = parts[0].trim();
          cleanTitle = parts.slice(1).join(':').trim();
        }

        jobs.push({
          id: `freelance-wwr-${link.split('/').filter(Boolean).pop()}`,
          title: cleanTitle,
          company: comp,
          source: 'WeWorkRemotely Contract',
          type: 'Freelance Contract',
          rate: 'USD Hourly / Fixed Milestone',
          url: link,
          description: desc.replace(/<[^>]*>?/gm, '').substring(0, 1000),
          proposal: generateProposal({ title: cleanTitle, company: comp }),
          foundAt: new Date().toISOString()
        });
      }
    });
  } catch (err) {
    console.error('[Freelance WWR Error]:', err.message);
  }

  // 3. Arbeitnow Contract Developer Roles
  try {
    const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', { timeout: 8000 });
    const list = res.data.data || [];
    for (const item of list) {
      const types = (item.job_types || []).map(t => t.toLowerCase()).join(' ');
      const text = `${item.title} ${item.tags ? item.tags.join(' ') : ''} ${item.description || ''}`.toLowerCase();
      const isContract = types.includes('contract') || types.includes('freelance') || types.includes('befristeter');
      const isTechMatch = text.includes('node') || text.includes('backend') || text.includes('react native') || text.includes('nestjs') || text.includes('developer');

      if (isContract && isTechMatch) {
        jobs.push({
          id: `freelance-arbeitnow-${item.slug || item.title.replace(/\s+/g, '-').toLowerCase()}`,
          title: item.title,
          company: item.company_name,
          source: 'Arbeitnow Contract',
          type: 'Contract (FTC / Freelance)',
          rate: 'Hourly / Monthly Contract',
          url: item.url,
          description: (item.description || '').replace(/<[^>]*>?/gm, '').substring(0, 1000),
          proposal: generateProposal({ title: item.title, company: item.company_name }),
          foundAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    console.error('[Freelance Arbeitnow Error]:', err.message);
  }

  // 4. Jobicy Freelance Developer Feed
  try {
    const res = await axios.get('https://jobicy.com/api/v2/remote-jobs?count=50&tag=backend', { timeout: 8000 });
    const list = res.data.jobs || [];
    for (const item of list) {
      const type = (Array.isArray(item.jobType) ? item.jobType.join(' ') : (item.jobType || '')).toLowerCase();
      if (type.includes('contract') || type.includes('freelance') || (item.jobTitle || '').toLowerCase().includes('contract')) {
        jobs.push({
          id: `freelance-jobicy-${item.id}`,
          title: item.jobTitle,
          company: item.companyName,
          source: 'Jobicy Freelance',
          type: 'Freelance / Contract',
          rate: item.annualSalaryMin ? `$${item.annualSalaryMin} - $${item.annualSalaryMax}` : 'Milestone Based',
          url: item.url,
          description: (item.jobDescription || '').replace(/<[^>]*>?/gm, '').substring(0, 1000),
          proposal: generateProposal({ title: item.jobTitle, company: item.companyName }),
          foundAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    console.error('[Freelance Jobicy Error]:', err.message);
  }

  console.log(`✅ Discovered ${jobs.length} qualified freelance & contract gigs for Ankush!`);

  // Persist to database
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FREELANCE_FILE, JSON.stringify(jobs, null, 2), 'utf-8');

  return jobs;
}

function getStoredFreelanceJobs() {
  if (!fs.existsSync(FREELANCE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FREELANCE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

module.exports = {
  scrapeFreelanceJobs,
  getStoredFreelanceJobs,
  generateProposal
};

if (require.main === module) {
  scrapeFreelanceJobs().then(jobs => console.log('Total gigs saved:', jobs.length));
}
