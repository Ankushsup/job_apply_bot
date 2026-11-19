/**
 * ==============================================================================
 * 🧠 ADVANCED RAG MATCHER & STRICT RESUME STACK FILTER
 * ==============================================================================
 * Candidate: Ankush Upadhyay
 * Core Stack: Node.js, NestJS, Express.js, TypeScript, PostgreSQL, Redis,
 *             AWS (EC2, SNS), Docker, Microservices, MongoDB, React Native
 * Experience: 3.5+ Years Backend, 1 Year React Native
 * Notice Period: 0 Days (Immediate Joiner)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const KNOWLEDGE_PATH = path.join(__dirname, 'data', 'rag_knowledge.json');

let knowledgeChunks = [];
try {
  knowledgeChunks = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf-8'));
} catch (err) {
  knowledgeChunks = [];
}

// Strict Negative Filter: Reject incompatible technologies & seniorities
const NEGATIVE_TITLE_REGEX = /\b(java|spring|springboot|php|laravel|codeigniter|symfony|c#|\.net|dotnet|asp\.net|ruby|rails|wordpress|magento|drupal|salesforce|devops|sre|qa|tester|sdet|flutter|swift|ios|kotlin|android|director|vice president|vp of engineering|head of engineering)\b/i;

const SENIOR_EXPERIENCE_REGEX = /\b(8\+|9\+|10\+|12\+|15\+)\s*(years|yoe|yrs)\b/i;

function retrieveRelevantMemories(jobText) {
  if (!knowledgeChunks.length) return [];
  const lower = jobText.toLowerCase();

  const scored = knowledgeChunks.map(chunk => {
    let score = 0;
    for (const kw of chunk.keywords) {
      if (lower.includes(kw)) score += 1;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(s => s.score > 0).slice(0, 2).map(s => s.chunk);
  return top.length > 0 ? top : [knowledgeChunks[0]];
}

/**
 * Main RAG function: Evaluates match and generates a custom tailored pitch
 */
async function matchJobWithRAG(job, candidate, apiKey) {
  const title = (job.title || '').trim();
  const desc = (job.description || '').substring(0, 2500);
  const fullText = `${title} ${job.company} ${job.location} ${job.tags || ''} ${desc}`;
  const lowerText = fullText.toLowerCase();

  // ── 1. STRICT NEGATIVE CHECK ────────────────────────────────────────────────
  if (NEGATIVE_TITLE_REGEX.test(title)) {
    // Exception: If title mentions React Native or Node.js alongside
    const hasCore = /\b(node|nodejs|nest|nestjs|express|react native)\b/i.test(title);
    if (!hasCore) {
      return {
        score: 20,
        reason: `Incompatible technology stack in title: "${title}" (Expected Node.js/NestJS backend)`,
        pitch: ''
      };
    }
  }

  if (SENIOR_EXPERIENCE_REGEX.test(desc)) {
    return {
      score: 30,
      reason: 'Role requires 8-15+ years experience (Candidate has 3.5 YOE)',
      pitch: ''
    };
  }

  // ── 2. CORE STACK WHITELIST CHECK ───────────────────────────────────────────
  const hasNode = /\b(node|nodejs|node\.js|nest|nestjs|nest\.js|express|express\.js)\b/i.test(lowerText);
  const hasTsOrJs = /\b(typescript|javascript)\b/i.test(lowerText);
  const hasBackendGeneral = /\b(backend|back-end|api|microservice|rest|database)\b/i.test(lowerText);
  const hasReactNative = /\b(react native)\b/i.test(lowerText);

  if (!hasNode && !hasReactNative && !hasBackendGeneral) {
    return {
      score: 35,
      reason: 'No Node.js, NestJS, TypeScript, or relevant backend stack found in job requirements',
      pitch: ''
    };
  }

  const retrievedMemories = retrieveRelevantMemories(fullText);
  const contextStr = retrievedMemories
    .map(m => `- [${m.domain}] (${m.project}): ${m.highlight}`)
    .join('\n');

  // ── 3. AI EVALUATION WITH GEMINI (If Available) ──────────────────────────────
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
You are an expert technical recruiter representing candidate Ankush Upadhyay.
Candidate Profile:
- Role: Backend Engineer (3.5+ YOE in Node.js, NestJS, Express, TypeScript, PostgreSQL, Redis, AWS EC2/SNS, Docker, Microservices, MongoDB; 1 YOE React Native)
- Notice Period: Immediately Available (0 Days Notice Period)
- Location: Mumbai, India / Remote
- Expected CTC: 11 LPA

RETRIEVED CANDIDATE PROJECT HIGHLIGHTS:
${contextStr}

TARGET JOB:
- Title: ${title}
- Company: ${job.company}
- Location: ${job.location}
- Description: ${desc.substring(0, 1200)}

TASK:
1. Score match 0-100:
   - 88-100: Direct Node.js / NestJS / TypeScript backend or microservices role.
   - 75-87: General backend where Node.js & high-throughput API skills apply.
   - < 70: Incompatible tech stack (PHP, Java, C#, pure frontend, etc.).
2. Write a 2-paragraph bespoke application email to ${job.company} Hiring Team:
   - Paragraph 1: State strong interest in ${title} at ${job.company}, highlighting 3.5+ YOE in Node.js, NestJS, and PostgreSQL.
   - Paragraph 2: Mention specific production achievements (500+ concurrent WebRTC connections, Keycloak RBAC security, Redis caching, AWS EC2). Emphasize immediate availability (0 days notice).

Return ONLY valid JSON:
{
  "score": 92,
  "reason": "1 clear sentence explaining technical fit",
  "pitch": "The tailored cold email pitch"
}`;

      const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
      let res = null;
      for (const mod of candidateModels) {
        try {
          res = await ai.models.generateContent({
            model: mod,
            contents: prompt
          });
          if (res && res.text) break;
        } catch (mErr) {
          if (mErr.message && (mErr.message.includes('503') || mErr.message.includes('429') || mErr.message.includes('high demand'))) {
            continue; // try next model fallback
          }
          throw mErr;
        }
      }

      const raw = (res && res.text) ? res.text.trim() : '';
      const cleanJson = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        score: parsed.score || 85,
        reason: parsed.reason || 'Matched backend engineering profile via RAG',
        pitch: parsed.pitch || getDefaultCoverLetter(job, candidate, retrievedMemories)
      };
    } catch (err) {
      console.warn(`   ⚠️  [RAG Gemini Notice]: ${err.message}`);
    }
  }

  // ── 4. DETERMINISTIC HEURISTIC FALLBACK ─────────────────────────────────────
  let score = 65;
  const reasons = [];

  if (hasNode) {
    score += 25;
    reasons.push('Direct Node.js/NestJS match');
  }
  if (lowerText.includes('postgres') || lowerText.includes('redis') || lowerText.includes('microservice')) {
    score += 10;
    reasons.push('Database & distributed architecture alignment');
  }

  return {
    score: Math.min(score, 95),
    reason: reasons.join('; '),
    pitch: getDefaultCoverLetter(job, candidate, retrievedMemories)
  };
}

function getDefaultCoverLetter(job, candidate, retrievedMemories) {
  const topHighlight = retrievedMemories.length ? retrievedMemories[0].highlight : 'Built scalable RESTful microservices with Node.js, NestJS, PostgreSQL, and Redis.';

  return `Dear ${job.company} Hiring Team,\n\nI am writing to express my strong interest in the ${job.title} position at ${job.company}. With 3.5+ years of hands-on backend engineering experience specializing in Node.js, NestJS, Express.js, PostgreSQL, Redis, and AWS, I have architected and deployed high-throughput distributed systems and mission-critical APIs.\n\nIn my recent work, I ${topHighlight.toLowerCase()} I am immediately available to join with 0 days notice period and eager to deliver immediate technical impact to ${job.company}.\n\nI have attached my resume for your review and look forward to discussing how my backend engineering background aligns with your team's goals.\n\nSincerely,\n${candidate.fullName}\n${candidate.phone} | ${candidate.email}\nNotice Period: Immediate (0 Days)\nLinkedIn: ${candidate.linkedin}\nGitHub: ${candidate.github}`;
}

module.exports = { matchJobWithRAG, NEGATIVE_TITLE_REGEX };
