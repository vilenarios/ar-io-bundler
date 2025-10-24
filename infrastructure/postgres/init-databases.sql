-- Initialize both payment_service and upload_service databases
-- This script runs when PostgreSQL container first starts

-- Create payment_service database
CREATE DATABASE payment_service;

-- Create upload_service database
CREATE DATABASE upload_service;

-- Grant privileges (user is created by POSTGRES_USER env var)
GRANT ALL PRIVILEGES ON DATABASE payment_service TO turbo_admin;
GRANT ALL PRIVILEGES ON DATABASE upload_service TO turbo_admin;

\echo 'Databases created: payment_service, upload_service'
