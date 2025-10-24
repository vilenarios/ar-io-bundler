/**
 * PM2 Ecosystem Configuration for AR.IO Bundler
 *
 * Manages all services:
 * - Payment Service (cluster mode)
 * - Upload API (cluster mode)
 * - Upload Workers (fork mode)
 * - Bull Board (fork mode)
 */

module.exports = {
  apps: [
    // Payment Service
    {
      name: "payment-service",
      script: "./lib/server.js",
      cwd: "./packages/payment-service",
      instances: process.env.API_INSTANCES || 2,
      exec_mode: "cluster",
      env_file: "/home/vilenarios/ar-io-bundler/.env",
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PORT: process.env.PAYMENT_SERVICE_PORT || 4001,
        REDIS_QUEUE_HOST: "localhost",
        REDIS_QUEUE_PORT: "6381",
        DB_HOST: "localhost",
        DB_PORT: "5432",
      },
      error_file: "/home/vilenarios/ar-io-bundler/logs/payment-service-error.log",
      out_file: "/home/vilenarios/ar-io-bundler/logs/payment-service-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },

    // Upload Service - API
    {
      name: "upload-api",
      script: "./lib/server.js",
      cwd: "./packages/upload-service",
      instances: process.env.API_INSTANCES || 2,
      exec_mode: "cluster",
      env_file: "/home/vilenarios/ar-io-bundler/.env",
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PORT: process.env.UPLOAD_SERVICE_PORT || 3001,
        ELASTICACHE_HOST: "localhost",
        ELASTICACHE_PORT: "6379",
        ELASTICACHE_NO_CLUSTERING: "true",
        REDIS_HOST: "localhost",
        REDIS_PORT_QUEUES: "6381",
        DB_HOST: "localhost",
        DB_PORT: "5432",
      },
      error_file: "/home/vilenarios/ar-io-bundler/logs/upload-api-error.log",
      out_file: "/home/vilenarios/ar-io-bundler/logs/upload-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 5000,
    },

    // Upload Service - Workers
    {
      name: "upload-workers",
      script: "./lib/workers/allWorkers.js",
      cwd: "./packages/upload-service",
      instances: process.env.WORKER_INSTANCES || 1,
      exec_mode: "fork", // Workers should not be clustered
      env_file: "/home/vilenarios/ar-io-bundler/.env",
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        ELASTICACHE_HOST: "localhost",
        ELASTICACHE_PORT: "6379",
        ELASTICACHE_NO_CLUSTERING: "true",
        REDIS_HOST: "localhost",
        REDIS_PORT_QUEUES: "6381",
        DB_HOST: "localhost",
        DB_PORT: "5432",
      },
      error_file: "/home/vilenarios/ar-io-bundler/logs/upload-workers-error.log",
      out_file: "/home/vilenarios/ar-io-bundler/logs/upload-workers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      kill_timeout: 30000, // Give workers time to finish current jobs
    },

    // Bull Board - Queue Monitoring Dashboard
    {
      name: "bull-board",
      script: "./packages/upload-service/bull-board-server.ts",
      cwd: process.cwd(),
      interpreter: "ts-node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        BULL_BOARD_PORT: 3002,
      },
      error_file: "/home/vilenarios/ar-io-bundler/logs/bull-board-error.log",
      out_file: "/home/vilenarios/ar-io-bundler/logs/bull-board-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
    },
  ],
};
