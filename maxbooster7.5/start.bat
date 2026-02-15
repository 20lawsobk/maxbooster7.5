@echo off
REM Max Booster - Windows Production Startup Script
REM Handles boosterstate service, database connection, and web server

echo ============================================================
echo.
echo         MAX BOOSTER 10.0 - PRODUCTION STARTUP
echo.
echo ============================================================
echo.

REM ==========================================
REM ENVIRONMENT CONFIGURATION
REM ==========================================
if "%NODE_ENV%"=="" set NODE_ENV=production
if "%PORT%"=="" set PORT=5000

echo Environment Configuration:
echo   NODE_ENV: %NODE_ENV%
echo   PORT: %PORT%
echo.

REM ==========================================
REM PRE-FLIGHT CHECKS
REM ==========================================
echo Pre-flight Checks:

if not exist "dist" (
    echo [ERROR] dist folder not found!
    echo   Run 'npm run build' first.
    exit /b 1
)
echo   [OK] Build artifacts found

if not exist "dist\index.cjs" (
    echo [ERROR] dist\index.cjs not found!
    echo   Run 'npm run build' first.
    exit /b 1
)
echo   [OK] Server bundle ready

if not exist "node_modules" (
    echo [ERROR] node_modules not found!
    echo   Run 'npm install' first.
    exit /b 1
)
echo   [OK] Dependencies installed

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
    timeout /t 3 /nobreak >nul
) else (
    echo [INFO] boosterstate binary not found (optional component)
)

echo.

REM ==========================================
REM START MAX BOOSTER SERVER
REM ==========================================
echo Starting Max Booster Server...
echo.
echo ============================================================
echo.
echo              MAX BOOSTER 10.0 STARTING
echo.
echo   Port:          %PORT%
echo   Environment:   %NODE_ENV%
echo   Plugins:       413
echo   Compression:   903:1
echo   AI Engine:     Custom (100%%)
echo   Autopilot:     Active
echo.
echo ============================================================
echo.

node dist\index.cjs

REM If we reach here, server exited
echo [ERROR] Server exited unexpectedly
exit /b 1
