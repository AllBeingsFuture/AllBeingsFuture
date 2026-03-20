@echo off
setlocal

REM If a directory is passed as argument, switch to it; otherwise use bat file's directory
if not "%~1"=="" (
  cd /d "%~1"
) else (
  cd /d "%~dp0"
)

claude --dangerously-skip-permissions
