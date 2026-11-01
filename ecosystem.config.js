// PM2 process file for the Windows AI-server box (D:/ai_server).
// Shared hardening applied to every process:
//   • max_memory_restart — kill+restart on runaway memory before the box swaps
//   • restart_delay + exp backoff — prevents restart storms when a dependency
//     (GPU driver, tunnel) is down; PM2 backs off instead of thrashing
//   • min_uptime/max_restarts — a process crashing instantly 10× in a row is
//     marked errored rather than looping forever
//   • env / env_production — run `pm2 start ecosystem.config.js --env production`
const hardened = {
  autorestart: true,
  watch: false,
  restart_delay: 5000,
  exp_backoff_restart_delay: 1000,
  min_uptime: 10000,
  max_restarts: 10,
  env: { NODE_ENV: "development", PYTHONUNBUFFERED: "1" },
  env_production: { NODE_ENV: "production", PYTHONUNBUFFERED: "1" },
};

module.exports = {
  apps: [
    {
      ...hardened,
      name: "cloudflared",
      script: "D:/ai_server/cloudflared/cloudflared.exe",
      args: "tunnel run ai_server",
      max_memory_restart: "256M",
      // Tunnel is the app's lifeline — restart fast, never give up.
      max_restarts: 50,
    },
    {
      ...hardened,
      name: "control_daemon",
      script: "python",
      args: "D:/ai_server/daemon/control_daemon.py",
      max_memory_restart: "512M",
    },
    {
      ...hardened,
      name: "gpu_monitor",
      script: "python",
      args: "D:/ai_server/workers/gpu_monitor.py",
      max_memory_restart: "256M",
    },
    {
      ...hardened,
      name: "dataset_worker",
      script: "python",
      args: "D:/ai_server/workers/dataset_worker.py",
      max_memory_restart: "1G",
    },
    {
      ...hardened,
      name: "training_scheduler",
      script: "python",
      args: "D:/ai_server/workers/training_scheduler.py",
      max_memory_restart: "512M",
    },
  ],
};

// Recommended one-time setup on the AI-server box (log rotation):
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 20M
//   pm2 set pm2-logrotate:retain 14
//   pm2 set pm2-logrotate:compress true
