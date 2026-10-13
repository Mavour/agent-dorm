// Konfigurasi PM2 untuk deploy.
// Jalankan: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'agent-dorm',
      script: 'server/index.js',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
