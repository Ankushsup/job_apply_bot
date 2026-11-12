@echo off
cd /d "%~dp0"
echo ======================================================
echo    DIRECT HR & RECRUITER OUTREACH
echo ======================================================
echo.
echo Press 1 to PREVIEW emails (Dry Run - No emails sent)
echo Press 2 to SEND live applications to HR with resume.pdf
echo.
set /p choice="Enter choice (1 or 2): "

if "%choice%"=="1" (
    "C:\Program Files\nodejs\node.exe" send_hr_campaign.js --dry-run
) else if "%choice%"=="2" (
    "C:\Program Files\nodejs\node.exe" send_hr_campaign.js
) else (
    echo Invalid choice. Exiting.
)

pause

