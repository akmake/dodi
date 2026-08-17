module.exports = {
  apps: [
    {
      name: "bootwhat",
      script: "bash",
      args: "-c 'node --env-file=/var/www/bootWhat/.env node_modules/.bin/next start -p 3002'",
      cwd: "/var/www/bootWhat",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
    },
  ],
};
