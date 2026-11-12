const FALLBACK_PROFILE = {
  fullName: 'Ankush Upadhyay',
  firstName: 'Ankush',
  lastName: 'Upadhyay',
  email: 'ankush.upadhyay2000@gmail.com',
  phone: '+91-8591684090',
  phoneDigits: '8591684090',
  location: 'Mumbai, India',
  city: 'Mumbai',
  currentCompany: 'D-WebBox',
  currentTitle: 'Software Developer - Backend',
  experienceYears: '3.5',
  currentCtc: '5 LPA',
  currentCtcNum: '500000',
  expectedCtc: '11 LPA',
  expectedCtcNum: '1100000',
  noticePeriod: 'Immediate (0 Days)',
  noticePeriodDays: '0',
  linkedin: 'https://www.linkedin.com/in/aankush-upadhyay-5961441b6/',
  github: 'https://github.com/Ankushsup',
  portfolio: 'https://github.com/Ankushsup',
  degree: 'Master of Computer Application (MCA)',
  university: 'N.M.I.T.D, Dadar, Mumbai',
  skills: ['Node.js', 'NestJS', 'Express.js', 'TypeScript', 'PostgreSQL', 'Redis', 'AWS', 'Docker', 'WebRTC', 'Keycloak'],
  summary: 'Backend Engineer with 3.5+ years of experience building scalable REST APIs, microservices, and real-time systems using Node.js, Express.js, NestJS, TypeScript, PostgreSQL, Redis, and AWS. Engineered WebRTC/Socket.io streaming for 500+ concurrent users, implemented Keycloak SSO & RBAC, and optimized PostgreSQL queries by 30-40%. Immediately available (0 days notice).'
};

let activeProfile = FALLBACK_PROFILE;

async function loadLiveProfile() {
  const badge = document.getElementById('syncBadge');
  try {
    const res = await fetch('http://localhost:3000/api/profile', { cache: 'no-store' });
    if (res.ok) {
      activeProfile = await res.json();
      badge.textContent = 'Live Sync ✓';
      chrome.storage.local.set({ ankushProfile: activeProfile });
      renderCopyChips();
      return;
    }
  } catch {}

  chrome.storage.local.get(['ankushProfile'], (data) => {
    if (data && data.ankushProfile) activeProfile = data.ankushProfile;
    badge.textContent = 'Offline Cache';
    renderCopyChips();
  });
}

function renderCopyChips() {
  const grid = document.getElementById('copyGrid');
  const items = [
    ['👤 Name', activeProfile.fullName],
    ['📧 Email', activeProfile.email],
    ['📞 Phone', activeProfile.phone],
    ['💼 Exp (YOE)', `${activeProfile.experienceYears} Years`],
    ['💰 Current CTC', activeProfile.currentCtc],
    ['🎯 Expected CTC', activeProfile.expectedCtc],
    ['⏰ Notice', activeProfile.noticePeriod],
    ['📍 City', activeProfile.location],
    ['🔗 LinkedIn URL', activeProfile.linkedin, true],
    ['💻 GitHub URL', activeProfile.github, true],
    ['🛠️ Tech Skills', (activeProfile.skills || []).join(', '), true],
    ['📝 Resume Summary / Cover Pitch', activeProfile.summary, true]
  ];

  grid.innerHTML = '';
  items.forEach(([label, val, full]) => {
    const btn = document.createElement('button');
    btn.className = full ? 'chip chip-full' : 'chip';
    btn.textContent = label;
    btn.title = val;
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(val || '');
      document.getElementById('status').textContent = `Copied: ${label}`;
    });
    grid.appendChild(btn);
  });
}

document.getElementById('fillBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js']
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (profile) => window.__ankushAutoFill ? window.__ankushAutoFill(profile) : { filled: 0 },
      args: [activeProfile]
    });
    const totalFilled = results.reduce((sum, r) => sum + (r.result?.filled || 0), 0);
    status.textContent = totalFilled > 0
      ? `✅ Auto-filled ${totalFilled} field(s) on this page!`
      : '⚠️ No standard inputs found—use Copy buttons below!';
  } catch (err) {
    status.textContent = `❌ Error: ${err.message}`;
  }
});

loadLiveProfile();

