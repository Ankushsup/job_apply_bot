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

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

const BOARD_HOSTS = new Set([
  'linkedin.com', 'www.linkedin.com', 'greenhouse.io', 'boards.greenhouse.io',
  'lever.co', 'jobs.lever.co', 'ashbyhq.com', 'jobs.ashbyhq.com',
  'naukri.com', 'indeed.com', 'glassdoor.com', 'ambitionbox.com',
  'wellfound.com', 'crunchbase.com', 'wikipedia.org', 'facebook.com',
  'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'github.com'
]);

async function serperSearch(query, num = 10) {
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
        timeout: 8000
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
    'site:linkedin.com/posts ("hiring" OR "looking for") ("Node.js" OR "NestJS" OR "Backend") ("India" OR "Mumbai" OR "Remote") "@"',
    'site:jobs.ashbyhq.com OR site:boards.greenhouse.io OR site:jobs.lever.co ("Node.js" OR "Backend") "India"'
  ];

  for (const q of queries) {
    const results = await serperSearch(q, 10);
    for (const r of results) {
      const url = r.link || '';
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const title = (r.title || 'Node.js Backend Developer').replace(/\s+\|\s+LinkedIn.*$/i, '').trim();
      const snippet = r.snippet || '';
      const combined = `${title} ${snippet}`;

      // Extract company hint from LinkedIn post or ATS URL
      let company = 'Tech Company (Google Search)';
      const atsMatch = url.match(/(?:boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\/([^/?#]+)/i);
      if (atsMatch) {
        company = atsMatch[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      } else {
        const atMatch = combined.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.\- ]{2,28})/);
        if (atMatch) company = atMatch[1].trim();
      }

      jobs.push({
        id: `serper-${Buffer.from(url).toString('base64').slice(0, 20)}`,
        title: title.slice(0, 90),
        company,
        location: 'India / Remote',
        tags: 'Google Search, Direct HR Post, Node.js',
        description: `${title}\n${snippet}\nSource URL: ${url}`,
        url,
        source: url.includes('linkedin.com/posts') ? 'Google LinkedIn Posts' : 'Google ATS Search'
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

