module.exports = {
  apps: [
    {
      name: 'babadeluxe-webview-prod',
      cwd: '.',
      script: 'serve',
      exec_mode: 'fork',
      instances: 1,
      log_date_format: 'DD-MM-YYYY HH:mm:ss',
      env_production: {
        NODE_ENV: 'production',
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: 3200,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: './dist/index.html',
      },
    },
    {
      name: 'babadeluxe-webview-staging',
      cwd: '.',
      script: 'serve',
      exec_mode: 'fork',
      instances: 1,
      log_date_format: 'DD-MM-YYYY HH:mm:ss',
      env_staging: {
        NODE_ENV: 'staging',
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: 3201,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: './dist/index.html',
      },
    },
  ],
}
