@echo off
title MaiYu Workshop

echo ========================================
echo    MaiYu Workshop - AI Q&A Platform
echo ========================================

cd /d "%~dp0"

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found.
  echo Install Node.js 18+ from https://nodejs.org/
  pause
  exit /b 1
)

:: Step 1: Build frontend
echo.
echo [1/2] Building frontend...

cd /d "%~dp0frontend"
if not exist node_modules\ (
  echo   Installing frontend dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
)

call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Frontend build failed
  pause
  exit /b 1
)
echo   Frontend built successfully

:: Step 2: Install backend deps
cd /d "%~dp0backend"
if not exist node_modules\ (
  echo   Installing backend dependencies...
  call npm install
)

:: Step 3: Start server
echo.
echo [2/2] Starting server on http://localhost:3001
echo.

echo ========================================
echo   URL:   http://localhost:3001
echo   User:  admin
echo   Pass:  admin123
echo ========================================
echo.

start "MaiYuWorkshop" cmd /k "cd /d %~dp0backend && node src/app.js"

timeout /t 3 /nobreak > nul
start http://localhost:3001
