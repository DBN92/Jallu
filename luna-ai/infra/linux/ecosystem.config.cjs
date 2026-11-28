// Alternativa ao systemd: PM2 (https://pm2.keymetrics.io)
// Uso: pm2 start infra/linux/ecosystem.config.cjs && pm2 save && pm2 startup
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');

module.exports = {
  apps: [
    {
      name: 'luna-ai',
      cwd: root,
      script: path.join(root, 'apps/api/dist/server.js'),
      interpreter: process.env.LUNA_NODE || 'node',
      env: { NODE_ENV: 'production', LUNA_ENV_FILE: path.join(root, '.env'), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '600M',
      time: true,
    },
  ],
};
