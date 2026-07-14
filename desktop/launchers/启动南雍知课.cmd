@echo off
cd /d "%~dp0"
NanyongZhike.exe
if errorlevel 1 (
  echo.
  echo Startup failed. Please keep the message above and report it on GitHub Issues.
  pause
)
