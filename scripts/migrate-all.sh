#!/bin/bash

#############################
# Run all database migrations
#############################

set -e

echo "🗄️  Running all database migrations..."
echo ""

# Check if postgres is running
if ! docker ps | grep -q ar-io-bundler-postgres; then
  echo "⚠️  PostgreSQL container not running"
  echo "   Starting infrastructure..."
  yarn infra:up
  sleep 5
fi

# Payment service migrations
echo "📦 Migrating payment-service database..."
yarn workspace @ar-io-bundler/payment-service db:migrate:latest

if [ $? -eq 0 ]; then
  echo "✅ Payment service migrations complete"
else
  echo "❌ Payment service migrations failed"
  exit 1
fi

echo ""

# Upload service migrations
echo "📦 Migrating upload-service database..."
yarn workspace @ar-io-bundler/upload-service db:migrate:latest

if [ $? -eq 0 ]; then
  echo "✅ Upload service migrations complete"
else
  echo "❌ Upload service migrations failed"
  exit 1
fi

echo ""
echo "✅ All migrations complete!"
