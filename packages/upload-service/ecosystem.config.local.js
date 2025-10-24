/**
 * PM2 Ecosystem Configuration for Local Development
 *
 * Local development version with:
 * - Single instance (no clustering)
 * - Watch mode for auto-reload
 * - Debug logging
 */

module.exports = {
  apps: [
    {
      name: "upload-api-local",
      script: "./lib/server.js",
      instances: 1,
      exec_mode: "fork",
      watch: ["lib"],
      ignore_watch: ["node_modules", "logs", "*.log"],
      env: {
        NODE_ENV: "development",
        PORT: 3001, // Changed from 3000 to avoid conflict with AR.IO Gateway
        LOG_LEVEL: "debug",
      },
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
    },
    {
      name: "upload-workers-local",
      script: "./lib/workers/allWorkers.js",
      instances: 1,
      exec_mode: "fork",
      watch: ["lib"],
      ignore_watch: ["node_modules", "logs", "*.log"],
      env: {
        NODE_ENV: "development",
        LOG_LEVEL: "debug",
      },
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
    },
    {
      name: "bull-board-local",
      script: "./bull-board-server.ts",
      interpreter: "ts-node",
      instances: 1,
      exec_mode: "fork",
      watch: ["bull-board-server.ts", "src/arch/queues"],
      ignore_watch: ["node_modules", "logs", "*.log"],
      env: {
        NODE_ENV: "development",
        BULL_BOARD_PORT: 3002,
        LOG_LEVEL: "debug",
      },
      error_file: "./logs/bull-board-error.log",
      out_file: "./logs/bull-board-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
    },
  ],
};
