/**
 * PM2 Ecosystem Configuration for AR.IO Bundler
 *
 * This configuration loads the single root .env file and
 * starts all services with correct environment variables.
 * Service-specific overrides (like DB_DATABASE) are applied per service.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load the single root .env file
const rootEnv = dotenv.config({
  path: path.join(__dirname, '.env')
}).parsed || {};

module.exports = {
  apps: [
    {
      name: 'payment-service',
      cwd: path.join(__dirname, 'packages/payment-service'),
      script: './lib/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        ...rootEnv,
        NODE_ENV: 'production',
        PORT: 4001,
        DB_DATABASE: 'payment_service', // Override for payment service
      },
      error_file: './logs/payment-service-error.log',
      out_file: './logs/payment-service-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
    },
    {
      name: 'upload-api',
      cwd: path.join(__dirname, 'packages/upload-service'),
      script: './lib/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        ...rootEnv,
        NODE_ENV: 'production',
        PORT: 3001,
        DB_DATABASE: 'upload_service', // Override for upload service
      },
      error_file: './logs/upload-api-error.log',
      out_file: './logs/upload-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
    },
    {
      name: 'payment-workers',
      cwd: path.join(__dirname, 'packages/payment-service'),
      script: './lib/workers/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...rootEnv,
        NODE_ENV: 'production',
        DB_DATABASE: 'payment_service', // Override for payment service
      },
      error_file: './logs/payment-workers-error.log',
      out_file: './logs/payment-workers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      kill_timeout: 30000,
    },
    {
      name: 'upload-workers',
      cwd: path.join(__dirname, 'packages/upload-service'),
      script: './lib/workers/allWorkers.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...rootEnv,
        NODE_ENV: 'production',
        DB_DATABASE: 'upload_service', // Override for upload service
      },
      error_file: './logs/upload-workers-error.log',
      out_file: './logs/upload-workers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      kill_timeout: 30000,
    },
    {
      name: 'bull-board',
      cwd: __dirname,
      script: './packages/upload-service/bull-board-server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...rootEnv,
        NODE_ENV: 'production',
        BULL_BOARD_PORT: 3002,
        DB_DATABASE: 'upload_service', // Uses upload service database
      },
      error_file: './logs/bull-board-error.log',
      out_file: './logs/bull-board-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
    },
  ],
};
