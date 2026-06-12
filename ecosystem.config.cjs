module.exports = {
  apps: [
    {
      name: "jobconnect-frontend",
      cwd: "/var/www/chamcong-main",
      script: ".output/server/index.mjs",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        PB_URL: "http://127.0.0.1:8090",
        VITE_PB_URL: "http://127.0.0.1:8090",
      },
    },
  ],
};
