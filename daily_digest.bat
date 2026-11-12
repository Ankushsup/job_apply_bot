@echo off
cd /d "%~dp0"
echo ======================================================
echo    SENDING DAILY JOB DIGEST EMAIL (ONE SUMMARY)
echo ======================================================
echo.
"C:\Program Files\nodejs\node.exe" index.js --digest
echo.
pause

