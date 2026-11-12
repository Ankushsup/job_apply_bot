@echo off
title Autonomous Job Apply Mission Control Launcher
cd /d "%~dp0"

echo ==============================================================================
echo   🚀 LAUNCHING AUTONOMOUS JOB SEARCH & FREELANCE MISSION CONTROL
echo ==============================================================================
echo   Candidate : Ankush Upadhyay (3.5+ YOE Backend Engineer)
echo   Starting  :
echo     1. Frontend Web Dashboard (http://localhost:3000)
echo     2. Backend Autonomous Scanner Daemon (15 Job Platforms)
echo     3. Zero-Bounce Mail Protection (Trash & Inbox Auto-Sync)
echo ==============================================================================

:: 1. Launch Frontend Dashboard in its own persistent console
start "Job Bot - Dashboard Frontend (Port 3000)" cmd /k ""C:\Program Files\nodejs\node.exe" dashboard.js"

:: 2. Wait 2 seconds for server to initialize
timeout /t 2 /nobreak >nul

:: 3. Automatically open the Web Dashboard in your browser
start http://localhost:3000

:: 4. Launch 24/7 Backend Scanner Daemon right in this main window
echo.
echo 🟢 Frontend Dashboard active at http://localhost:3000 (opened in your browser)
echo 🟢 Launching 24/7 Autonomous Backend Scanner Daemon in this console...
echo ==============================================================================
"C:\Program Files\nodejs\node.exe" index.js
pause
