// PM2 alternative to Docker (spec §48: "PM2 yoki Docker") for a bare-metal
// or single-VM deploy where Docker isn't wanted. Assumes: Node 20+, ffmpeg
// on PATH, and Nginx already reverse-proxying to 127.0.0.1:4000 (see
// nginx/reverse-proxy.conf — point its `proxy_pass` targets at
// 127.0.0.1:4000 instead of the `backend`/`front`/`admin` service names
// when not using Docker; front/admin become `nginx root` directives
// pointing at their `dist/` folders instead of separate containers).
//
// Usage (from the repo root, after `npm ci && npm run build`):
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup   # persist across reboots

module.exports = {
  apps: [
    {
      name: 'lms-backend',
      cwd: './backend',
      script: 'src/server.js',
      // JWT auth is stateless and BullMQ jobs are idempotent-safe to pick
      // up by any worker, so cluster mode is safe here — scale to the
      // box's core count instead of guessing a fixed instance count.
      instances: 'max',
      exec_mode: 'cluster',
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
    {
      name: 'lms-worker',
      cwd: './backend',
      script: 'src/worker.js',
      // Video processing concurrency is already controlled inside
      // worker.js (Worker({ concurrency: 2 })) — running more than one
      // OS process here would just double-count that concurrency, not
      // add real throughput, and BullMQ's repeatable jobs (reminders,
      // dashboard aggregation) assume a single scheduler.
      instances: 1,
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
    },
  ],
}
