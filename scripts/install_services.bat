@echo off
setlocal

set BASE=D:\ai_server
set PYTHON=python
set NSSM=D:\ai_server\nssm\nssm.exe

echo Installing ai_control_daemon...
%NSSM% install ai_control_daemon %PYTHON% "%BASE%\daemon\control_daemon.py"
%NSSM% set ai_control_daemon AppDirectory %BASE%
%NSSM% set ai_control_daemon AppStdout "%BASE%\logs\daemon_stdout.log"
%NSSM% set ai_control_daemon AppStderr "%BASE%\logs\daemon_stderr.log"
%NSSM% set ai_control_daemon Start SERVICE_AUTO_START

echo Installing ai_gpu_monitor...
%NSSM% install ai_gpu_monitor %PYTHON% "%BASE%\workers\gpu_monitor.py"
%NSSM% set ai_gpu_monitor AppDirectory %BASE%
%NSSM% set ai_gpu_monitor AppStdout "%BASE%\logs\gpu_stdout.log"
%NSSM% set ai_gpu_monitor AppStderr "%BASE%\logs\gpu_stderr.log"
%NSSM% set ai_gpu_monitor Start SERVICE_AUTO_START

echo Installing ai_dataset_worker...
%NSSM% install ai_dataset_worker %PYTHON% "%BASE%\workers\dataset_worker.py"
%NSSM% set ai_dataset_worker AppDirectory %BASE%
%NSSM% set ai_dataset_worker AppStdout "%BASE%\logs\dataset_stdout.log"
%NSSM% set ai_dataset_worker AppStderr "%BASE%\logs\dataset_stderr.log"
%NSSM% set ai_dataset_worker Start SERVICE_AUTO_START

echo Installing ai_training_scheduler...
%NSSM% install ai_training_scheduler %PYTHON% "%BASE%\workers\training_scheduler.py"
%NSSM% set ai_training_scheduler AppDirectory %BASE%
%NSSM% set ai_training_scheduler AppStdout "%BASE%\logs\training_stdout.log"
%NSSM% set ai_training_scheduler AppStderr "%BASE%\logs\training_stderr.log"
%NSSM% set ai_training_scheduler Start SERVICE_AUTO_START

echo Installing ai_cloudflared...
%NSSM% install ai_cloudflared "%BASE%\cloudflared\cloudflared.exe" tunnel run ai_server
%NSSM% set ai_cloudflared AppDirectory "%BASE%\cloudflared"
%NSSM% set ai_cloudflared AppStdout "%BASE%\logs\cloudflared_stdout.log"
%NSSM% set ai_cloudflared AppStderr "%BASE%\logs\cloudflared_stderr.log"
%NSSM% set ai_cloudflared Start SERVICE_AUTO_START

echo.
echo Starting all services...
net start ai_control_daemon
net start ai_gpu_monitor
net start ai_dataset_worker
net start ai_training_scheduler
net start ai_cloudflared

echo.
echo Done. All services installed and started.
pause
