@echo off
setlocal
set "SEEDBANK_DIR=%~dp0"
set "INSTALLER_PS1=%~dp0Install-Seedbank.ps1"
if not exist "%INSTALLER_PS1%" set "INSTALLER_PS1=%~dp0scripts\Install-Seedbank.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER_PS1%"
if errorlevel 1 (
  echo.
  echo Seedbank install failed. See the message above.
  pause
  exit /b 1
)
