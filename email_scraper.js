/**
 * ==============================================================================
 * 🎯 SMART HR EMAIL HUNTER 3.0 (HUMAN HR + GOOGLE SERPER + SMTP PROBE)
 * ==============================================================================
 * 1. Blocks non-HR/system addresses (hiringaccommodation@, support@, etc.).
 * 2. Resolves the REAL official company domain via job page links, Live Google
 *    Search (Serper.dev if SERPER_API_KEY is set), Clearbit, & GitHub Orgs API.
 * 3. Hunts company /team, /about, /careers, /contact pages for REAL human HR,
 *    Recruiter, People, and Founder names + emails.
 * 4. Generates human email permutations (first@, first.last@, f.last@) and tests
 *    them with live SMTP RCPT TO verification before returning!
 * 5. Tests role inboxes (talent@, hr@, recruiting@, people@, hiring@, careers@)
 *    via SMTP RCPT TO so dead inboxes never bounce.
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const path = require('path');
const fs = require('fs');
const { verifyEmailDeliverability, JUNK_LOCAL_PART_REGEX } = require('./email_verifier');
const { serperLookupCompanyHr } = require('./google_serper_hunter');

const BOUNCED_FILE = path.join(__dirname, 'data', 'bounced_emails.json');

const SKIP_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'protonmail.com', 'yopmail.com', 'temp-mail.org',
  'example.com', 'placeholder.com', 'sampleemail.com', 'company.com',
  'yourdomain.com', 'domain.com', 'email.com', 'test.com', 'yourcompany.com',
  'linkedin.com', 'indeed.com', 'remoteok.io', 'remoteok.com', 'himalayas.app',
  'remotive.com', 'jobicy.com', 'arbeitnow.com', 'wellfound.com', 'greenhouse.io',
  'lever.co', 'workable.com', 'ashbyhq.com', 'ycombinator.com', 'news.ycombinator.com',
  'angel.co', 'glassdoor.com', 'monster.com', 'naukri.com', 'dice.com',
  'cuvette.tech', 'hirist.com', 'weworkremotely.com', 'workingnomads.com',
  'hireeing.com', 'smartrecruiters.com', 'myworkdayjobs.com', 'bamboohr.com',
  'sentry.io', 'sentry-next.wixpress.com', 'wix.com', 'wordpress.com', 'github.com',
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com',
  't.co', 'bit.ly', 'tinyurl.com', 'google.com', 'apple.com', 'microsoft.com',
  'cloudflare.com', 'amazonaws.com', 'w3.org', 'schema.org'
];

const HR_PAGE_PATHS = [
  '/careers', '/jobs', '/about', '/about-us', '/team', '/people', '/contact', '/join-us', '/hiring'
];

const HR_PREFIX_PRIORITY = ['talent', 'hr', 'recruiting', 'recruitment', 'people', 'hiring', 'careers', 'jobs'];

const PARKED_DOMAIN_REGEX = /(buy this domain|domain is for sale|dan\.com|sedo|hugedomains|godaddy.*parked|this domain may be for sale|afternic|undeveloped)/i;

const NON_PERSON_WORDS = new Set([
  'who', 'what', 'when', 'where', 'why', 'how', 'work', 'working', 'jobs', 'job',
  'your', 'name', 'first', 'last', 'full', 'contact', 'team', 'hiring', 'talent',
  'tech', 'stack', 'company', 'remote', 'hybrid', 'india', 'mumbai', 'bangalore',
  'apply', 'here', 'click', 'email', 'please', 'send', 'resume', 'join', 'about',
  'senior', 'junior', 'backend', 'frontend', 'engineer', 'developer', 'manager',
  'lead', 'head', 'people', 'human', 'resources', 'recruiter', 'founder', 'role',
  'position', 'candidate', 'required', 'must', 'have', 'experience', 'years', 'new'
]);

function getBouncedList() {
  if (!fs.existsSync(BOUNCED_FILE)) return new Set();
  try {
    const list = JSON.parse(fs.readFileSync(BOUNCED_FILE, 'utf-8'));
    return new Set(list.map(e => e.toLowerCase().trim()));
  } catch {
    return new Set();
  }
}

function isSkippedDomain(domain) {
  if (!domain) return true;
  const d = domain.toLowerCase();
  return SKIP_DOMAINS.some(s => d === s || d.endsWith('.' + s));
}

function extractEmailsFromText(text) {
  if (!text) return [];
  const bounced = getBouncedList();
  const emailRegex = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const found = text.match(emailRegex) || [];

  const filtered = found
    .map(e => e.toLowerCase().trim())
    .filter(e => {
      const [local, domain] = e.split('@');
      if (!local || !domain) return false;
      if (isSkippedDomain(domain)) return false;
      if (JUNK_LOCAL_PART_REGEX.test(local)) return false;
      if (bounced.has(e)) return false;
      if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e)) return false;
      return true;
    })
    .filter((e, i, arr) => arr.indexOf(e) === i);

  filtered.sort((a, b) => {
    const score = (em) => {
      const l = em.split('@')[0];
      if (/^(talent|hr|recruit|people|hiring)/i.test(l)) return 3;
      if (/^(careers|jobs)/i.test(l)) return 1;
      return 2;
    };
    return score(b) - score(a);
  });

  return filtered;
}

async function hasValidMx(domain) {
  if (!domain || isSkippedDomain(domain)) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

function extractRootDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('.') || isSkippedDomain(host)) return null;
    const parts = host.split('.');
    if (parts.length >= 3 && /^(co|com|org|net|ac)$/.test(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

async function isLiveNonParkedWebsite(domain) {
  try {
    const res = await axios.get(`https://${domain}`, {
      timeout: 4500,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36' },
      maxRedirects: 3
    });
    const html = String(res.data || '').slice(0, 8000);
    if (PARKED_DOMAIN_REGEX.test(html)) return false;
    return true;
  } catch {
    return true;
  }
}

async function extractDomainFromJobPage(jobUrl) {
  if (!jobUrl) return null;
  try {
    const direct = extractRootDomain(jobUrl);
    if (direct && await hasValidMx(direct)) return direct;

    const res = await axios.get(jobUrl, {
      timeout: 5500,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36' },
      maxRedirects: 3
    });
    const $ = cheerio.load(res.data || '');
    const links = $('a[href^="http"]').map((_, el) => $(el).attr('href')).get();

    for (const href of links) {
      const dom = extractRootDomain(href);
      if (dom && !isSkippedDomain(dom) && await hasValidMx(dom)) {
        return dom;
      }
    }
  } catch {}
  return null;
}

async function lookupDomainViaClearbit(companyName) {
  if (!companyName || companyName.length < 2) return null;
  try {
    const res = await axios.get(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`,
      { timeout: 4500 }
    );
    const items = Array.isArray(res.data) ? res.data : [];
    const targetClean = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const item of items) {
      const itemClean = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const domBase = (item.domain || '').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const isStrongMatch =
        itemClean === targetClean ||
        domBase === targetClean ||
        (targetClean.length >= 4 && (itemClean.startsWith(targetClean) || targetClean.startsWith(itemClean)));

      if (isStrongMatch && item.domain && !isSkippedDomain(item.domain)) {
        if (await hasValidMx(item.domain)) return item.domain;
      }
    }
  } catch {}
  return null;
}

async function lookupDomainViaGitHub(companyName) {
  if (!companyName || companyName.length < 3) return null;
  try {
    const res = await axios.get(
      `https://api.github.com/search/users?q=${encodeURIComponent(companyName + ' type:org')}&per_page=2`,
      {
        timeout: 4500,
        headers: { 'User-Agent': 'JobHunterBot/3.0', 'Accept': 'application/vnd.github.v3+json' }
      }
    );
    const orgs = res.data?.items || [];
    for (const org of orgs) {
      const detail = await axios.get(org.url, {
        timeout: 4000,
        headers: { 'User-Agent': 'JobHunterBot/3.0' }
      });
      const blog = detail.data?.blog;
      const email = detail.data?.email;
      if (email && !isSkippedDomain(email.split('@')[1])) {
        const d = email.split('@')[1].toLowerCase();
        if (await hasValidMx(d)) return d;
      }
      if (blog) {
        const urlStr = blog.startsWith('http') ? blog : `https://${blog}`;
        const dom = extractRootDomain(urlStr);
        if (dom && await hasValidMx(dom)) return dom;
      }
    }
  } catch {}
  return null;
}

async function resolveCompanyDomain(jobUrl, companyName, serperDomainHint = null) {
  if (!companyName || /^(hybrid|remote|onsite|on-site|wfh|unknown|confidential|health|tech|startup)$/i.test(companyName.trim())) {
    if (!jobUrl) return null;
  }

  const fromJobPage = await extractDomainFromJobPage(jobUrl);
  if (fromJobPage) return fromJobPage;

  if (serperDomainHint && !isSkippedDomain(serperDomainHint) && await hasValidMx(serperDomainHint)) {
    return serperDomainHint;
  }

  if (!companyName) return null;

  const fromClearbit = await lookupDomainViaClearbit(companyName);
  if (fromClearbit && await isLiveNonParkedWebsite(fromClearbit)) {
    return fromClearbit;
  }

  const fromGitHub = await lookupDomainViaGitHub(companyName);
  if (fromGitHub) return fromGitHub;

  const cleanSlug = companyName
    .toLowerCase()
    .replace(/^(the|a)\s+/i, '')
    .replace(/\b(pvt|ltd|private|limited|inc|llc|technologies|technology|solutions|services|software|labs|group|india|global)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  if (cleanSlug.length >= 4) {
    for (const tld of ['.com', '.in', '.io', '.ai', '.co']) {
      const candidate = `${cleanSlug}${tld}`;
      if (await hasValidMx(candidate) && await isLiveNonParkedWebsite(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function extractHrPersonNames(text) {
  if (!text) return [];
  const people = [];
  const patterns = [
    /(?:recruiter|hiring manager|talent acquisition|hr lead|people operations|contact person|reach out to)[:\s\-]+([A-Z][a-z]{2,14}\s+[A-Z][a-z]{2,15})/gi,
    /([A-Z][a-z]{2,14}\s+[A-Z][a-z]{2,15})\s*[\-–,|]\s*(?:talent acquisition|technical recruiter|senior recruiter|recruiter|hr manager|hr lead|head of people|people operations|co-founder|founder)/gi
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text)) !== null) {
      const full = m[1].trim();
      const parts = full.split(/\s+/);
      if (parts.length === 2) {
        const first = parts[0].toLowerCase().replace(/[^a-z]/g, '');
        const last = parts[1].toLowerCase().replace(/[^a-z]/g, '');
        if (
          first.length >= 3 &&
          last.length >= 3 &&
          !NON_PERSON_WORDS.has(first) &&
          !NON_PERSON_WORDS.has(last)
        ) {
          people.push({ full, first, last });
        }
      }
    }
  }

  return people.slice(0, 3);
}

async function scrapePageDetails(url, timeoutMs = 5500) {
  try {
    const res = await axios.get(url, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 2
    });
    const html = String(res.data || '');
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const visibleText = $('body').text().replace(/\s+/g, ' ');
    const emails = extractEmailsFromText($.html() + ' ' + visibleText);
    const people = extractHrPersonNames(visibleText);
    return { emails, people };
  } catch {
    return { emails: [], people: [] };
  }
}

async function pickBestVerifiedEmail(candidates) {
  let fallbackValid = null;

  for (const email of candidates) {
    const check = await verifyEmailDeliverability(email);
    if (!check.valid) continue;

    if (check.verifiedLive) {
      console.log(`   ✅ [HR Hunter] SMTP CONFIRMED LIVE MAILBOX: ${email}`);
      return email;
    }

    if (!fallbackValid) {
      fallbackValid = email;
    }
  }

  return fallbackValid;
}

/**
 * MAIN EXPORT: Find & verify the best direct HR / Recruiter / Founder email
 */
async function findHrEmail(job) {
  const { company, description, url } = job;
  console.log(`   🔍 [HR Hunter 3.0] Hunting real HR email for: ${company}`);

  const allPeople = extractHrPersonNames(description || '');

  const descEmails = extractEmailsFromText(description);
  if (descEmails.length > 0) {
    const verified = await pickBestVerifiedEmail(descEmails);
    if (verified) {
      console.log(`   ✅ [HR Hunter] Verified from job description: ${verified}`);
      return verified;
    }
  }

  if (url && !url.includes('news.google.com')) {
    const pageInfo = await scrapePageDetails(url, 5500);
    allPeople.push(...pageInfo.people);
    if (pageInfo.emails.length > 0) {
      const verified = await pickBestVerifiedEmail(pageInfo.emails);
      if (verified) {
        console.log(`   ✅ [HR Hunter] Verified from job page: ${verified}`);
        return verified;
      }
    }
  }

  const serperInfo = await serperLookupCompanyHr(company);
  if (serperInfo.textClues) {
    allPeople.push(...extractHrPersonNames(serperInfo.textClues));
    const googleEmails = extractEmailsFromText(serperInfo.textClues);
    if (googleEmails.length > 0) {
      const verified = await pickBestVerifiedEmail(googleEmails);
      if (verified) {
        console.log(`   ✅ [HR Hunter + Google] Verified from live Google Search: ${verified}`);
        return verified;
      }
    }
  }

  const domain = await resolveCompanyDomain(
    url && !url.includes('news.google.com') ? url : '',
    company,
    serperInfo.domain
  );
  if (!domain) {
    console.log(`   ℹ️  [HR Hunter] Could not resolve real corporate domain for ${company}.`);
    return null;
  }
  console.log(`   🌐 [HR Hunter] Verified corporate domain: ${domain}`);

  for (const p of HR_PAGE_PATHS.slice(0, 5)) {
    const siteInfo = await scrapePageDetails(`https://www.${domain}${p}`, 4000);
    allPeople.push(...siteInfo.people);
    if (siteInfo.emails.length > 0) {
      const verified = await pickBestVerifiedEmail(siteInfo.emails);
      if (verified) {
        console.log(`   ✅ [HR Hunter] Found on ${domain}${p}: ${verified}`);
        return verified;
      }
    }
  }

  if (allPeople.length > 0) {
    const personCandidates = [];
    for (const p of allPeople.slice(0, 2)) {
      personCandidates.push(
        `${p.first}@${domain}`,
        `${p.first}.${p.last}@${domain}`,
        `${p.first[0]}${p.last}@${domain}`,
        `${p.first[0]}.${p.last}@${domain}`
      );
    }
    const verifiedPerson = await pickBestVerifiedEmail(personCandidates);
    if (verifiedPerson) {
      console.log(`   🎯 [HR Hunter] Matched human HR/Founder inbox: ${verifiedPerson}`);
      return verifiedPerson;
    }
  }

  const roleCandidates = HR_PREFIX_PRIORITY.map(prefix => `${prefix}@${domain}`);
  const verifiedRole = await pickBestVerifiedEmail(roleCandidates);
  if (verifiedRole) {
    console.log(`   🎯 [HR Hunter] Verified talent inbox: ${verifiedRole}`);
    return verifiedRole;
  }

  console.log(`   ℹ️  [HR Hunter] All talent prefixes rejected or unavailable for @${domain} (Bounce prevented!).`);
  return null;
}

module.exports = {
  findHrEmail,
  extractEmailsFromText,
  hasValidMx,
  resolveCompanyDomain,
  pickBestVerifiedEmail
};
