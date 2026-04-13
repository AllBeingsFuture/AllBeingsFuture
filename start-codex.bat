@echo off
setlocal
cd /d "%~dp0"

where codex >nul 2>nul
if %errorlevel%==0 (
  codex
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  npx @openai/codex
  goto :eof
)

echo codex and npx were not found in PATH.
pause
