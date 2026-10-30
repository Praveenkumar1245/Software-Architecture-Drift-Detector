# Software Architecture Drift Detector - PowerShell Server Launcher
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " Software Architecture Drift Detector - Starting Services" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot

Write-Host "`n[1/3] Starting Backend API Server (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; .\.venv\Scripts\Activate.ps1; python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "[2/3] Starting Frontend Dev Server (Port 5173)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k", "cd /d `"$PSScriptRoot\frontend`" && npm run dev"

Write-Host "[3/3] Opening application in browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173/"

Write-Host "`n=====================================================================" -ForegroundColor Green
Write-Host " Servers are running!" -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:5173/" -ForegroundColor White
Write-Host "  - Backend API: http://127.0.0.1:8000/" -ForegroundColor White
Write-Host "  - API Swagger Docs: http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "`n Default Credentials:" -ForegroundColor Green
Write-Host "  - Email: architect@enterprise.com" -ForegroundColor White
Write-Host "  - Password: password123" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Green
