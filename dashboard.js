require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getLatestPrepCards } = require('./interview_coach');
const { scrapeFreelanceJobs, getStoredFreelanceJobs } = require('./freelance_engine');
const { scanAndSyncBounces } = require('./imap_bounce_scanner');
const { getResumeProfile, saveResumeProfile } = require('./resume_profile');
const { huntAndPitchReadyJobs } = require('./hunt_ready_jobs');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DASHBOARD_USER = process.env.DASHBOARD_USER;
const DASHBOARD_PASS = process.env.DASHBOARD_PASS;
const API_SECRET_TOKEN = process.env.API_SECRET_TOKEN;

function isAuthenticated(req) {
  // If no credentials configured in .env, allow (backward-compatible)
  if (!DASHBOARD_USER && !DASHBOARD_PASS && !API_SECRET_TOKEN) return true;

  const authHeader = req.headers['authorization'] || '';
  const apiKeyHeader = req.headers['x-api-key'] || '';

  // Check Bearer / API Key (e.g. Chrome Extension or external scripts)
  if (API_SECRET_TOKEN && (apiKeyHeader === API_SECRET_TOKEN || authHeader === `Bearer ${API_SECRET_TOKEN}`)) {
    return true;
  }

  // Check HTTP Basic Auth (for web browsers)
  if (DASHBOARD_USER && DASHBOARD_PASS && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [user, ...rest] = credentials.split(':');
    const pass = rest.join(':');
    if (user === DASHBOARD_USER && pass === DASHBOARD_PASS) {
      return true;
    }
  }

  return false;
}
const DATA_DIR = path.join(__dirname, 'data');
const APPLIED_FILE = path.join(DATA_DIR, 'applied_jobs.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist_companies.json');
const BOUNCED_FILE = path.join(DATA_DIR, 'bounced_emails.json');

function getBouncedList() {
  if (!fs.existsSync(BOUNCED_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(BOUNCED_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function getMetrics() {
  if (!fs.existsSync(APPLIED_FILE)) return { total: 0, list: [], breakdown: {} };
  try {
    const list = JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));
    const breakdown = {};
    list.forEach(a => {
      const key = a.method || a.source || 'Other';
      breakdown[key] = (breakdown[key] || 0) + 1;
    });
    return { total: list.length, list: list.slice().reverse(), breakdown };
  } catch (err) {
    return { total: 0, list: [], breakdown: {} };
  }
}

function addToBlacklist(companyName) {
  if (!companyName) return false;
  try {
    const list = fs.existsSync(BLACKLIST_FILE) ? JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf-8')) : [];
    const normalized = companyName.toLowerCase().trim();
    if (!list.includes(normalized)) {
      list.push(normalized);
      fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    }
  } catch (err) {
    console.error('Blacklist error:', err);
  }
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS for Chrome Auto-Fill Extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Security: Authentication Check (Basic Auth for browser / Token for extension)
  if (!isAuthenticated(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Autonomous Outreach Mission Control"',
      'Content-Type': 'application/json'
    });
    return res.end(JSON.stringify({ error: 'Unauthorized. Valid login credentials or API key required.' }));
  }

  // Profile API (used by Chrome Extension & Dashboard)
  if (req.method === 'GET' && url.pathname === '/api/profile') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(getResumeProfile()));
  }

  if (req.method === 'POST' && url.pathname === '/api/profile') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updated = saveResumeProfile(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updated));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid profile JSON' }));
      }
    });
    return;
  }

  // API Endpoints
  if (req.method === 'POST') {
    if (url.pathname === '/api/hunt-ready') {
      huntAndPitchReadyJobs(15)
        .then(r => console.log(`[Dashboard Hunt-Ready] Checked: ${r.checked}, Sent: ${r.sent}`))
        .catch(e => console.error('Hunt-Ready error:', e));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'HR Hunter 3.0 is finding real HRs and pitching your queued portal jobs in the background!' }));
    }

    if (url.pathname === '/api/scan') {
      exec(`"${process.execPath}" index.js --once`, { cwd: __dirname });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'Full Job Scan & HR Hunter initiated in background!' }));
    }

    if (url.pathname === '/api/freelance-scan') {
      scrapeFreelanceJobs().catch(e => console.error('Freelance scan error:', e));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'Freelance scan initiated! Refresh in a moment.' }));
    }

    if (url.pathname === '/api/sync-bounces') {
      scanAndSyncBounces()
        .then(list => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: `Synced ${list.length} bounced inboxes from Gmail Trash & Inbox! Blacklist updated.` }));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
      return;
    }

    if (url.pathname === '/api/digest') {
      exec(`"${process.execPath}" index.js --digest`, { cwd: __dirname });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'Daily Digest email sent to your inbox!' }));
    }

    if (url.pathname === '/api/followup') {
      exec(`"${process.execPath}" followup_agent.js`, { cwd: __dirname });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: '3-Day Recruiter Follow-Up sequence initiated!' }));
    }

    if (url.pathname === '/api/blacklist') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { company } = JSON.parse(body);
          addToBlacklist(company);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, company }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // Dashboard Data
  const { total, list, breakdown } = getMetrics();
  const prepCards = getLatestPrepCards();
  const freelanceGigs = getStoredFreelanceJobs();
  const bouncedList = getBouncedList();

  const directEmailsCount = list.filter(i => i.method === 'DIRECT_EMAIL' || i.method === 'DIRECT_HR_OUTREACH').length;

  const bouncedRowsHtml = bouncedList.map((email) => `
    <tr class="job-row" data-search="${email.toLowerCase()}">
      <td style="padding:14px 16px;font-weight:700;color:#dc2626;">${email}</td>
      <td style="padding:14px 16px;color:#64748b;font-size:13px;">Permanent 550 Mailbox Dead / Bounced</td>
      <td style="padding:14px 16px;"><span class="badge" style="background:#fee2e2;color:#b91c1c;">Gmail Trash / Mailer-Daemon</span></td>
      <td style="padding:14px 16px;"><span class="badge" style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;">🛡️ Blocked Permanently</span></td>
    </tr>
  `).join('');

  // Metrics HTML
  const cardsHtml = Object.entries(breakdown).map(([k, v]) => `
    <div class="metric-card">
      <div class="metric-label">${k}</div>
      <div class="metric-val">${v}</div>
    </div>
  `).join('');

  // Clean Freelance Rows
  const freelanceRowsHtml = freelanceGigs.map((gig) => {
    const safeProposal = encodeURIComponent(gig.proposal || '');
    return `
      <tr class="job-row" data-search="${(gig.company + ' ' + gig.title + ' ' + gig.source + ' ' + gig.rate).toLowerCase()}">
        <td style="padding:14px 16px;font-weight:700;color:#0f172a;">${gig.company || 'Remote Client'}</td>
        <td style="padding:14px 16px;color:#1e293b;font-weight:600;">${gig.title || 'Backend Engineer'}</td>
        <td style="padding:14px 16px;"><span class="badge badge-amber">${gig.source}</span></td>
        <td style="padding:14px 16px;font-weight:800;color:#059669;font-size:13.5px;">${gig.rate || 'Competitive'}</td>
        <td style="padding:14px 16px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn-copy-proposal" data-proposal="${safeProposal}" title="Copy tailored proposal to clipboard">📋 Copy Proposal</button>
            <a href="${gig.url}" target="_blank" class="btn-link">Open Gig ↗</a>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Interview Cards HTML
  const interviewCardsHtml = prepCards.slice(0, 6).map(card => `
    <div class="prep-card">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
        <strong style="color:#0f172a;font-size:16px;">${card.company}</strong>
        <span class="badge badge-blue">${card.title}</span>
      </div>
      <div style="margin-top:12px;">
        ${(card.questions || []).map((q, i) => `
          <div style="margin-top:10px;background:#f8fafc;padding:10px 14px;border-radius:8px;border-left:3px solid #3b82f6;">
            <div style="font-weight:700;color:#1e293b;font-size:13px;">Q${i+1}: ${q.question}</div>
            <div style="color:#059669;margin-top:4px;font-size:12.5px;font-weight:500;">💡 Strategy: ${q.tip}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Clean Pipeline Rows
  const rowsHtml = list.slice(0, 150).map((item) => {
    let cleanCompany = (item.company || 'Unknown').trim();
    if (cleanCompany.toLowerCase().startsWith("i'm ") || cleanCompany.includes("http://") || cleanCompany.includes("https://")) {
      cleanCompany = "Startup / Founder";
    } else if (cleanCompany.length > 32) {
      cleanCompany = cleanCompany.substring(0, 29) + '...';
    }

    const isEmail = item.method === 'DIRECT_EMAIL' || item.method === 'DIRECT_HR_OUTREACH';
    const isLinkedIn = (item.source || '').toLowerCase().includes('linkedin') || (item.target || '').includes('linkedin.com');

    let badgeClass = 'badge-blue';
    if (isEmail) badgeClass = 'badge-green';
    else if (isLinkedIn) badgeClass = 'badge-sky';

    let domain = '';
    if (item.target && item.target.startsWith('http')) {
      try { domain = new URL(item.target).hostname.replace('www.', ''); } catch {}
    }

    const safeUrl = encodeURIComponent(item.target || '');
    const safeComp = encodeURIComponent(cleanCompany);
    const searchString = `${cleanCompany} ${item.title || ''} ${item.method || ''} ${item.source || ''} ${domain}`.toLowerCase();

    return `
      <tr class="job-row" data-search="${searchString}">
        <td style="padding:12px 16px;font-weight:700;color:#0f172a;max-width:200px;" title="${(item.company || '').replace(/"/g, '&quot;')}">${cleanCompany}</td>
        <td style="padding:12px 16px;color:#334155;font-weight:600;">${item.title || 'Backend Engineer'}</td>
        <td style="padding:12px 16px;">
          <span class="badge ${badgeClass}">${item.method || item.source}</span>
        </td>
        <td style="padding:12px 16px;color:#64748b;font-size:12px;white-space:nowrap;">
          ${item.appliedAt ? new Date(item.appliedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '-'}
        </td>
        <td style="padding:12px 16px;">
          ${isEmail ? `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:#059669;font-size:12px;font-weight:700;background:#ecfdf5;border:1px solid #a7f3d0;padding:4px 8px;border-radius:6px;">
                ✉️ Emailed HR: ${item.target}
              </span>
              <button class="btn-blacklist" data-company="${safeComp}" title="Blacklist company">✕</button>
            </div>
          ` : item.target && item.target.startsWith('http') ? `
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="btn-open-apply" data-url="${safeUrl}" data-company="${safeComp}" data-title="${encodeURIComponent(item.title || '')}" data-cover="${encodeURIComponent(item.coverLetter || '')}" style="background:#2563eb;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 5px rgba(37,99,235,0.3);" title="Open job in your browser & copy tailored cover letter to clipboard">
                ⚡ 1-Click Apply
              </button>
              <button class="btn-blacklist" data-company="${safeComp}" title="Blacklist company">✕</button>
            </div>
          ` : `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:#64748b;font-size:12px;">Logged</span>
              <button class="btn-blacklist" data-company="${safeComp}" title="Blacklist company">✕</button>
            </div>
          `}
        </td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ankush Upadhyay | Autonomous Job Search & HR Hunter</title>
  <style>
    :root {
      --primary: #2563eb;
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --success: #10b981;
      --purple: #7c3aed;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      margin: 0;
      padding: 24px;
      color: var(--text-main);
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 1320px;
      margin: 0 auto;
      background: var(--surface);
      border-radius: 16px;
      box-shadow: 0 4px 25px rgba(0,0,0,0.05);
      border: 1px solid var(--border);
      padding: 32px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .title h1 {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 6px 0;
      color: var(--text-main);
      letter-spacing: -0.5px;
    }
    .title p { margin: 0; color: var(--text-muted); font-size: 14px; }
    .pulse-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12.5px;
      font-weight: 700;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 20px 0 24px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-purple { background: var(--purple); color: #fff; }
    .btn-success { background: #059669; color: #fff; }
    .btn-amber { background: #d97706; color: #fff; }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    .metric-card {
      background: #f8fafc;
      padding: 14px 18px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .metric-card.highlight { background: #0f172a; color: #fff; border: none; }
    .metric-card.green-highlight { background: #064e3b; color: #fff; border: none; }
    .metric-card.purple-highlight { background: #4c1d95; color: #fff; border: none; }
    .metric-label {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .metric-card.highlight .metric-label { color: #94a3b8; }
    .metric-card.green-highlight .metric-label { color: #6ee7b7; }
    .metric-card.purple-highlight .metric-label { color: #c4b5fd; }
    .metric-val { font-size: 24px; font-weight: 800; margin-top: 4px; }
    .tab-bar {
      display: flex;
      gap: 8px;
      border-bottom: 2px solid var(--border);
      margin-bottom: 20px;
    }
    .tab-btn {
      background: none;
      border: none;
      padding: 12px 20px;
      font-weight: 700;
      font-size: 14px;
      color: var(--text-muted);
      cursor: pointer;
      position: relative;
    }
    .tab-btn:hover { color: var(--text-main); }
    .tab-btn.active { color: var(--primary); }
    .tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--primary);
    }
    .search-box {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      background: #f8fafc;
      margin-bottom: 16px;
    }
    .search-box:focus { outline: none; border-color: var(--primary); background: #fff; }
    .table-wrapper {
      max-height: 640px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; text-align: left; }
    th {
      position: sticky;
      top: 0;
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      z-index: 5;
    }
    tr.job-row:hover { background: #f1f5f9 !important; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 700;
    }
    .badge-blue { background: #eff6ff; color: #1d4ed8; }
    .badge-green { background: #ecfdf5; color: #047857; }
    .badge-sky { background: #f0f9ff; color: #0369a1; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .btn-copy-proposal {
      background: var(--purple);
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-link {
      color: #2563eb;
      background: #eff6ff;
      text-decoration: none;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    .btn-blacklist {
      background: transparent;
      color: #94a3b8;
      border: none;
      padding: 4px 6px;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-blacklist:hover { color: #dc2626; }
    .cheat-btn {
      background: #f8fafc;
      border: 1px solid var(--border);
      padding: 9px 12px;
      border-radius: 8px;
      text-align: left;
      font-size: 12.5px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cheat-btn:hover { background: #eff6ff; border-color: #93c5fd; }
    .cheat-btn span { color: #64748b; font-size: 11px; font-weight: 600; }
    .cheat-btn b { color: #2563eb; }
    .prep-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
    .prep-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
    .toast-box {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      max-width: 440px;
      background: #0f172a;
      color: #fff;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      border-left: 5px solid #10b981;
      display: none;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="title">
        <h1>Autonomous Job Search & HR Hunter Mission Control</h1>
        <p>Candidate: <strong>Ankush Upadhyay</strong> &bull; Backend Engineer (3.5+ YOE Node.js, NestJS, PostgreSQL) &bull; Goal: 11+ LPA</p>
      </div>
      <div class="pulse-pill">
        <div class="pulse-dot"></div>
        24/7 AUTONOMOUS OUTREACH ACTIVE
      </div>
    </div>

    <!-- Quick Action Controls -->
    <div class="action-bar">
      <div class="btn-group">
        <button class="btn btn-primary" onclick="triggerAction('/api/scan', 'Starting full scan across 15 job platforms with automated HR Hunter...')">&#9654; Run Job Scan & HR Hunter</button>
        <button class="btn btn-success" onclick="triggerAction('/api/hunt-ready', 'Finding real HR emails for queued portal jobs & pitching directly...')">&#127919; Auto-Pitch Queued Jobs to HRs</button>
        <button class="btn btn-purple" onclick="triggerAction('/api/freelance-scan', 'Scanning for fresh freelance contracts...')">&#128188; Scan Freelance Gigs</button>
        <button class="btn btn-amber" onclick="triggerAction('/api/sync-bounces', 'Deep scanning Gmail Trash & Inbox for bounce notifications...')">&#128737; Sync Bounced Emails</button>
        <button class="btn btn-success" onclick="triggerAction('/api/digest', 'Sending daily executive digest to your inbox...')">&#128231; Send Digest to Email</button>
        <button class="btn btn-amber" onclick="triggerAction('/api/followup', 'Running 3-day recruiter follow-up sequence...')">&#128260; Run 3-Day Follow-Ups</button>
      </div>
    </div>

    <!-- Metrics Cards -->
    <div class="metrics-grid">
      <div class="metric-card highlight">
        <div class="metric-label">Total Pipeline</div>
        <div class="metric-val">${total}</div>
      </div>
      <div class="metric-card green-highlight">
        <div class="metric-label">Direct HR Emails Sent</div>
        <div class="metric-val">${directEmailsCount} Sent</div>
      </div>
      <div class="metric-card purple-highlight">
        <div class="metric-label">Freelance Gigs</div>
        <div class="metric-val">${freelanceGigs.length} Active</div>
      </div>
      <div class="metric-card" style="border-left: 4px solid #ef4444; background: #fff5f5;">
        <div class="metric-label" style="color:#b91c1c;">🛡️ Bounced & Blocked</div>
        <div class="metric-val" style="color:#b91c1c;">${bouncedList.length} Inboxes</div>
      </div>
      ${cardsHtml}
    </div>

    <!-- Navigation Tabs -->
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('tab-pipeline')">🚀 Full Pipeline (${total})</button>
      <button class="tab-btn" onclick="switchTab('tab-freelance')">💼 Freelance & Contracts (${freelanceGigs.length})</button>
      <button class="tab-btn" onclick="switchTab('tab-prep')">🎯 AI Interview Coach (${prepCards.length})</button>
      <button class="tab-btn" onclick="switchTab('tab-bounces')">🛡️ Bounced Inboxes (${bouncedList.length})</button>
    </div>

    <!-- TAB 1: PIPELINE -->
    <div id="tab-pipeline" class="tab-content">
      <input type="text" id="pipeline-search" class="search-box" placeholder="🔍 Instant Search by company, role, HR email, or source (e.g. NestJS, Remote, Elastic, Dentsu)..." onkeyup="filterTable('pipeline-table', this.value)" />
      
      <div class="table-wrapper">
        <table id="pipeline-table">
          <thead>
            <tr>
              <th style="width:22%;">Company</th>
              <th style="width:26%;">Role</th>
              <th style="width:16%;">Outreach Mode</th>
              <th style="width:14%;">Timestamp</th>
              <th style="width:22%;">Recruiter Status / Action</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: FREELANCE CONTRACTS -->
    <div id="tab-freelance" class="tab-content" style="display:none;">
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0 0 4px;font-size:16px;color:#581c87;">Freelance & Contract Opportunities</h3>
          <p style="margin:0;font-size:13px;color:#7e22ce;">Pre-matched against Ankush's Node.js, NestJS, and API integration skillset.</p>
        </div>
        <button class="btn btn-purple" onclick="triggerAction('/api/freelance-scan', 'Scanning for fresh freelance contracts...')">
          🔄 Scan Fresh Gigs
        </button>
      </div>

      <input type="text" id="freelance-search" class="search-box" placeholder="🔍 Search freelance gigs by stack, keyword, or client..." onkeyup="filterTable('freelance-table', this.value)" />

      <div class="table-wrapper">
        <table id="freelance-table">
          <thead>
            <tr>
              <th style="width:22%;">Client / Company</th>
              <th style="width:30%;">Scope / Title</th>
              <th style="width:15%;">Platform</th>
              <th style="width:15%;">Est. Budget / Rate</th>
              <th style="width:18%;">Quick Actions</th>
            </tr>
          </thead>
          <tbody>
            ${freelanceRowsHtml}
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: AI INTERVIEW COACH -->
    <div id="tab-prep" class="tab-content" style="display:none;">
      <div style="margin-bottom:16px;">
        <h3 style="margin:0 0 4px;font-size:16px;color:#0f172a;">Tailored Interview Flashcards</h3>
        <p style="margin:0;font-size:13px;color:#64748b;">RAG-generated technical questions tailored to your actual applications.</p>
      </div>
      <div class="prep-grid">
        ${interviewCardsHtml}
      </div>
    </div>

    <!-- TAB 4: BOUNCED & BLACKLISTED INBOXES -->
    <div id="tab-bounces" class="tab-content" style="display:none;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0 0 4px;font-size:16px;color:#991b1b;">Shielded Bounced Inboxes (${bouncedList.length})</h3>
          <p style="margin:0;font-size:13px;color:#b91c1c;">Deep-scanned from your Gmail Trash and Inbox. The bot will NEVER send an email to these addresses again.</p>
        </div>
        <button class="btn btn-amber" onclick="triggerAction('/api/sync-bounces', 'Deep scanning Gmail Trash & Inbox for bounce notifications...')">
          🔄 Sync Bounced Emails Now
        </button>
      </div>

      <input type="text" id="bounces-search" class="search-box" placeholder="🔍 Search blacklisted or bounced addresses..." onkeyup="filterTable('bounces-table', this.value)" />

      <div class="table-wrapper">
        <table id="bounces-table">
          <thead>
            <tr>
              <th style="width:35%;">Bounced Email Address</th>
              <th style="width:25%;">Bounce Reason</th>
              <th style="width:25%;">Detection Source</th>
              <th style="width:15%;">Safety Action</th>
            </tr>
          </thead>
          <tbody>
            ${bouncedRowsHtml}
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- Quick Apply Drawer / Cheat Sheet Modal -->
  <div id="quick-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:9999999;backdrop-filter:blur(4px);align-items:center;justify-content:center;">
    <div style="background:#fff;border-radius:16px;max-width:580px;width:92%;padding:28px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);border:1px solid #e2e8f0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
        <div>
          <span style="background:#ecfdf5;color:#047857;padding:3px 8px;border-radius:4px;font-size:11.5px;font-weight:700;">🚀 OPENED IN YOUR BROWSER</span>
          <h3 id="modal-company" style="margin:6px 0 0;font-size:18px;color:#0f172a;">Job Details</h3>
        </div>
        <button onclick="document.getElementById('quick-modal').style.display='none'" style="background:#f1f5f9;border:none;font-size:16px;border-radius:50%;width:32px;height:32px;cursor:pointer;font-weight:bold;">✕</button>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;color:#166534;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">📋</span>
        <div><b>Tailored Pitch automatically copied to your clipboard!</b><br>Simply press <code>Ctrl + V</code> in the message or cover letter box to paste it.</div>
      </div>

      <div style="font-size:12px;font-weight:800;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">1-Click Copy Answers for Recruiter Form:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;">
        <button onclick="copyCheat('0 Days (Immediate Joiner)')" class="cheat-btn">
          <span>Notice Period</span> <b>0 Days [Copy]</b>
        </button>
        <button onclick="copyCheat('11 LPA (Flexible)')" class="cheat-btn">
          <span>Expected CTC</span> <b>11 LPA [Copy]</b>
        </button>
        <button onclick="copyCheat('+91-8591684090')" class="cheat-btn">
          <span>Phone</span> <b>+91-8591684090 [Copy]</b>
        </button>
        <button onclick="copyCheat('5 LPA')" class="cheat-btn">
          <span>Current CTC</span> <b>5 LPA [Copy]</b>
        </button>
        <button onclick="copyCheat('https://github.com/Ankushsup')" class="cheat-btn">
          <span>GitHub</span> <b>github.com/Ankushsup [Copy]</b>
        </button>
        <button onclick="copyCheat('https://www.linkedin.com/in/aankush-upadhyay-5961441b6/')" class="cheat-btn">
          <span>LinkedIn URL</span> <b>Profile Link [Copy]</b>
        </button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f1f5f9;padding-top:14px;">
        <button id="modal-retry-btn" class="btn btn-primary" style="font-size:12.5px;">Re-Open Job Link ↗</button>
        <button onclick="document.getElementById('quick-modal').style.display='none'" class="btn" style="background:#e2e8f0;color:#1e293b;">Done</button>
      </div>
    </div>
  </div>

  <!-- Real-Time Floating Notification Toast -->
  <div id="toast" class="toast-box">
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div id="toast-icon" style="font-size:20px;">🚀</div>
      <div>
        <div id="toast-title" style="font-weight:bold;font-size:14px;margin-bottom:4px;">Notification</div>
        <div id="toast-msg" style="font-size:12.5px;color:#cbd5e1;line-height:1.4;">Status message</div>
      </div>
      <button onclick="document.getElementById('toast').style.display='none'" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:16px;margin-left:auto;">✕</button>
    </div>
  </div>

  <script>
    function showToast(title, msg, isSuccess = true) {
      const toast = document.getElementById('toast');
      document.getElementById('toast-title').innerText = title;
      document.getElementById('toast-msg').innerText = msg;
      toast.style.borderLeftColor = isSuccess ? '#10b981' : '#ef4444';
      document.getElementById('toast-icon').innerText = isSuccess ? '🚀' : '⚠️';
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 8000);
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.getElementById(tabId).style.display = 'block';
      event.target.classList.add('active');
    }

    function filterTable(tableId, query) {
      const q = query.toLowerCase().trim();
      const rows = document.querySelectorAll('#' + tableId + ' tbody tr.job-row');
      rows.forEach(row => {
        const text = row.getAttribute('data-search') || row.innerText.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    }

    function copyCheat(val) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(val);
        showToast('Copied to Clipboard!', val);
      }
    }

    document.addEventListener('click', async (e) => {
      // 1. 1-Click Apply
      const openApplyBtn = e.target.closest('.btn-open-apply');
      if (openApplyBtn) {
        const rawUrl = decodeURIComponent(openApplyBtn.dataset.url || '');
        const company = decodeURIComponent(openApplyBtn.dataset.company || 'Company');
        const title = decodeURIComponent(openApplyBtn.dataset.title || 'Backend Engineer');
        const cover = decodeURIComponent(openApplyBtn.dataset.cover || '');

        if (!rawUrl) return;

        window.open(rawUrl, '_blank');

        const defaultPitch = [
          "Dear " + company + " Hiring Team,",
          "",
          "I am writing to express my strong interest in the " + title + " position at " + company + ". With 3.5+ years of hands-on backend engineering experience specializing in Node.js, NestJS, and PostgreSQL, I have architected and deployed scalable distributed systems and high-throughput RESTful APIs.",
          "",
          "In my current work, I built real-time communication platforms using WebRTC and Socket.io serving 500+ concurrent users, implemented enterprise-grade security with Keycloak and RBAC, and containerized microservices using Docker and AWS EC2.",
          "",
          "I am immediately available to join (0 days notice) and welcome the opportunity to discuss how my engineering background aligns with your team's goals.",
          "",
          "Sincerely,",
          "Ankush Upadhyay",
          "+91-8591684090 | ankush.upadhyay2000@gmail.com",
          "LinkedIn: https://www.linkedin.com/in/aankush-upadhyay-5961441b6/",
          "GitHub: https://github.com/Ankushsup"
        ].join('\\n');

        const textToCopy = cover || defaultPitch;

        if (navigator.clipboard) {
          navigator.clipboard.writeText(textToCopy);
        }

        document.getElementById('modal-company').innerText = company + ' - ' + title;
        document.getElementById('modal-retry-btn').onclick = () => window.open(rawUrl, '_blank');
        document.getElementById('quick-modal').style.display = 'flex';
        return;
      }

      // 2. Copy Proposal
      const copyBtn = e.target.closest('.btn-copy-proposal');
      if (copyBtn) {
        const proposal = decodeURIComponent(copyBtn.dataset.proposal || '');
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(proposal);
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = '✅ Copied!';
          copyBtn.style.background = '#059669';
          showToast('Proposal Copied to Clipboard!', 'You can now paste it directly into Upwork, Freelancer, Email, or Client Chat.');
          setTimeout(() => {
            copyBtn.innerHTML = orig;
            copyBtn.style.background = '#7c3aed';
          }, 3000);
        }
        return;
      }

      // 3. Blacklist Button
      const blacklistBtn = e.target.closest('.btn-blacklist');
      if (blacklistBtn) {
        const company = decodeURIComponent(blacklistBtn.dataset.company || '');
        if (!company) return;
        if (!confirm('Blacklist ' + company + ' so the bot skips them in future?')) return;
        try {
          await fetch('/api/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company })
          });
          location.reload();
        } catch (err) {
          alert('Blacklist failed: ' + err.message);
        }
      }
    });

    async function triggerAction(endpoint, msg) {
      if (!confirm(msg)) return;
      try {
        const res = await fetch(endpoint, { method: 'POST' });
        const data = await res.json();
        alert(data.status || 'Action triggered successfully!');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        alert('Action failed: ' + err.message);
      }
    }
  </script>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(PORT, HOST, () => {
  console.log(`Autonomous Outreach Mission Control running at: http://${HOST}:${PORT}`);
});
