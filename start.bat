@echo off
title GIB Backup System Startup

echo.
echo ===============================================
echo   GIB Backup System - Starting...
echo ===============================================
echo.

:: ── Kill anything already on port 8001 ─────────────
echo [1/4] Checking port 8001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    echo       Found process %%a on port 8001 - killing it...
    taskkill /PID %%a /F >nul 2>&1
)
echo       Port 8001 is free.

:: ── Kill anything already on port 5173 ─────────────
echo [2/4] Checking port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo       Found process %%a on port 5173 - killing it...
    taskkill /PID %%a /F >nul 2>&1
)
echo       Port 5173 is free.

:: ── Start Backend ───────────────────────────────────
echo [3/4] Starting Backend on port 8001...
start "GIB Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001"

:: Wait for backend to be ready
echo       Waiting for backend to start...
timeout /t 5 /nobreak >nul

:: ── Start Frontend ──────────────────────────────────
echo [4/4] Starting Frontend on port 5173...
start "GIB Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ===============================================
echo   Both services started!
echo.
echo   Open in browser: http://localhost:5173
echo   Backend API:     http://localhost:8001
echo   Backend health:  http://localhost:8001/health
echo ===============================================
echo.
pause
