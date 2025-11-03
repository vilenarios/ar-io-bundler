#!/bin/bash
# Setup PM2 auto-startup on system boot
# This configures systemd to automatically start PM2 services after reboot

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔧 Configuring PM2 Auto-Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run with sudo"
    echo ""
    echo "Usage:"
    echo "  sudo ./scripts/setup-pm2-startup.sh"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

echo "📋 Configuration:"
echo "  User: $ACTUAL_USER"
echo "  Home: $ACTUAL_HOME"
echo ""

# Configure PM2 startup
echo "⚙️  Configuring PM2 systemd service..."
env PATH=$PATH:/home/vilenarios/.nvm/versions/node/v22.17.0/bin \
    /home/vilenarios/.nvm/versions/node/v22.17.0/lib/node_modules/pm2/bin/pm2 startup systemd \
    -u vilenarios --hp /home/vilenarios

echo ""
echo "✅ PM2 systemd service configured!"
echo ""

# Verify the service was created
if systemctl list-unit-files | grep -q "pm2-vilenarios.service"; then
    echo "✅ Systemd service created: pm2-vilenarios.service"

    # Enable the service
    echo "⚙️  Enabling PM2 service..."
    systemctl enable pm2-vilenarios.service

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ PM2 Auto-Startup Configured Successfully!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Your PM2 services will now automatically start on system boot."
    echo ""
    echo "Service details:"
    echo "  Service name: pm2-vilenarios.service"
    echo "  Status: Enabled"
    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl status pm2-vilenarios   # Check service status"
    echo "  sudo systemctl restart pm2-vilenarios  # Restart PM2 services"
    echo "  pm2 list                               # List running processes"
    echo "  pm2 save                               # Save current process list"
    echo ""
else
    echo "❌ Failed to create systemd service"
    exit 1
fi
