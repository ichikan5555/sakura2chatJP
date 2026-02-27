module.exports = {
  apps: [
    {
      name: 'sakura2chat',
      script: 'src/index.js',
      cwd: 'C:\\Users\\jp_bu\\sakura2chatJP',
      exec_mode: 'fork',
      node_args: '--experimental-sqlite',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'excel-auto-import',
      script: 'scripts/excel-auto-import.js',
      cwd: 'C:\\Users\\jp_bu\\sakura2chatJP',
      exec_mode: 'fork',
      node_args: '--experimental-sqlite',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/excel-import-error.log',
      out_file: './logs/excel-import-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
