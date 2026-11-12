/**
 * ==============================================================================
 * 🚀 UNIFIED MISSION CONTROL LAUNCHER (BACKEND + FRONTEND)
 * ==============================================================================
 * Spawns both:
 * 1. Web Dashboard Frontend (http://localhost:3000)
 * 2. 24/7 Autonomous Scanner Backend (index.js)
 * Automatically opens http://localhost:3000 in your browser!
 * ==============================================================================
 */

const { spawn, exec } = require('child_process');
const path = require('path');

const nodeExec = process.execPath;
const cwd = __dirname;

console.log('======================================================================');
console.log('🚀 STARTING AUTONOMOUS JOB SEARCH & FREELANCE MISSION CONTROL');
console.log('Candidate: Ankush Upadhyay (3.5+ YOE Backend | Expected CTC: 11+ LPA)');
console.log('======================================================================\n');

// 1. Spawn Dashboard Frontend
console.log('🌐 [1/2] Starting Frontend Web Dashboard on http://localhost:3000...');
const dashboard = spawn(nodeExec, ['dashboard.js'], { cwd, stdio: 'inherit' });

dashboard.on('error', (err) => {
  console.error('❌ Failed to start dashboard:', err.message);
});

// 2. Open Browser after 2 seconds
setTimeout(() => {
  console.log('🖥️ Opening http://localhost:3000 in your default browser...');
  exec('start http://localhost:3000');
}, 2000);

// 3. Spawn Backend Scanner Daemon after 1 second
setTimeout(() => {
  console.log('\n🤖 [2/2] Starting 24/7 Autonomous Scanner Daemon...');
  const scanner = spawn(nodeExec, ['index.js'], { cwd, stdio: 'inherit' });

  scanner.on('error', (err) => {
    console.error('❌ Failed to start scanner:', err.message);
  });
}, 1000);

// Handle clean shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Job Bot services cleanly...');
  try { dashboard.kill(); } catch {}
  process.exit(0);
});

