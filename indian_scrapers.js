/**
 * ==============================================================================
 * 🇮🇳 INDIAN TECH PLATFORMS CRAWLER (Cuvette & Hirist)
 * ==============================================================================
 * Scrapes fresh Indian startup and tech roles specifically targeting
 * Node.js, NestJS, and Backend Developer openings in Mumbai / Bangalore / Remote.
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function fetchCuvetteJobs() {
  const jobs = [];
  try {
    // Cuvette public feed for backend / software developer roles
    const url = 'https://cuvette.tech/app/public/jobs';
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    $('a[href*="/app/public/job/"]').each(function () {
      const el = $(this);
      const title = el.find('h2, h3, .job-title').first().text().trim() || el.text().trim();
      const comp = el.find('.company-name, .company').first().text().trim();
      const link = el.attr('href');

      const titleLower = title.toLowerCase();
      if (titleLower.includes('node') || titleLower.includes('backend') || titleLower.includes('software engineer')) {
        const fullUrl = link.startsWith('http') ? link : `https://cuvette.tech${link}`;
        jobs.push({
          id: `cuvette-${link.split('/').pop()}`,
          title: title.substring(0, 80),
          company: comp || 'Indian Tech Startup (Cuvette)',
          location: 'India / Remote',
          tags: 'Cuvette, Indian Startup, Backend',
          description: `${title} at ${comp}. Indian startup opening on Cuvette.`,
          url: fullUrl,
          source: 'Cuvette India'
        });
      }
    });
  } catch (err) {
    // Silent failover
  }
  return jobs;
}

async function fetchHiristJobs() {
  const jobs = [];
  try {
    // Hirist search for Node.js roles
    const url = 'https://www.hirist.tech/search/node-js-jobs.html';
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    $('.job-block, .job-list-item').each(function () {
      const el = $(this);
      const title = el.find('.job-title, a.title').text().trim();
      const comp = el.find('.company-name, a.company').text().trim();
      const link = el.find('a.title, a[href*="/j/"]').attr('href');
      const loc = el.find('.job-location, .location').text().trim();

      if (title && link) {
        const fullUrl = link.startsWith('http') ? link : `https://www.hirist.tech${link}`;
        jobs.push({
          id: `hirist-${fullUrl.split('-').pop().replace('.html', '')}`,
          title,
          company: comp || 'Tech Company via Hirist',
          location: loc || 'Mumbai / India',
          tags: 'Hirist, Node.js, India Tech',
          description: `${title} at ${comp}. Location: ${loc}. Listed on Hirist.`,
          url: fullUrl,
          source: 'Hirist India'
        });
      }
    });
  } catch (err) {
    // Silent failover
  }
  return jobs;
}

module.exports = { fetchCuvetteJobs, fetchHiristJobs };

