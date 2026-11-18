/**
 * ==============================================================================
 * 🌐 EXPANDED TECH JOB PLATFORMS SCRAPER
 * ==============================================================================
 * Scrapes fresh engineering jobs from:
 * 1. JSRemotely (JavaScript, Node.js, NestJS, TypeScript Remote Jobs)
 * 2. Jobicy Backend API v2 (Dedicated Backend Engineer Roles)
 * 3. Nodesk Engineering (High-growth Global Remote Tech Roles)
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function fetchJSRemotelyJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://jsremotely.com/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $('item').each(function () {
      const title = $(this).find('title').text().trim();
      const link = $(this).find('link').text().trim();
      const description = $(this).find('description').text().replace(/<[^>]*>?/gm, ' ').trim();
      const pubDate = $(this).find('pubDate').text().trim();

      const lower = `${title} ${description}`.toLowerCase();
      if (lower.includes('node') || lower.includes('nest') || lower.includes('backend') || lower.includes('api')) {
        let company = 'Tech Startup';
        const titleParts = title.split(' at ');
        let cleanTitle = title;
        if (titleParts.length === 2) {
          cleanTitle = titleParts[0].trim();
          company = titleParts[1].trim();
        }

        jobs.push({
          id: `jsremotely-${Buffer.from(link || title).toString('base64').slice(0, 20)}`,
          title: cleanTitle,
          company,
          location: 'Remote',
          tags: 'JSRemotely, Node.js, TypeScript',
          description: description.slice(0, 1500),
          url: link,
          source: 'JSRemotely'
        });
      }
    });
  } catch (err) {
    console.warn(`[JSRemotely Notice]: ${err.message}`);
  }
  return jobs;
}

async function fetchJobicyBackendV2() {
  const jobs = [];
  try {
    const res = await axios.get('https://jobicy.com/api/v2/remote-jobs?count=30&tag=backend', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const list = res.data?.jobs || [];
    for (const item of list) {
      const lower = `${item.jobTitle || ''} ${item.jobDescription || ''}`.toLowerCase();
      if (lower.includes('node') || lower.includes('nest') || lower.includes('backend') || lower.includes('typescript') || lower.includes('api')) {
        jobs.push({
          id: `jobicy-v2-${item.id || Buffer.from(item.url || '').toString('base64').slice(0, 16)}`,
          title: item.jobTitle || 'Backend Developer',
          company: item.companyName || 'Remote Company',
          location: item.jobGeo || 'Remote / Global',
          tags: 'Jobicy Backend, Node.js, Remote',
          description: (item.jobDescription || '').replace(/<[^>]*>?/gm, ' ').slice(0, 1500),
          url: item.url,
          source: 'Jobicy Backend'
        });
      }
    }
  } catch (err) {
    console.warn(`[Jobicy Backend v2 Notice]: ${err.message}`);
  }
  return jobs;
}

async function fetchNodeskJobs() {
  const jobs = [];
  try {
    const res = await axios.get('https://nodesk.co/remote-jobs/engineering/index.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $('item').each(function () {
      const title = $(this).find('title').text().trim();
      const link = $(this).find('link').text().trim();
      const description = $(this).find('description').text().replace(/<[^>]*>?/gm, ' ').trim();

      const lower = `${title} ${description}`.toLowerCase();
      if (lower.includes('node') || lower.includes('backend') || lower.includes('nest') || lower.includes('api') || lower.includes('software engineer')) {
        let company = 'Global Tech';
        const parts = title.split(' – ');
        let cleanTitle = title;
        if (parts.length >= 2) {
          company = parts[0].trim();
          cleanTitle = parts.slice(1).join(' – ').trim();
        }

        jobs.push({
          id: `nodesk-${Buffer.from(link || title).toString('base64').slice(0, 20)}`,
          title: cleanTitle,
          company,
          location: 'Remote',
          tags: 'Nodesk, Engineering, Remote',
          description: description.slice(0, 1500),
          url: link,
          source: 'Nodesk'
        });
      }
    });
  } catch (err) {
    console.warn(`[Nodesk Notice]: ${err.message}`);
  }
  return jobs;
}

async function fetchNewPlatformJobs() {
  const [jsRemotely, jobicyV2, nodesk] = await Promise.all([
    fetchJSRemotelyJobs(),
    fetchJobicyBackendV2(),
    fetchNodeskJobs()
  ]);
  return [...jsRemotely, ...jobicyV2, ...nodesk];
}

module.exports = { fetchNewPlatformJobs };
