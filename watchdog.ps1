#Requires -Version 5.1
<#
.SYNOPSIS
    MaxCore Server Watchdog — guards against all 14 known failure modes.

FAILURE MODES COVERED
---------------------
 1  Python crash              → auto-restart with backoff
 2  Windows auto-update reboot → auto-start via Task Scheduler (see install_watchdog.ps1)
 3  Sleep / hibernation        → sets High Performance power plan on every loop
 4  Port 8000 conflict         → kills conflicting PID before starting
 5  Corrupt weights file       → kept by trainer (atomic write + 3 checkpoints)
 6  Corrupt progress JSON      → atomic write in trainer; watchdog restores backup if bad
 7  Memory exhaustion (OOM)    → restarts server when RSS > MEM_LIMIT_GB
 8  Disk full                  → rotates logs, warns at DISK_WARN_GB free
 9  Training hang              → /health timeout → force-restart
10  Antivirus interference     → Defender exclusions added by install_watchdog.ps1
11  Multiple instances         → PID file enforces single instance
12  Log overflow               → cap MAXLOG_MB per file, keep LOG_KEEP files
13  Phase stuck                → /curriculum/status checked; alerts if phase frozen >2 days
14  Python env broken          → verify imports before launch; auto-reinstall on failure
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# ── Config ──────────────────────────────────────────────────────────────────
$SERVER_DIR     = "D:\ai_server"
$SCRIPT         = "$SERVER_DIR\maxcore_server.py"
$PYTHON         = "python"
$PORT           = 8000
$LOG_DIR        = "$SERVER_DIR\logs"
$PID_FILE       = "$SERVER_DIR\watchdog.pid"
$SRV_PID_FILE   = "$SERVER_DIR\server.pid"
$PROGRESS_JSON  = "$SERVER_DIR\server\services\diffusion\curriculum_progress.json"
$PROGRESS_BAK   = "$SERVER_DIR\curriculum_progress.backup.json"

$HEALTH_URL     = "http://localhost:$PORT/health"
$CURRICULUM_URL = "http://localhost:$PORT/curriculum/status"

$HEALTH_TIMEOUT_SEC  = 30
$HANG_TIMEOUT_MIN    = 10
$RESTART_BACKOFF_MAX = 300
$MEM_LIMIT_GB        = 10.0
$DISK_WARN_GB        = 80
$DISK_CRIT_GB        = 20
$MAXLOG_MB           = 50
$LOG_KEEP            = 5
$LOOP_INTERVAL_SEC   = 60
$PHASE_FREEZE_DAYS   = 2
# ── End Config ───────────────────────────────────────────────────────────────

function Write-Log {
    param([string]$Msg, [string]$Level = 'INFO')
    $ts   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$ts] [$Level] $Msg"
    Write-Host $line
    $logFile = "$LOG_DIR\watchdog_$(Get-Date -Format 'yyyy-MM-dd').log"
    Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
}

function Rotate-Logs {
    if (-not (Test-Path $LOG_DIR)) { return }
    Get-ChildItem $LOG_DIR -Filter '*.log' | ForEach-Object {
        $sizeMB = $_.Length / 1MB
        if ($sizeMB -gt $MAXLOG_MB) {
            $archive = $_.FullName -replace '\.log$', "_$(Get-Date -Format 'HHmmss').log.bak"
            Rename-Item $_.FullName $archive -ErrorAction SilentlyContinue
            Write-Log "Rotated log $($_.Name) (${sizeMB:F1} MB)" 'INFO'
        }
    }
    $baks = Get-ChildItem $LOG_DIR -Filter '*.log.bak' | Sort-Object LastWriteTime
    while ($baks.Count -gt $LOG_KEEP) {
        Remove-Item $baks[0].FullName -Force -ErrorAction SilentlyContinue
        Write-Log "Deleted old log backup: $($baks[0].Name)" 'INFO'
        $baks = $baks | Select-Object -Skip 1
    }
}

function Set-HighPerformance {
    try {
        $hp = powercfg /list | Select-String 'High performance' | ForEach-Object {
            ($_ -split '\s+')[3]
        } | Select-Object -First 1
        if ($hp) {
            powercfg /setactive $hp 2>$null
            powercfg /change standby-timeout-ac 0 2>$null
            powercfg /change hibernate-timeout-ac 0 2>$null
            powercfg /change monitor-timeout-ac 0 2>$null
        }
    } catch {}
}

function Test-Health {
    try {
        $resp = Invoke-WebRequest -Uri $HEALTH_URL -TimeoutSec $HEALTH_TIMEOUT_SEC -UseBasicParsing -ErrorAction Stop
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Get-CurriculumStatus {
    try {
        $resp = Invoke-WebRequest -Uri $CURRICULUM_URL -TimeoutSec $HEALTH_TIMEOUT_SEC -UseBasicParsing -ErrorAction Stop
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Kill-PortConflict {
    $conflict = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($conflict) {
        foreach ($c in $conflict) {
            $pid_ = $c.OwningProcess
            Write-Log "Port $PORT held by PID $pid_ — killing" 'WARN'
            Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
}

function Kill-ExtraInstances {
    $current = Get-Content $SRV_PID_FILE -ErrorAction SilentlyContinue
    Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        $_.Id -ne [int]$current -and
        ($_.MainModule.FileName -like '*python*' -or $true)
    } | ForEach-Object {
        $cmdline = (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmdline -like "*maxcore_server*") {
            Write-Log "Killing stale server instance PID $($_.Id)" 'WARN'
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

function Verify-PythonEnv {
    $check = & $PYTHON -c "import fastapi, uvicorn, numpy, torch; print('ok')" 2>&1
    if ($check -notmatch 'ok') {
        Write-Log "Python environment broken — reinstalling requirements" 'WARN'
        & $PYTHON -m pip install -r "$SERVER_DIR\requirements.txt" --quiet 2>&1 | Out-Null
        $check2 = & $PYTHON -c "import fastapi, uvicorn, numpy; print('ok')" 2>&1
        if ($check2 -notmatch 'ok') {
            Write-Log "Python env repair failed: $check2" 'ERROR'
            return $false
        }
        Write-Log "Python environment repaired" 'INFO'
    }
    return $true
}

function Backup-CurriculumProgress {
    if (Test-Path $PROGRESS_JSON) {
        try {
            $content = Get-Content $PROGRESS_JSON -Raw
            $null = $content | ConvertFrom-Json
            Copy-Item $PROGRESS_JSON $PROGRESS_BAK -Force
        } catch {
            Write-Log "curriculum_progress.json is corrupt — restoring backup" 'ERROR'
            if (Test-Path $PROGRESS_BAK) {
                Copy-Item $PROGRESS_BAK $PROGRESS_JSON -Force
                Write-Log "Backup restored" 'INFO'
            }
        }
    }
}

function Check-DiskSpace {
    $drive = Split-Path -Qualifier $SERVER_DIR
    $disk  = Get-PSDrive ($drive.TrimEnd(':')) -ErrorAction SilentlyContinue
    if ($disk) {
        $freeGB = [math]::Round($disk.Free / 1GB, 1)
        if ($freeGB -lt $DISK_CRIT_GB) {
            Write-Log "CRITICAL: Only ${freeGB} GB free on ${drive} — training may fail!" 'ERROR'
        } elseif ($freeGB -lt $DISK_WARN_GB) {
            Write-Log "WARNING: ${freeGB} GB free on ${drive}" 'WARN'
        }
    }
}

function Check-Memory {
    param([int]$Pid_)
    try {
        $proc = Get-Process -Id $Pid_ -ErrorAction Stop
        $rssGB = $proc.WorkingSet64 / 1GB
        if ($rssGB -gt $MEM_LIMIT_GB) {
            Write-Log "Server RSS ${rssGB:F1} GB > limit ${MEM_LIMIT_GB} GB — restarting to free memory" 'WARN'
            return $false
        }
        return $true
    } catch {
        return $false
    }
}

function Check-PhaseFreeze {
    $status = Get-CurriculumStatus
    if (-not $status) { return }
    try {
        $phase    = $status.current_phase
        $dayInPhase = $status.days_in_phase
        if ($dayInPhase -gt ($PHASE_FREEZE_DAYS * 1)) {
            Write-Log "Phase $phase has not advanced in $dayInPhase days — possible phase freeze" 'WARN'
        }
    } catch {}
}

function Start-Server {
    param([string]$LogFile)
    Kill-PortConflict
    Kill-ExtraInstances
    if (-not (Verify-PythonEnv)) {
        Write-Log "Cannot start — Python env broken and repair failed" 'ERROR'
        return $null
    }
    Write-Log "Starting maxcore_server.py → log: $LogFile"
    $proc = Start-Process -FilePath $PYTHON `
        -ArgumentList $SCRIPT `
        -WorkingDirectory $SERVER_DIR `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError  ($LogFile -replace '\.log$', '_err.log') `
        -WindowStyle Hidden `
        -PassThru
    $proc.Id | Set-Content $SRV_PID_FILE
    Write-Log "Server started — PID $($proc.Id)"
    return $proc
}

# ── Self single-instance guard ───────────────────────────────────────────────
if (Test-Path $PID_FILE) {
    $oldPid = [int](Get-Content $PID_FILE -ErrorAction SilentlyContinue)
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
        Write-Host "Watchdog already running (PID $oldPid). Exiting."
        exit 0
    }
}
$PID | Set-Content $PID_FILE
New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null

Write-Log "MaxCore Watchdog started (PID $PID) — monitoring 14 failure modes"

# ── Main loop ────────────────────────────────────────────────────────────────
$proc            = $null
$backoff         = 5
$hangCounter     = 0
$lastPhaseCheck  = Get-Date

while ($true) {
    try {
        Set-HighPerformance
        Rotate-Logs
        Check-DiskSpace
        Backup-CurriculumProgress

        $needRestart = $false
        $logFile = "$LOG_DIR\server_$(Get-Date -Format 'yyyy-MM-dd').log"

        if ($null -eq $proc -or $proc.HasExited) {
            if ($proc -ne $null) {
                Write-Log "Server process (PID $($proc.Id)) exited — code $($proc.ExitCode)" 'WARN'
            }
            $needRestart = $true
        } else {
            # Health check — failure mode 9: hang
            $healthy = Test-Health
            if ($healthy) {
                $hangCounter = 0
            } else {
                $hangCounter++
                Write-Log "Health check failed ($hangCounter / $HANG_TIMEOUT_MIN)" 'WARN'
                if ($hangCounter -ge $HANG_TIMEOUT_MIN) {
                    Write-Log "Server unresponsive for $HANG_TIMEOUT_MIN min — force restarting" 'ERROR'
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    $hangCounter = 0
                    $needRestart = $true
                }
            }

            # Memory check — failure mode 7: OOM prevention
            if (-not $needRestart -and -not (Check-Memory -Pid_ $proc.Id)) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $needRestart = $true
            }
        }

        # Phase freeze check — failure mode 13
        if (((Get-Date) - $lastPhaseCheck).TotalHours -ge 6) {
            Check-PhaseFreeze
            $lastPhaseCheck = Get-Date
        }

        if ($needRestart) {
            Write-Log "Waiting ${backoff}s before restart..."
            Start-Sleep -Seconds $backoff
            $proc    = Start-Server -LogFile $logFile
            $backoff = [math]::Min($backoff * 2, $RESTART_BACKOFF_MAX)

            # Give server time to start
            Start-Sleep -Seconds 10
            if (Test-Health) {
                Write-Log "Server healthy after restart"
                $backoff = 5
            } else {
                Write-Log "Server not yet healthy — will recheck next loop" 'WARN'
            }
        }

    } catch {
        Write-Log "Watchdog loop error: $_" 'ERROR'
    }

    Start-Sleep -Seconds $LOOP_INTERVAL_SEC
}
