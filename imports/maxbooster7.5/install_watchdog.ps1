#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-shot installer for the MaxCore Watchdog.
    Run once as Administrator — handles everything permanently.

WHAT THIS DOES
--------------
  1. Creates D:\ai_server\logs directory
  2. Registers watchdog.ps1 as a Task Scheduler task (runs at boot, runs always)
  3. Sets power plan to High Performance permanently
  4. Disables sleep and hibernation on AC power
  5. Defers Windows Update auto-restarts for 30 days
  6. Adds Defender exclusions for training directories
  7. Opens firewall for port 8000 (peer sync)
  8. Creates requirements.txt if missing (for Verify-PythonEnv)
  9. Verifies Python environment on install
 10. Starts the watchdog immediately
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SERVER_DIR  = "D:\ai_server"
$WATCHDOG_PS = "$SERVER_DIR\watchdog.ps1"
$TASK_NAME   = "MaxCore_Watchdog"

function Write-Step {
    param([string]$Msg, [string]$Status = 'OK')
    $color = if ($Status -eq 'OK') { 'Green' } elseif ($Status -eq 'WARN') { 'Yellow' } else { 'Red' }
    Write-Host "  [$Status] $Msg" -ForegroundColor $color
}

Write-Host "`nMaxCore Watchdog Installer" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan

# 1. Create directories
New-Item -ItemType Directory -Path "$SERVER_DIR\logs" -Force | Out-Null
Write-Step "Created $SERVER_DIR\logs"

# Copy watchdog.ps1 if running from a different location
$source = Join-Path $PSScriptRoot "watchdog.ps1"
if ((Test-Path $source) -and ($source -ne $WATCHDOG_PS)) {
    Copy-Item $source $WATCHDOG_PS -Force
    Write-Step "Copied watchdog.ps1 → $WATCHDOG_PS"
}

if (-not (Test-Path $WATCHDOG_PS)) {
    Write-Step "watchdog.ps1 not found at $WATCHDOG_PS — copy it there first" 'ERROR'
    exit 1
}

# 2. Task Scheduler — runs at boot, restarts on failure, no expiry
$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>MaxCore AI Training Server Watchdog</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger><Enabled>true</Enabled></BootTrigger>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
    <Enabled>true</Enabled>
  </Settings>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$WATCHDOG_PS"</Arguments>
      <WorkingDirectory>$SERVER_DIR</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = "$env:TEMP\maxcore_task.xml"
$taskXml | Out-File -FilePath $xmlPath -Encoding Unicode
schtasks /Create /TN $TASK_NAME /XML $xmlPath /F 2>&1 | Out-Null
Remove-Item $xmlPath -Force
Write-Step "Task Scheduler: '$TASK_NAME' registered (boot + logon trigger, unlimited runtime)"

# 3. Power plan — High Performance
$hpGuid = (powercfg /list | Select-String 'High performance' | ForEach-Object {
    ($_ -split '\s+')[3]
} | Select-Object -First 1)
if ($hpGuid) {
    powercfg /setactive $hpGuid 2>$null
    Write-Step "Power plan set to High Performance ($hpGuid)"
} else {
    Write-Step "High Performance plan not found — skipping" 'WARN'
}

# 4. Disable sleep and hibernation
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /hibernate off 2>$null
Write-Step "Sleep and hibernation disabled on AC power"

# 5. Defer Windows Update auto-restarts (failure mode 2)
try {
    $wuPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
    New-Item -Path $wuPath -Force | Out-Null
    Set-ItemProperty -Path $wuPath -Name 'NoAutoRebootWithLoggedOnUsers' -Value 1 -Type DWord
    Set-ItemProperty -Path $wuPath -Name 'AUPowerManagement'              -Value 0 -Type DWord

    $wuPath2 = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
    New-Item -Path $wuPath2 -Force | Out-Null
    Set-ItemProperty -Path $wuPath2 -Name 'DeferFeatureUpdates'          -Value 1 -Type DWord
    Set-ItemProperty -Path $wuPath2 -Name 'DeferFeatureUpdatesPeriodInDays' -Value 30 -Type DWord
    Set-ItemProperty -Path $wuPath2 -Name 'DeferQualityUpdates'          -Value 1 -Type DWord
    Set-ItemProperty -Path $wuPath2 -Name 'DeferQualityUpdatesPeriodInDays' -Value 14 -Type DWord
    Write-Step "Windows Update auto-restart suppressed (30-day feature / 14-day quality defer)"
} catch {
    Write-Step "Windows Update policy: $_" 'WARN'
}

# 6. Windows Defender exclusions — failure mode 10
try {
    $excludePaths = @(
        $SERVER_DIR,
        "D:\ai_training_data",
        "$SERVER_DIR\server\services\diffusion",
        "$env:APPDATA\Python",
        "$env:LOCALAPPDATA\Programs\Python"
    )
    foreach ($p in $excludePaths) {
        Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
    }
    Add-MpPreference -ExclusionExtension '.npz', '.json', '.jsonl', '.pt', '.pth', '.ckpt' -ErrorAction SilentlyContinue
    Write-Step "Windows Defender exclusions added for training paths and weight file types"
} catch {
    Write-Step "Defender exclusions: $_" 'WARN'
}

# 7. Firewall — allow inbound on port 8000
try {
    $existing = Get-NetFirewallRule -DisplayName 'MaxCore Server 8000' -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName 'MaxCore Server 8000' `
            -Direction Inbound -Protocol TCP -LocalPort 8000 `
            -Action Allow -Profile Any | Out-Null
    }
    Write-Step "Firewall: port 8000 open (inbound)"
} catch {
    Write-Step "Firewall rule: $_" 'WARN'
}

# 8. requirements.txt for Python env repair (failure mode 14)
$reqPath = "$SERVER_DIR\requirements.txt"
if (-not (Test-Path $reqPath)) {
    @'
fastapi>=0.100.0
uvicorn>=0.22.0
numpy>=1.24.0
torch>=2.0.0
Pillow>=9.0.0
requests>=2.28.0
psutil>=5.9.0
'@ | Set-Content $reqPath
    Write-Step "Created requirements.txt"
} else {
    Write-Step "requirements.txt already exists"
}

# 9. Verify Python environment
Write-Host "`n  Verifying Python environment..." -NoNewline
$check = & python -c "import fastapi, uvicorn, numpy; print('ok')" 2>&1
if ($check -match 'ok') {
    Write-Step "Python environment OK"
} else {
    Write-Host " repairing..." -NoNewline
    & python -m pip install -r $reqPath --quiet 2>&1 | Out-Null
    $check2 = & python -c "import fastapi, uvicorn, numpy; print('ok')" 2>&1
    if ($check2 -match 'ok') {
        Write-Step "Python environment repaired"
    } else {
        Write-Step "Python environment could not be verified — check manually" 'WARN'
    }
}

# 10. Start watchdog now
Write-Host "`n  Starting watchdog..." -NoNewline
try {
    schtasks /Run /TN $TASK_NAME 2>&1 | Out-Null
    Write-Step "Watchdog started via Task Scheduler"
} catch {
    Start-Process powershell.exe `
        -ArgumentList "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$WATCHDOG_PS`"" `
        -WorkingDirectory $SERVER_DIR
    Write-Step "Watchdog started directly (Task Scheduler fallback)"
}

Write-Host "`n==========================" -ForegroundColor Cyan
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "The watchdog will now start automatically on every reboot." -ForegroundColor Green
Write-Host "Logs: $SERVER_DIR\logs\" -ForegroundColor Gray
Write-Host "To check status: schtasks /Query /TN $TASK_NAME /V" -ForegroundColor Gray
Write-Host ""
