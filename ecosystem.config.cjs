const appDir = __dirname;

module.exports = {
  apps: [
    {
      name: jobconnect-frontend,
      cwd: appDir,
      script: .output/server/index.mjs,
      interpreter: node,
      exec_mode: fork,
      instances: 1,
      env: {
        NODE_ENV: process.env.NODE_ENV || production,
        PORT: process.env.PORT || 3000,
        PB_URL: process.env.PB_URL || http://127.0.0.1:8090,
        VITE_PB_URL: process.env.VITE_PB_URL || http://127.0.0.1:8090,
      },
    },
  ],
};
