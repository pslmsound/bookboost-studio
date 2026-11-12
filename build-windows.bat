@echo off
rem BookBoost Studio: one step Windows build.
rem Double-click this file on a Windows 10 or 11 PC that has Node.js 22 LTS installed.
setlocal
cd /d "%~dp0"
title BookBoost Studio build

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo [1/4] Installing dependencies. The first run downloads about 400 MB.
call npm ci
if errorlevel 1 goto :fail

echo.
echo [2/4] Running tests.
call npm test
if errorlevel 1 goto :fail

echo.
echo [3/4] Building the app.
call npm run build
if errorlevel 1 goto :fail

echo.
echo [4/4] Creating the installer.
call npx electron-builder --win nsis --x64
if errorlevel 1 goto :fail

echo.
echo Done. The installer is in the "release" folder:
dir /b release\*.exe
start "" explorer release
echo.
pause
exit /b 0

:fail
echo.
echo The build stopped because a step failed. Scroll up to see the first error.
echo See the Troubleshooting section of README.md.
echo.
pause
exit /b 1
