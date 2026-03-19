export const apps = [
  {
    name: 'babadeluxe-webview-auto-deploy',
    script: './scripts/deploy.sh',
    interpreter: '/bin/bash',
    cwd: '.',
    log_date_format: 'DD-MM-YYYY HH:mm:ss',
    env: {
      NODE_ENV: 'production',
    },
    env_staging: {
      NODE_ENV: 'staging'
    },
  },
]
