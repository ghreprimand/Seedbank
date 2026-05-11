@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "SEEDBANK_DIR=%%~fI"
if not "%SEEDBANK_DIR_OVERRIDE%"=="" set "SEEDBANK_DIR=%SEEDBANK_DIR_OVERRIDE%"
if "%SEEDBANK_CLIENT_PORT%"=="" set "SEEDBANK_CLIENT_PORT=5173"
if "%SEEDBANK_SERVER_PORT%"=="" set "SEEDBANK_SERVER_PORT=4800"
if "%APPDATA%"=="" set "CACHE_DIR=%USERPROFILE%\.seedbank"
if not "%APPDATA%"=="" set "CACHE_DIR=%APPDATA%\seedbank"
set "CLIENT_PID_FILE=%CACHE_DIR%\client.pid"
set "SERVER_PID_FILE=%CACHE_DIR%\server.pid"
set "LOG_FILE=%CACHE_DIR%\seedbank.log"
set "URL=http://localhost:%SEEDBANK_CLIENT_PORT%"

if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%" >nul 2>nul

if "%~1"=="" goto start
if /I "%~1"=="start" goto start
if /I "%~1"=="stop" goto stop
if /I "%~1"=="restart" goto restart
if /I "%~1"=="status" goto status
if /I "%~1"=="logs" goto logs
goto usage

:port_pid
set "FOUND_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
  set "FOUND_PID=%%P"
  goto :eof
)
goto :eof

:ensure_setup
if not exist "%SEEDBANK_DIR%\node_modules" (
  echo Installing npm dependencies...
  pushd "%SEEDBANK_DIR%" >nul
  call npm install >> "%LOG_FILE%" 2>&1
  if errorlevel 1 exit /b 1
  popd >nul
)
if not exist "%SEEDBANK_DIR%\client\dist\index.html" (
  echo Building Seedbank...
  pushd "%SEEDBANK_DIR%" >nul
  call npm run build >> "%LOG_FILE%" 2>&1
  if errorlevel 1 exit /b 1
  popd >nul
) else if not exist "%SEEDBANK_DIR%\server\dist" (
  echo Building Seedbank...
  pushd "%SEEDBANK_DIR%" >nul
  call npm run build >> "%LOG_FILE%" 2>&1
  if errorlevel 1 exit /b 1
  popd >nul
)
exit /b 0

:start
call :port_pid %SEEDBANK_CLIENT_PORT%
if not "!FOUND_PID!"=="" (
  echo Client port %SEEDBANK_CLIENT_PORT% is already in use by PID !FOUND_PID!.
  exit /b 1
)
call :port_pid %SEEDBANK_SERVER_PORT%
if not "!FOUND_PID!"=="" (
  echo Server port %SEEDBANK_SERVER_PORT% is already in use by PID !FOUND_PID!.
  exit /b 1
)
call :ensure_setup
if errorlevel 1 exit /b 1

echo.>> "%LOG_FILE%"
echo === %DATE% %TIME% - seedbank start client=%SEEDBANK_CLIENT_PORT% server=%SEEDBANK_SERVER_PORT% ===>> "%LOG_FILE%"

pushd "%SEEDBANK_DIR%" >nul
start "Seedbank Server" /b cmd /c "set PORT=%SEEDBANK_SERVER_PORT%&& npm run dev -w server >> ^"%LOG_FILE%^" 2>&1"
timeout /t 2 /nobreak >nul
call :port_pid %SEEDBANK_SERVER_PORT%
if not "!FOUND_PID!"=="" echo !FOUND_PID!> "%SERVER_PID_FILE%"

start "Seedbank Client" /b cmd /c "set VITE_SEEDBANK_API_URL=http://localhost:%SEEDBANK_SERVER_PORT%&& npm run dev -w client -- --host 127.0.0.1 --port %SEEDBANK_CLIENT_PORT% --strictPort >> ^"%LOG_FILE%^" 2>&1"
timeout /t 2 /nobreak >nul
call :port_pid %SEEDBANK_CLIENT_PORT%
if not "!FOUND_PID!"=="" echo !FOUND_PID!> "%CLIENT_PID_FILE%"
popd >nul

start "" "%URL%"
echo Seedbank started at %URL%
exit /b 0

:stop
if exist "%CLIENT_PID_FILE%" (
  set /p CLIENT_PID=<"%CLIENT_PID_FILE%"
  taskkill /PID !CLIENT_PID! /T /F >nul 2>nul
  del "%CLIENT_PID_FILE%" >nul 2>nul
)
if exist "%SERVER_PID_FILE%" (
  set /p SERVER_PID=<"%SERVER_PID_FILE%"
  taskkill /PID !SERVER_PID! /T /F >nul 2>nul
  del "%SERVER_PID_FILE%" >nul 2>nul
)
echo Seedbank stopped.
exit /b 0

:restart
call "%~f0" stop
timeout /t 1 /nobreak >nul
call "%~f0" start
exit /b %ERRORLEVEL%

:status
echo Seedbank status:
call :port_pid %SEEDBANK_CLIENT_PORT%
if "!FOUND_PID!"=="" (echo   client %SEEDBANK_CLIENT_PORT%: stopped) else echo   client %SEEDBANK_CLIENT_PORT%: running PID !FOUND_PID!
call :port_pid %SEEDBANK_SERVER_PORT%
if "!FOUND_PID!"=="" (echo   server %SEEDBANK_SERVER_PORT%: stopped) else echo   server %SEEDBANK_SERVER_PORT%: running PID !FOUND_PID!
echo   URL: %URL%
echo   log: %LOG_FILE%
exit /b 0

:logs
if not exist "%LOG_FILE%" (
  echo No log at %LOG_FILE% yet.
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path '%LOG_FILE%' -Tail 100 -Wait"
exit /b 0

:usage
echo Usage: %~nx0 start^|stop^|restart^|status^|logs
exit /b 1
