module.exports = {
  apps: [
    {
      name: "cloudflared",
      script: "D:/ai_server/cloudflared/cloudflared.exe",
      args: "tunnel run ai_server",
      autorestart: true,
      watch: false,
    },
    {
      name: "control_daemon",
      script: "python",
      args: "D:/ai_server/daemon/control_daemon.py",
      autorestart: true,
      watch: false,
    },
    {
      name: "gpu_monitor",
      script: "python",
      args: "D:/ai_server/workers/gpu_monitor.py",
      autorestart: true,
      watch: false,
    },
    {
      name: "dataset_worker",
      script: "python",
      args: "D:/ai_server/workers/dataset_worker.py",
      autorestart: true,
      watch: false,
    },
    {
      name: "training_scheduler",
      script: "python",
      args: "D:/ai_server/workers/training_scheduler.py",
      autorestart: true,
      watch: false,
    },
  ],
};
