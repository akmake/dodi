module.exports = {
  apps: [
    {
      name: "dodi",
      script: "bash",
      args: "-c 'node --env-file=/home/appuser/projects/dodi/.env node_modules/.bin/next start -p 3003'",
      cwd: "/home/appuser/projects/dodi",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3003",
      },
    },
  ],
};
