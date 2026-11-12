/**
 * ==============================================================================
 * 🚀 DIRECT ATS CRAWLER (Greenhouse & Lever API)
 * ==============================================================================
 * Fetches live engineering jobs directly from company ATS endpoints.
 * Completely public, no login or API key required.
 * ==============================================================================
 */

const axios = require('axios');

// Top-tier Indian & Remote tech companies using Greenhouse
const GREENHOUSE_COMPANIES = [
  'postman', 'browserstack', 'hasura', 'sourcegraph', 'brex',
  'automattic', 'gitlab', 'elastic', 'datadog', 'razorpay'
];

// Top-tier companies using Lever
const LEVER_COMPANIES = [
  'cred', 'jupiter', 'slice', 'zepto', 'porter'
];

async function fetchGreenhouseJobs() {
  const jobs = [];
  for (const comp of GREENHOUSE_COMPANIES) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${comp}/jobs?content=true`;
      const res = await axios.get(url, { timeout: 8000 });
      if (res.data && res.data.jobs) {
        for (const j of res.data.jobs) {
          const title = j.title || '';
          const content = j.content || '';
          const titleLower = title.toLowerCase();
          
          // Filter for relevant backend / fullstack / node roles
          const isRelevant = (
            titleLower.includes('node') ||
            titleLower.includes('backend') ||
            titleLower.includes('software engineer') ||
            titleLower.includes('full stack') ||
            titleLower.includes('api')
          ) && !titleLower.includes('director') && !titleLower.includes('intern');

          if (isRelevant) {
            jobs.push({
              id: `greenhouse-${comp}-${j.id}`,
              title: j.title,
              company: comp.charAt(0).toUpperCase() + comp.slice(1),
              location: (j.location && j.location.name) || 'Remote / India',
              tags: 'Greenhouse, Backend, Enterprise',
              description: content.substring(0, 1500),
              url: j.absolute_url,
              source: 'Greenhouse ATS'
            });
          }
        }
      }
    } catch (err) {
      // Board might have different slug or restricted, quietly continue
    }
  }
  return jobs;
}

async function fetchLeverJobs() {
  const jobs = [];
  for (const comp of LEVER_COMPANIES) {
    try {
      const url = `https://api.lever.co/v0/postings/${comp}?mode=json`;
      const res = await axios.get(url, { timeout: 8000 });
      if (Array.isArray(res.data)) {
        for (const j of res.data) {
          const title = j.text || '';
          const titleLower = title.toLowerCase();
          const isRelevant = (
            titleLower.includes('node') ||
            titleLower.includes('backend') ||
            titleLower.includes('software engineer') ||
            titleLower.includes('full stack')
          ) && !titleLower.includes('director') && !titleLower.includes('intern');

          if (isRelevant) {
            jobs.push({
              id: `lever-${comp}-${j.id}`,
              title: j.text,
              company: comp.toUpperCase(),
              location: (j.categories && j.categories.location) || 'India / Remote',
              tags: 'Lever, Backend, Startup',
              description: (j.descriptionPlain || '').substring(0, 1500),
              url: j.hostedUrl,
              source: 'Lever ATS'
            });
          }
        }
      }
    } catch (err) {
      // Quietly ignore
    }
  }
  return jobs;
}

// Top-tier Indian & Remote tech companies using Ashby ATS (open JSON API)
const ASHBY_COMPANIES = [
  'sarvam', 'supabase', 'linear', 'vapi', 'replit', 'elevenlabs', 'langchain', 'perplexity'
];

async function fetchAshbyJobs() {
  const jobs = [];
  for (const comp of ASHBY_COMPANIES) {
    try {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${comp}`;
      const res = await axios.get(url, { timeout: 8000 });
      const list = res.data?.jobs || [];
      for (const j of list) {
        const title = j.title || '';
        const titleLower = title.toLowerCase();
        const isRelevant = (
          titleLower.includes('node') ||
          titleLower.includes('backend') ||
          titleLower.includes('software engineer') ||
          titleLower.includes('full stack') ||
          titleLower.includes('fullstack') ||
          titleLower.includes('api') ||
          titleLower.includes('platform')
        ) && !titleLower.includes('director') && !titleLower.includes('intern') && !titleLower.includes('staff');

        if (!isRelevant) continue;

        const loc = j.location || (j.isRemote ? 'Remote' : 'India / Global');
        const locLower = `${loc} ${j.descriptionPlain || ''}`.toLowerCase();
        const eligible = j.isRemote || /\b(india|mumbai|bengaluru|bangalore|delhi|pune|hyderabad|remote|anywhere)\b/i.test(locLower);
        if (!eligible) continue;

        jobs.push({
          id: `ashby-${comp}-${j.id}`,
          title,
          company: comp.charAt(0).toUpperCase() + comp.slice(1),
          location: j.isRemote ? `${loc} (Remote)` : loc,
          tags: 'Ashby ATS, Backend, High-Growth',
          description: (j.descriptionPlain || '').substring(0, 1500),
          url: j.jobUrl || j.applyUrl,
          source: 'Ashby ATS'
        });
      }
    } catch {}
  }
  return jobs;
}

module.exports = { fetchGreenhouseJobs, fetchLeverJobs, fetchAshbyJobs };

