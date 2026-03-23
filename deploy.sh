#!/bin/bash
# Deploy script for peer production deployment
# Usage: ./deploy.sh [user@host]

set -e

SSH_HOST="${1:-root@204.168.181.142}"
SSH_PASS="${DEPLOY_PASSWORD:-}"

DEPLOY_DIR="/root/peer"
COMPOSE_FILE="docker-compose.production.yml"

echo "=== Peer Production Deployment ==="
echo "Target: $SSH_HOST"
echo "Directory: $DEPLOY_DIR"
echo ""

# Check if we're running interactively with sshpass
if [ -n "$SSH_PASS" ]; then
    export SSHPASS="$SSH_PASS"
    SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=no"
    SCP_CMD="sshpass -e scp -o StrictHostKeyChecking=no"
else
    SSH_CMD="ssh -o StrictHostKeyChecking=no"
    SCP_CMD="scp -o StrictHostKeyChecking=no"
    echo "Warning: DEPLOY_PASSWORD not set. Using key-based auth if available."
fi

# Step 1: Pull latest code
echo ">>> Pulling latest code..."
$SSH_CMD "$SSH_HOST" "cd $DEPLOY_DIR && git pull origin main"

# Step 2: Build and restart containers
echo ">>> Building and restarting containers..."
$SSH_CMD "$SSH_HOST" "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE down && docker compose -f $COMPOSE_FILE up -d --build"

# Step 3: Verify containers are running
echo ">>> Verifying containers..."
$SSH_CMD "$SSH_HOST" "docker compose -f $COMPOSE_FILE ps"

echo ""
echo "=== Deployment Complete ==="
echo "Check https://204.168.181.142 for the application"
