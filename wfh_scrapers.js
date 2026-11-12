/**
 * ==============================================================================
 * 🌍 DEDICATED GLOBAL & INDIA WORK-FROM-HOME (WFH) CRAWLER
 * ==============================================================================
 * High-reliability remote-first job sources:
 * 1. We Work Remotely (WWR) Official RSS Feed
 * 2. Working Nomads Verified Remote API
 * 3. Remotive Global Remote Backend Feed
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * 1. We Work Remotely (WWR) - 100% Remote Backend Feed via RSS
 */
async function fetchWeWorkRemotelyJobs() {
  const jobs = [];
  try {
    const url = 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss';
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    $('item').each(function () {
      const el = $(this);
      const title = el.find('title').text().trim();
      const link = el.find('link').text().trim() || el.find('guid').text().trim();
      const desc = el.find('description').text().trim();

      // Title is usually formatted as "Company: Job Title"
      let comp = 'WeWorkRemotely Company';
      let cleanTitle = title;
      if (title.includes(':')) {
        const parts = title.split(':');
        comp = parts[0].trim();
        cleanTitle = parts.slice(1).join(':').trim();
      }

      if (cleanTitle && link) {
        jobs.push({
          id: `wwr-${link.split('/').filter(Boolean).pop()}`,
          title: cleanTitle,
          company: comp,
          location: '100% Work From Home (Remote / Anywhere)',
          tags: 'WeWorkRemotely, WFH, 100% Remote, Backend',
          description: desc.substring(0, 1500),
          url: link,
          source: 'WeWorkRemotely (WFH)'
        });
      }
    });
  } catch (err) {
    // Failover silently
  }
  return jobs;
}

/**
 * 2. Working Nomads - Verified Global Remote Jobs
 */
async function fetchWorkingNomadsJobs() {
  const jobs = [];
  try {
    const url = 'https://www.workingnomads.com/api/exposed_jobs/';
    const res = await axios.get(url, { timeout: 8000 });
    if (Array.isArray(res.data)) {
      for (const item of res.data) {
        const cat = (item.category_name || '').toLowerCase();
        const title = item.title || '';
        const titleLower = title.toLowerCase();

        const isBackend = cat.includes('development') && (
          titleLower.includes('node') ||
          titleLower.includes('backend') ||
          titleLower.includes('api') ||
          titleLower.includes('software') ||
          titleLower.includes('full stack')
        );

        if (isBackend) {
          jobs.push({
            id: `workingnomads-${item.id || title.replace(/\s+/g, '-').toLowerCase()}`,
            title,
            company: item.company_name || 'Remote Tech Company',
            location: '100% Work From Home (Global Remote)',
            tags: 'WorkingNomads, 100% Remote, WFH',
            description: (item.description || '').substring(0, 1500),
            url: item.url,
            source: 'WorkingNomads (WFH)'
          });
        }
      }
    }
  } catch (err) {
    // Failover silently
  }
  return jobs;
}

/**
 * 3. Remotive Global Backend Remote Roles
 */
async function fetchRemotiveBackendJobs() {
  const jobs = [];
  try {
    const url = 'https://remotive.com/api/remote-jobs?category=software-dev&search=backend';
    const res = await axios.get(url, { timeout: 8000 });
    if (res.data && Array.isArray(res.data.jobs)) {
      for (const item of res.data.jobs) {
        jobs.push({
          id: `remotive-wfh-${item.id}`,
          title: item.title,
          company: item.company_name || 'Global Startup',
          location: item.candidate_required_location || '100% Work From Home (Worldwide)',
          tags: 'Remotive, WFH, Remote Backend',
          description: (item.description || '').substring(0, 1500),
          url: item.url,
          source: 'Remotive (WFH)'
        });
      }
    }
  } catch (err) {
    // Failover silently
  }
  return jobs;
}

module.exports = {
  fetchWeWorkRemotelyJobs,
  fetchWorkingNomadsJobs,
  fetchRemotiveBackendJobs
};
