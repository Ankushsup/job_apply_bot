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
const fs = require('fs');

let nodeExec = process.execPath;
if (parseInt(process.versions.node.split('.')[0], 10) < 18) {
  const candidateNodes = ['/opt/homebrew/bin/node', '/usr/local/bin/node'];
  for (const c of candidateNodes) {
    if (fs.existsSync(c)) {
      nodeExec = c;
      break;
    }
  }
}
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
  const openCmd = process.platform === 'darwin' ? 'open http://localhost:3000' : process.platform === 'win32' ? 'start http://localhost:3000' : 'xdg-open http://localhost:3000';
  exec(openCmd);
}, 2000);

let scanner;
setTimeout(() => {
  console.log('\n🤖 [2/2] Starting 24/7 Autonomous Scanner Daemon...');
  scanner = spawn(nodeExec, ['index.js'], { cwd, stdio: 'inherit' });

  scanner.on('error', (err) => {
    console.error('❌ Failed to start scanner:', err.message);
  });
}, 1000);

// Handle clean shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Job Bot services cleanly...');
  try { dashboard.kill(); } catch {}
  try { if (scanner) scanner.kill(); } catch {}
  process.exit(0);
});

