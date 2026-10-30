@echo off
title Software Architecture Drift Detector - Server Launcher
echo =====================================================================
echo  Software Architecture Drift Detector - Starting Services
echo =====================================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Backend API Server (FastAPI + Uvicorn on port 8000)...
start "Backend - FastAPI" cmd /k "call .\.venv\Scripts\activate.bat && python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/3] Starting Frontend Dev Server (Vite on port 5173)...
start "Frontend - Vite" cmd /k "cd frontend && npm run dev"

echo [3/3] Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening application in default browser...
start http://localhost:5173/

echo.
echo =====================================================================
echo  Servers are running!
echo   - Frontend: http://localhost:5173/
echo   - Backend API: http://127.0.0.1:8000/
echo   - API Swagger Docs: http://127.0.0.1:8000/docs
echo.
echo  Default Login:
echo   - Email: architect@enterprise.com
echo   - Password: password123
echo =====================================================================
echo.
pause
