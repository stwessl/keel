@echo off
cd /d "%~dp0"
where node >nul 2>&1
if %errorlevel%==0 (
  node src\server.js
) else (
  "C:\Program Files\nodejs\node.exe" src\server.js
)
