@echo off
REM Max Booster - Windows Development Startup Script
REM Hot reload with tsx for rapid development

echo ============================================================
echo.
echo         MAX BOOSTER 10.0 - DEVELOPMENT MODE
echo.
echo ============================================================
echo.

REM ==========================================
REM ENVIRONMENT CONFIGURATION
REM ==========================================
if "%NODE_ENV%"=="" set NODE_ENV=development
if "%PORT%"=="" set PORT=5000

echo Environment Configuration:
echo   NODE_ENV: %NODE_ENV%
echo   PORT: %PORT%
echo   Hot Reload: Enabled
echo.

REM ==========================================
REM PRE-FLIGHT CHECKS
REM ==========================================
echo Pre-flight Checks:

if not exist "node_modules" (
    echo [ERROR] node_modules not found!
    echo   Run 'npm install' first.
    exit /b 1
)
echo   [OK] Dependencies installed

if not exist "server\index.ts" (
    echo [ERROR] server\index.ts not found!
    exit /b 1
)
echo   [OK] Server source found

if "%DATABASE_URL%"=="" (
    echo [WARNING] DATABASE_URL not set!
    echo   Database features will not work.
) else (
    echo   [OK] Database configured
)

echo.

REM ==========================================
REM BOOSTERSTATE SERVICE (OPTIONAL)
REM ==========================================
set BOOSTERSTATE_STARTED=0

if exist "boosterstate\target\release\boosterstate.exe" (
    echo Starting boosterstate service...
    start /B boosterstate\target\release\boosterstate.exe
    set BOOSTERSTATE_STARTED=1
    echo   [OK] boosterstate started
    echo   Waiting for initialization...
    timeout /t 1 /nobreak >nul
) else (
    echo [INFO] boosterstate binary not found (optional component)
)

echo.

REM ==========================================
REM START MAX BOOSTER DEV SERVER
REM ==========================================
echo Starting Max Booster Development Server...
echo.
echo ============================================================
echo.
echo          MAX BOOSTER 10.0 - DEVELOPMENT MODE
echo.
echo   Port:          %PORT%
echo   Hot Reload:    Enabled
echo   TypeScript:    tsx
echo   Plugins:       413
echo   Compression:   903:1
echo.
echo   Press Ctrl+C to stop
echo.
echo ============================================================
echo.

tsx server\index.ts

REM If we reach here, server exited
echo [ERROR] Server exited unexpectedly
exit /b 1
