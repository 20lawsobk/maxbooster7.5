module.exports = {
  apps: [
    {
      name: "control_daemon",
      script: "daemon/control_daemon.py",
      interpreter: "python",
      cwd: "D:/ai_server",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      out_file: "logs/daemon_stdout.log",
      error_file: "logs/daemon_stderr.log"
    },
    {
      name: "cloudflared",
      script: "cloudflared.exe",
      args: "tunnel run ai_server",
      cwd: "D:/ai_server/cloudflared",
      autorestart: true,
      watch: false,
      out_file: "logs/cloudflared_stdout.log",
      error_file: "logs/cloudflared_stderr.log"
    },
    {
      name: "gpu_monitor",
      script: "workers/gpu_monitor.py",
      interpreter: "python",
      cwd: "D:/ai_server",
      autorestart: true,
      watch: false,
      out_file: "logs/gpu_stdout.log",
      error_file: "logs/gpu_stderr.log"
    },
    {
      name: "dataset_worker",
      script: "workers/dataset_worker.py",
      interpreter: "python",
      cwd: "D:/ai_server",
      autorestart: true,
      watch: false,
      out_file: "logs/dataset_stdout.log",
      error_file: "logs/dataset_stderr.log"
    },
    {
      name: "training_scheduler",
      script: "workers/training_scheduler.py",
      interpreter: "python",
      cwd: "D:/ai_server",
      autorestart: true,
      watch: false,
      out_file: "logs/training_stdout.log",
      error_file: "logs/training_stderr.log"
    }
  ]
}
