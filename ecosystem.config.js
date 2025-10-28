/**
 * PM2 Ecosystem Configuration for AR.IO Bundler
 *
 * This configuration properly loads .env files from each service
 * and starts all services with correct environment variables.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from each service
const paymentServiceEnv = dotenv.config({
  path: path.join(__dirname, 'packages/payment-service/.env')
}).parsed || {};

const uploadServiceEnv = dotenv.config({
  path: path.join(__dirname, 'packages/upload-service/.env')
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
        ...paymentServiceEnv,
        NODE_ENV: 'production',
        PORT: 4001,
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
        ...uploadServiceEnv,
        NODE_ENV: 'production',
        PORT: 3001,
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
        ...paymentServiceEnv,
        NODE_ENV: 'production',
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
        ...uploadServiceEnv,
        NODE_ENV: 'production',
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
        ...uploadServiceEnv,
        NODE_ENV: 'production',
        BULL_BOARD_PORT: 3002,
      },
      error_file: './logs/bull-board-error.log',
      out_file: './logs/bull-board-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
    },
  ],
};
