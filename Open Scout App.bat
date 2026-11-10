@echo off
title Morning AI Scout
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python app\server.py
) else (
  "C:\Python310\python.exe" app\server.py
)
pause
