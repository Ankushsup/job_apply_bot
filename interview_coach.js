/**
 * ==============================================================================
 * 🎯 AI INTERVIEW COACH & QUESTION PREDICTOR
 * ==============================================================================
 * For any job with match score >= 75%, generates:
 * 1. Top 3 technical questions this company will ask Ankush
 * 2. Strategic cheat-sheet answers leveraging his real projects
 * Saved in data/interview_prep.json for instant review on localhost:3000
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const PREP_FILE = path.join(__dirname, 'data', 'interview_prep.json');
if (!fs.existsSync(PREP_FILE)) fs.writeFileSync(PREP_FILE, '[]', 'utf-8');

async function generateInterviewPrep(job, apiKey) {
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
You are a senior engineering manager conducting a technical interview for:
Role: ${job.title} at ${job.company}
Description: ${(job.description || '').substring(0, 1200)}

Candidate: Ankush Upadhyay (3.5+ YOE Backend Engineer)
Core Stack: Node.js, NestJS, PostgreSQL, Redis, AWS EC2, WebRTC, Socket.io, Keycloak RBAC.

TASK:
Predict the top 3 rigorous technical/system design questions this specific company will ask Ankush, and provide a 2-line strategic answer for each that references his actual achievements (e.g. 500+ WebRTC users, Keycloak RBAC, or PostgreSQL indexing).

Return ONLY valid JSON (no markdown):
[
  {
    "question": "Question 1",
    "tip": "How Ankush should answer citing his real experience"
  },
  {
    "question": "Question 2",
    "tip": "How Ankush should answer citing his real experience"
  },
  {
    "question": "Question 3",
    "tip": "How Ankush should answer citing his real experience"
  }
]`;

    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const raw = res.text ? res.text.trim() : '';
    const cleanJson = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const questions = JSON.parse(cleanJson);

    const record = {
      jobId: job.id,
      company: job.company,
      title: job.title,
      generatedAt: new Date().toISOString(),
      questions
    };

    const list = JSON.parse(fs.readFileSync(PREP_FILE, 'utf-8'));
    list.unshift(record);
    if (list.length > 50) list.pop();
    fs.writeFileSync(PREP_FILE, JSON.stringify(list, null, 2), 'utf-8');

    return record;
  } catch (err) {
    // Failover silently
    return null;
  }
}

function getLatestPrepCards() {
  try {
    if (!fs.existsSync(PREP_FILE)) return [];
    return JSON.parse(fs.readFileSync(PREP_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

module.exports = { generateInterviewPrep, getLatestPrepCards };

