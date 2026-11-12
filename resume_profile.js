/**
 * ==============================================================================
 * 📄 AUTOMATIC RESUME DATA PARSER & PROFILE STORE
 * ==============================================================================
 * Keeps data/resume_profile.json synced with resume.pdf and provides structured
 * candidate data for:
 * 1. Autonomous job matching & cold HR email pitching (index.js, rag_matcher.js)
 * 2. Chrome Auto-Fill Extension (via GET /api/profile on dashboard.js)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const PROFILE_FILE = path.join(__dirname, 'data', 'resume_profile.json');
const RESUME_PDF = path.join(__dirname, 'resume.pdf');

const DEFAULT_PROFILE = {
  fullName: 'Ankush Upadhyay',
  firstName: 'Ankush',
  lastName: 'Upadhyay',
  email: process.env.EMAIL_USER || 'ankush.upadhyay2000@gmail.com',
  phone: '+91-8591684090',
  phoneDigits: '8591684090',
  location: 'Mumbai, India',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  role: 'Backend Engineer',
  headline: 'Backend Engineer | Node.js, TypeScript, NestJS, PostgreSQL, Redis, AWS',
  experienceYears: 3.5,
  mobileExperienceYears: 1.0,
  currentCtc: '5 LPA',
  currentCtcNum: '500000',
  expectedCtc: '11 LPA',
  expectedCtcNum: '1100000',
  noticePeriod: 'Immediate (0 Days)',
  noticePeriodDays: '0',
  currentCompany: 'D-WebBox',
  currentTitle: 'Software Developer - Backend',
  linkedin: 'https://www.linkedin.com/in/aankush-upadhyay-5961441b6/',
  github: 'https://github.com/Ankushsup',
  portfolio: 'https://github.com/Ankushsup',
  degree: 'Master of Computer Application (MCA)',
  university: 'N.M.I.T.D, Dadar, Mumbai',
  graduationYear: '2023',
  bachelors: 'B.Sc. IT - Niranjana Majithia College, Mumbai (2020)',
  summary:
    'Backend Engineer with 3.5+ years of experience building scalable REST APIs, microservices, and real-time applications using Node.js, Express.js, NestJS, TypeScript, PostgreSQL, Redis, and AWS. Engineered WebRTC/Socket.io streaming for 500+ concurrent users, implemented Keycloak SSO & RBAC, optimized PostgreSQL queries by 30-40%, and deployed containerized Docker services on AWS EC2 with 99.9% uptime. Immediately available (0 days notice period).',
  skills: [
    'Node.js', 'NestJS', 'Express.js', 'TypeScript', 'JavaScript', 'Python',
    'PostgreSQL', 'Redis', 'MongoDB', 'Elasticsearch',
    'AWS (EC2, SNS)', 'Docker', 'Nginx', 'CI/CD Pipelines',
    'Keycloak', 'JWT', 'RBAC', 'WebRTC', 'Socket.io',
    'RESTful APIs', 'Microservices', 'React Native', 'Git'
  ],
  workExperience: [
    {
      company: 'D-WebBox',
      role: 'Software Developer - Backend',
      duration: 'June 2025 - October 2026',
      location: 'Mumbai, India',
      highlights: [
        'MNM Fitness Platform: Built Node.js + PostgreSQL backend and real-time WebRTC/Socket.io infrastructure serving 500+ concurrent live video/audio users with sub-second sync and Redis reconnection handling.',
        'Enterprise Security: Implemented Keycloak SSO and fine-grained RBAC across multi-tenant microservices.',
        'DevOps & Search: Containerized services with Docker on AWS EC2 behind Nginx (99.9% uptime) and integrated Elasticsearch (~60% faster search).',
        'GenWe EdTech: Built Redis-backed OTP authentication via AWS SNS and Google reCAPTCHA.'
      ]
    },
    {
      company: 'Texple Technologies',
      role: 'Backend Developer',
      duration: 'Feb 2023 - June 2025',
      location: 'Mumbai, India',
      highlights: [
        'Developed high-throughput REST APIs using Node.js & Express.js.',
        'Built RBAC and JWT authentication with Active Directory integration.',
        'Optimized PostgreSQL schemas, views, and composite indexes cutting query execution times by 30%.'
      ]
    }
  ],
  projects: [
    {
      name: 'Movie Ticket Booking Chatbot (WhatsApp)',
      tech: 'Node.js, Express.js, MongoDB, Meta WhatsApp Business API',
      summary: 'Engineered automated conversational ticket booking flows with WhatsApp Cloud Webhooks, dynamic templates, and stateful session routing.'
    }
  ],
  resumePath: RESUME_PDF,
  updatedAt: new Date().toISOString()
};

function ensureProfileFile() {
  const dir = path.dirname(PROFILE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(PROFILE_FILE)) {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(DEFAULT_PROFILE, null, 2), 'utf-8');
  }
}

function getResumeProfile() {
  ensureProfileFile();
  try {
    const saved = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
    return {
      ...DEFAULT_PROFILE,
      ...saved,
      resumePath: RESUME_PDF
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveResumeProfile(updates) {
  const current = getResumeProfile();
  const merged = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

/**
 * Uses Gemini multimodal to re-parse resume.pdf automatically if the user
 * drops a brand-new resume.pdf into the folder.
 */
async function syncFromResumePdf(apiKey) {
  if (!fs.existsSync(RESUME_PDF)) return getResumeProfile();
  if (!apiKey) return getResumeProfile();

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const pdfBase64 = fs.readFileSync(RESUME_PDF).toString('base64');

    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        `Extract the candidate's resume data into strict JSON matching these keys:
fullName, firstName, lastName, email, phone, location, city, state, country, role, headline, experienceYears (number), currentCompany, currentTitle, linkedin, github, degree, university, graduationYear, summary, skills (string array), workExperience (array of {company, role, duration, location, highlights}).
Return ONLY valid JSON.`
      ]
    });

    const raw = (res.text || '').trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(raw);
    const updated = saveResumeProfile(parsed);
    console.log(`✅ [Resume Parser] Synced profile from resume.pdf for ${updated.fullName}`);
    return updated;
  } catch (err) {
    console.warn(`⚠️ [Resume Parser] Using saved profile (${err.message})`);
    return getResumeProfile();
  }
}

if (require.main === module) {
  require('dotenv').config();
  if (process.argv.includes('--sync-pdf')) {
    syncFromResumePdf(process.env.GEMINI_API_KEY).then(p => console.log(JSON.stringify(p, null, 2)));
  } else {
    const p = getResumeProfile();
    console.log('✅ Profile loaded:', p.fullName, '| Skills:', p.skills.length);
  }
}

module.exports = { getResumeProfile, saveResumeProfile, syncFromResumePdf, PROFILE_FILE };

