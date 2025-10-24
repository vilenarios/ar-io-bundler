// PM2 Ecosystem Configuration
// This file configures PM2 to run the payment service with separate processes for API and workers
//
// IMPORTANT: Update the paths and credentials below for your environment
// Consider using pm2 with --env flag and environment-specific config files for production

module.exports = {
  apps: [
    // HTTP API Server
    {
      name: 'payment-service-api',
      script: './lib/index.js',
      cwd: process.cwd(),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: '4001',
        DB_HOST: 'localhost',
        DB_PORT: '5433',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_DATABASE: 'payment-postgres',
        MIGRATE_ON_STARTUP: 'false',
        // Load from .env file or set these environment variables before starting PM2
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        PRIVATE_ROUTE_SECRET: process.env.PRIVATE_ROUTE_SECRET,
        LOG_LEVEL: 'info',
        DISABLE_LOGS: 'false',
        REDIS_QUEUE_HOST: 'localhost',
        REDIS_QUEUE_PORT: '6380'
      },
      error_file: './logs/payment-service-api-error.log',
      out_file: './logs/payment-service-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    },

    // BullMQ Workers
    {
      name: 'payment-service-workers',
      script: './lib/workers/index.js',
      cwd: process.cwd(),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
        DB_PORT: '5433',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_DATABASE: 'payment-postgres',
        // Load from .env file or set these environment variables before starting PM2
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        LOG_LEVEL: 'info',
        DISABLE_LOGS: 'false',
        REDIS_QUEUE_HOST: 'localhost',
        REDIS_QUEUE_PORT: '6380',
        WORKER_CONCURRENCY_PENDING_TX: '1',
        WORKER_CONCURRENCY_ADMIN_CREDIT: '2'
      },
      error_file: './logs/payment-service-workers-error.log',
      out_file: './logs/payment-service-workers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    }
  ]
};
