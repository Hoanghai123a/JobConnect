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
        VAPID_PUBLIC_KEY: "BEiIUjiehZiA8d2XuMZ47dhYL92idx2K-CkYUHG-647Jgg4wJR3_fcHh4O7zi8phO31GLp96ZDM7Z8BP8CEl9qE",
        VAPID_PRIVATE_KEY: "-URBdxX96WlXTMBi3fvOWX8GaAk9dcXVMUxhHHQW87M",
        VAPID_SUBJECT: "mailto:admin@chamcongchua.com",
        PB_ADMIN_EMAIL: "admin@ccc.com",
        PB_ADMIN_PASSWORD: "Admin12!",
      },
    },
  ],
};
