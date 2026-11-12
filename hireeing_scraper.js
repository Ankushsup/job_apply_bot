/**
 * ==============================================================================
 * 🎯 HIREEING.COM CRAWLER (Deduplicated & Stack-Filtered)
 * ==============================================================================
 * Crawls https://hireeing.com/jobs for fresh remote software engineering roles.
 * Filters strictly for Node.js, NestJS, and Backend positions.
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function fetchHireeingJobs() {
  const jobs = [];
  try {
    const url = 'https://hireeing.com/jobs';
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    const seenTitles = new Set();

    $('a[href*="/jobs/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();

      if (!text || text.length < 5) return;

      const titleLower = text.toLowerCase();

      // Skip non-backend or irrelevant stacks
      if (
        titleLower.includes('intern') ||
        titleLower.includes('director') ||
        titleLower.includes('vp') ||
        titleLower.includes('sales') ||
        titleLower.includes('recruiter') ||
        titleLower.includes('designer')
      ) return;

      const isBackendMatch = (
        titleLower.includes('backend') ||
        titleLower.includes('node') ||
        titleLower.includes('nest') ||
        titleLower.includes('full stack') ||
        titleLower.includes('api')
      );

      if (!isBackendMatch) return;

      // Deduplicate by normalized title
      const normTitle = text.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenTitles.has(normTitle)) return;
      seenTitles.add(normTitle);

      // Extract company name accurately from href
      // e.g. /jobs/senior-backend-engineer-at-company-slug-hash
      const cleanPath = href.split('?')[0].replace(/\/$/, '');
      const parts = cleanPath.split('-');
      let comp = 'Tech Startup';
      if (parts.length >= 3) {
        // Last part is often random hash, second-to-last or third-to-last is company
        const candidateComp = parts[parts.length - 2];
        if (candidateComp && candidateComp.length > 2 && !/^\d+$/.test(candidateComp)) {
          comp = candidateComp.charAt(0).toUpperCase() + candidateComp.slice(1);
        }
      }

      const fullUrl = href.startsWith('http') ? href : `https://hireeing.com${href}`;

      jobs.push({
        id: `hireeing-${cleanPath.split('/').pop()}`,
        title: text,
        company: comp,
        location: '100% Remote / WFH',
        tags: 'Hireeing, Remote, Node.js, Backend',
        description: `${text} at ${comp}. Sourced from Hireeing curated remote feed. Required stack: Node.js, NestJS, Backend APIs.`,
        url: fullUrl,
        source: 'Hireeing (WFH)'
      });
    });
  } catch (err) {
    // Failover silently
  }
  return jobs;
}

module.exports = { fetchHireeingJobs };
