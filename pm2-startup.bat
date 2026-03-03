@echo off
REM PM2 auto-start on Windows login
timeout /t 10 /nobreak >nul
call pm2 resurrect
