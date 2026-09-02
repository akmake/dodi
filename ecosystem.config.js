module.exports = {
  apps: [
    {
      name: "dodi",
      script: "bash",
      args: "-c 'node --env-file=/home/appuser/projects/dodi/.env node_modules/.bin/next start -p 3003'",
      cwd: "/home/appuser/projects/dodi",
      interpreter: "none",
      // The app sits around 650-700MB with Baileys sockets live; a lower ceiling
      // makes pm2 kill it in a loop (502s + dropped logins).
      max_memory_restart: "1400M",
      env: {
        NODE_ENV: "production",
        PORT: "3003",
      },
    },
  ],
};
