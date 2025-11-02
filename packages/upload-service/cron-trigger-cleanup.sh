#!/bin/bash
# Cron trigger for BullMQ cleanup job
# Add to crontab with: crontab -e
# Example: Run daily at 2 AM: 0 2 * * * /home/vilenarios/ar-io-bundler/packages/upload-service/cron-trigger-cleanup.sh >> /tmp/cleanup-fs-cron.log 2>&1

cd /home/vilenarios/ar-io-bundler/packages/upload-service
/home/vilenarios/.nvm/versions/node/v22.17.0/bin/node trigger-cleanup.js
