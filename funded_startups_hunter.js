/**
 * ==============================================================================
 * 🚀 NEWLY FUNDED INDIAN STARTUP HUNTER (ZERO-COMPETITION OUTREACH)
 * ==============================================================================
 * Monitors live Google News RSS (zero CAPTCHA, no API key required) for Indian
 * software/AI/SaaS/fintech startups that just raised Seed or Series A funding.
 * Freshly funded startups hire backend engineers before posting on Naukri/LinkedIn!
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');

const RSS_QUERIES = [
  '"raises" funding Indian startup AI OR SaaS OR fintech OR tech when:14d',
  '"secures" OR "bags" "seed funding" OR "Series A" startup India tech when:14d'
];

const IGNORE_INDUSTRY_REGEX = /\b(ev scooter|electric vehicle|battery|satellite|rocket|defence|drone|solar|biotech|bio-tech|pharma|snack|beverage|d2c fashion|jewellery|agriculture|venture fund|maiden fund|raises \$?\d+\s*billion|cleantech|manufacturing)\b/i;

function extractStartupNameFromHeadline(headline) {
  if (!headline) return null;
  const title = headline.replace(/\s+[-–|]\s+[^-–|]+$/, '').trim();

  const m = title.match(/^(.{2,50}?)\s+(?:raises|secures|bags|lands|closes|gets|nets)\s+(?:\$|₹|INR|Rs\.?|USD|\d)/i);
  if (!m) return null;

  let name = m[1]
    .replace(/^.*\bstartup\s+/i, '')
    .replace(/^(Indian|Bengaluru-based|Bangalore-based|Mumbai-based|Delhi-based|Gurugram-based|Noida-based|Pune-based|Hyderabad-based)\s+/gi, '')
    .replace(/^['"`]|['"`]$/g, '')
    .trim();

  if (!name || name.length < 3 || name.length > 32) return null;
  if (/\b(startups|funding|report|weekly|investors|india|these|top|how|why|capital|ventures|fund|partners|openai)\b/i.test(name)) return null;

  return name;
}

async function fetchFundedStartupJobs() {
  const jobs = [];
  const seenCompanies = new Set();

  for (const q of RSS_QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const res = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'JobHunterBot/3.0' }
      });

      const $ = cheerio.load(res.data || '', { xmlMode: true });
      $('item').each((_, el) => {
        const rawTitle = $(el).find('title').text().trim();
        const link = $(el).find('link').text().trim();
        const pubDate = $(el).find('pubDate').text().trim();

        if (IGNORE_INDUSTRY_REGEX.test(rawTitle)) return;

        const company = extractStartupNameFromHeadline(rawTitle);
        if (!company) return;

        const key = company.toLowerCase();
        if (seenCompanies.has(key)) return;
        seenCompanies.add(key);

        jobs.push({
          id: `funded-${key.replace(/[^a-z0-9]/g, '')}`,
          title: 'Backend Engineer (Node.js / TypeScript) - Post-Funding Growth',
          company,
          location: 'India / Remote',
          tags: 'Funded Startup, Node.js, Backend, Direct Founder/HR Pitch',
          description: `Recent funding news (${pubDate}): "${rawTitle}". Post-funding Indian startup scaling its engineering and backend systems (Node.js, TypeScript, PostgreSQL, Redis, AWS). Pitch congratulations on the funding round and highlight 3.5+ YOE backend scaling skills.`,
          url: link,
          source: 'Funded Startup RSS'
        });
      });
    } catch (err) {
      console.error(`[Funded Startup Hunter Error]: ${err.message}`);
    }
  }

  return jobs;
}

if (require.main === module) {
  fetchFundedStartupJobs().then(list => {
    console.log(`Found ${list.length} freshly funded startups:`);
    list.forEach(j => console.log(`- ${j.company}: ${j.description.slice(0, 120)}...`));
  });
}

module.exports = { fetchFundedStartupJobs, extractStartupNameFromHeadline };

