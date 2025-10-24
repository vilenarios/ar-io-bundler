/**
 * PM2 Ecosystem Configuration for Turbo Upload Service
 *
 * This configuration manages two processes:
 * 1. API Server - HTTP server accepting uploads
 * 2. Workers - BullMQ workers processing background jobs
 */

module.exports = {
  apps: [
    {
      name: "upload-api",
      script: "./lib/server.js",
      instances: process.env.API_INSTANCES || 1,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3001, // Changed from 3000 to avoid conflict with AR.IO Gateway
      },
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
    {
      name: "upload-workers",
      script: "./lib/workers/allWorkers.js",
      instances: process.env.WORKER_INSTANCES || 1,
      exec_mode: "fork", // Workers should not be clustered
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      kill_timeout: 30000, // Give workers time to finish current jobs
    },
    {
      name: "bull-board",
      script: "./bull-board-server.ts",
      interpreter: "ts-node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        BULL_BOARD_PORT: 3002,
      },
      error_file: "./logs/bull-board-error.log",
      out_file: "./logs/bull-board-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
    },
  ],
};
