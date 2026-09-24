@echo off
setlocal enabledelayedexpansion
title CityHost - 1-Click Google Cloud Run Deployer
color 0B

echo.
echo  =============================================================
echo    City Host - 1-Click Automatic Google Cloud Run Deployer
echo  =============================================================
echo.

:: 1. Navigate to script directory
cd /d "%~dp0"

:: 2. Ensure docker-entrypoint.sh has Linux LF line endings (prevents container crash)
echo [1/3] Ensuring clean container line endings...
powershell -NoProfile -Command "$f = 'docker-entrypoint.sh'; if (Test-Path $f) { $t = [System.IO.File]::ReadAllText($f).Replace(\"`r`n\", \"`n\"); [System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding $false)) }" >nul 2>&1

:: 3. Check gcloud CLI
echo [2/3] Checking Google Cloud SDK...
where gcloud >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Google Cloud SDK gcloud is not found in PATH!
    echo Please install or open Google Cloud SDK Shell.
    echo.
    pause
    exit /b 1
)

:: 4. Deploy directly to Google Cloud Run with mapped parameters
echo [3/3] Building and deploying to Google Cloud Run...
echo       Project:  project-032ba178-497a-4f65-950
echo       Service:  cityhost-app
echo       Region:   asia-south1
echo       Domain:   https://cityhost.live
echo.

call gcloud run deploy cityhost-app ^
  --project project-032ba178-497a-4f65-950 ^
  --region asia-south1 ^
  --source . ^
  --allow-unauthenticated ^
  --quiet

if %ERRORLEVEL% equ 0 (
    color 0A
    echo.
    echo  =============================================================
    echo    SUCCESS: City Host successfully deployed to Google Cloud!
    echo    Live Website: https://cityhost.live
    echo  =============================================================
    echo.
    echo Opening https://cityhost.live in your browser...
    start https://cityhost.live
) else (
    color 0C
    echo.
    echo  =============================================================
    echo    DEPLOYMENT FAILED: Check the error messages above.
    echo  =============================================================
    echo.
)

echo.
echo Press any key to exit...
pause >nul
