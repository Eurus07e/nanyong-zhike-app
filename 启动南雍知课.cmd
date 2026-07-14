@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Nanyong Zhike

echo [1/4] Checking runtime...
where py >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python was not found. Install Python 3.11 or newer from:
  echo https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found. Install Node.js 20 or newer from:
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [2/4] First run: creating an isolated Python environment...
  py -3 -m venv .venv
  if errorlevel 1 goto :failed
)

if not exist ".venv\.nanyong-ready" (
  echo [2/4] First run: installing Python dependencies...
  ".venv\Scripts\python.exe" -m pip install -e .
  if errorlevel 1 goto :failed
  type nul > ".venv\.nanyong-ready"
) else (
  echo [2/4] Python dependencies are ready.
)

if not exist "frontend\node_modules\" (
  echo [3/4] First run: installing frontend dependencies...
  call npm ci --prefix frontend
  if errorlevel 1 goto :failed
)

echo [3/4] Building the latest frontend...
call npm run build --prefix frontend
if errorlevel 1 goto :failed

if not exist "bin\nju-cli.exe" (
  if not exist "bin\" mkdir "bin"
  if not exist "%~dp0..\NanyongZhike-windows-x86_64\_internal\bin\nju-cli.exe" (
    echo.
    echo Bundled nju-cli.exe was not found.
    echo Keep nanyong-zhike-app beside the original NanyongZhike-windows-x86_64 folder.
    pause
    exit /b 1
  )
  echo [4/4] Linking the bundled login component...
  mklink /H "bin\nju-cli.exe" "%~dp0..\NanyongZhike-windows-x86_64\_internal\bin\nju-cli.exe" >nul 2>nul
  if errorlevel 1 copy /Y "%~dp0..\NanyongZhike-windows-x86_64\_internal\bin\nju-cli.exe" "bin\nju-cli.exe" >nul
  if errorlevel 1 goto :failed
) else (
  echo [4/4] Login component is ready.
)

echo.
".venv\Scripts\python.exe" desktop\launcher.py
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Startup failed. Keep the error messages above for troubleshooting.
pause
exit /b 1
