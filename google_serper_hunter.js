/**
 * ==============================================================================
 * 🔎 LIVE GOOGLE SEARCH & LINKEDIN POST HR MINER (SERPER.DEV API)
 * ==============================================================================
 * Legally queries live Google Search without CAPTCHAs via Serper.dev
 * (2,500 free searches/key at https://serper.dev).
 *
 * Capabilities when SERPER_API_KEY is set in .env:
 * 1. Mines public LinkedIn hiring posts where HRs/CTOs write "email CV to ..."
 * 2. Discovers fresh Node.js/NestJS India jobs on Ashby/Greenhouse/Lever via Google
 * 3. Helps HR Hunter 3.0 resolve exact official company domains & real HR names
 * ==============================================================================
 */

const axios = require('axios');
const { extractEmailsFromText } = require('./email_scraper');

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

const BOARD_HOSTS = new Set([
  'linkedin.com', 'www.linkedin.com', 'greenhouse.io', 'boards.greenhouse.io',
  'lever.co', 'jobs.lever.co', 'ashbyhq.com', 'jobs.ashbyhq.com',
  'naukri.com', 'indeed.com', 'glassdoor.com', 'ambitionbox.com',
  'wellfound.com', 'crunchbase.com', 'wikipedia.org', 'facebook.com',
  'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'github.com'
]);

async function serperSearch(query, num = 15) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await axios.post(
      SERPER_ENDPOINT,
      { q: query, gl: 'in', num },
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    return Array.isArray(res.data?.organic) ? res.data.organic : [];
  } catch (err) {
    console.warn(`⚠️ [Google Serper Notice]: ${err.response?.status || err.message}`);
    return [];
  }
}

/**
 * 1. Mine LinkedIn Hiring Posts & ATS Boards from Live Google Search
 */
async function fetchGoogleSerperJobs() {
  if (!process.env.SERPER_API_KEY) return [];
  const jobs = [];
  const seenUrls = new Set();

  const queries = [
    // 1. Direct HR LinkedIn hiring posts with emails / resumes invited
    'site:linkedin.com/posts ("hiring" OR "urgent requirement" OR "looking for") ("Node.js" OR "NestJS" OR "Backend Developer") ("India" OR "Mumbai" OR "Remote") ("@" OR "email" OR "share CV" OR "send resume")',
    // 2. Direct live LinkedIn Job Pages (Google-indexed: bypasses LinkedIn 429 rate limit!)
    'site:linkedin.com/jobs/view ("Node.js" OR "NestJS" OR "Backend Engineer" OR "Backend Developer") ("India" OR "Remote" OR "Mumbai")',
    // 3. Top Startup ATS Portals with immediate Node.js / NestJS roles
    'site:jobs.ashbyhq.com OR site:boards.greenhouse.io OR site:jobs.lever.co OR site:apply.workable.com ("Node.js" OR "NestJS" OR "Backend") ("India" OR "Remote")',
    // 4. Founder / Recruiter outreach posts seeking 3-4 YOE Backend
    'site:linkedin.com/posts ("Node.js" OR "NestJS" OR "Backend") ("3+ years" OR "3 years" OR "immediate joiner" OR "0-15 days") ("India" OR "Remote")',
    // 5. Tech roles on Cutshort & Naukri via Google
    'site:cutshort.io/job OR site:naukri.com/job-listings ("Node.js" OR "NestJS") ("Backend") ("India" OR "Remote")'
  ];

  for (const q of queries) {
    const results = await serperSearch(q, 15);
    for (const r of results) {
      const url = r.link || '';
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      let title = (r.title || 'Node.js Backend Developer')
        .replace(/\s+\|\s+LinkedIn.*$/i, '')
        .replace(/\s+-\s+Naukri\.com.*$/i, '')
        .replace(/\s+\|\s+Cutshort.*$/i, '')
        .trim();

      const snippet = r.snippet || '';
      const combined = `${title} ${snippet}`;

      // Extract direct recruiter/HR email if written in Google snippet!
      const snippetEmails = extractEmailsFromText(combined);
      const directHrEmail = snippetEmails.length > 0 ? snippetEmails[0] : null;

      // Extract company hint from LinkedIn post or ATS URL
      let company = 'Tech Company (Google Search)';
      const atsMatch = url.match(/(?:boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com)\/([^/?#]+)/i);
      if (atsMatch) {
        company = atsMatch[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      } else {
        const atMatch = combined.match(/\b(?:hiring\s+for|at|@)\s+([A-Z][A-Za-z0-9&.\- ]{2,28})/i);
        if (atMatch) company = atMatch[1].trim();
      }

      // If LinkedIn Job URL, extract company from title if "Role at Company" format
      if (url.includes('linkedin.com/jobs/view')) {
        const parts = title.split(' hiring ');
        if (parts.length === 2) {
          company = parts[0].trim();
          title = parts[1].replace(/ in .*$/, '').trim();
        }
      }

      jobs.push({
        id: `serper-${Buffer.from(url).toString('base64').slice(0, 24)}`,
        title: title.slice(0, 90),
        company: company.slice(0, 50),
        location: 'India / Remote',
        tags: 'Google Search, Direct HR Post, Node.js',
        description: `${title}\n${snippet}\nSource URL: ${url}`,
        url,
        hrEmail: directHrEmail,
        email: directHrEmail,
        source: url.includes('linkedin.com/posts')
          ? 'Google LinkedIn Posts'
          : url.includes('linkedin.com/jobs')
            ? 'Google LinkedIn Jobs'
            : 'Google ATS Search'
      });
    }
  }

  return jobs;
}

/**
 * 2. Lookup official company domain & human HR clues via Live Google Search
 */
async function serperLookupCompanyHr(companyName) {
  if (!process.env.SERPER_API_KEY || !companyName) return { domain: null, textClues: '' };

  const results = await serperSearch(`"${companyName}" ("careers" OR "talent acquisition" OR "HR" OR "official website")`, 6);
  let domain = null;
  let textClues = '';

  for (const r of results) {
    textClues += ` ${r.title || ''} ${r.snippet || ''} `;
    if (!domain && r.link) {
      try {
        const host = new URL(r.link).hostname.replace(/^www\./, '').toLowerCase();
        const isBoard = Array.from(BOARD_HOSTS).some(b => host === b || host.endsWith('.' + b));
        if (!isBoard && host.includes('.')) {
          const parts = host.split('.');
          domain = parts.length >= 3 && /^(co|com|org|net)$/.test(parts[parts.length - 2])
            ? parts.slice(-3).join('.')
            : parts.slice(-2).join('.');
        }
      } catch {}
    }
  }

  return { domain, textClues };
}

module.exports = { fetchGoogleSerperJobs, serperLookupCompanyHr, serperSearch };

