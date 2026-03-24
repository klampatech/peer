#!/bin/bash
# Deploy script for peer production deployment
# Usage: ./deploy.sh [user@host]
#
# Authentication: SSH key auth via ssh-agent is the only supported method.
# DEPLOY_PASSWORD is ignored — password auth is not supported for security reasons.

set -e

SSH_HOST="${1:-root@204.168.181.142}"

DEPLOY_DIR="/root/peer"
COMPOSE_FILE="docker-compose.production.yml"

# ERR trap with step tracking for clear error reporting
trap 'echo "Error at step: $STEP" >&2' ERR

echo "=== Peer Production Deployment ==="
echo "Target: $SSH_HOST"
echo "Directory: $DEPLOY_DIR"
echo ""

# Determine SSH command based on available auth methods
if [ -n "$SSH_AUTH_SOCK" ]; then
    # ssh-agent is available — use key-based auth
    SSH_CMD="ssh -o StrictHostKeyChecking=yes -o AddKeysToAgent=yes"
    SCP_CMD="scp -o StrictHostKeyChecking=yes"
    echo "Using SSH agent for key-based auth."
elif [ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ]; then
    # Direct SSH key file — use with -i flag (GitHub Actions workflow)
    SSH_CMD="ssh -o StrictHostKeyChecking=yes -i $SSH_KEY_FILE"
    SCP_CMD="scp -o StrictHostKeyChecking=yes -i $SSH_KEY_FILE"
    echo "Using SSH key file for auth: $SSH_KEY_FILE"
elif [ -n "$DEPLOY_PASSWORD" ]; then
    # DEPRECATED: Password auth via DEPLOY_PASSWORD is not supported.
    # SSH key auth via ssh-agent is the only acceptable method.
    echo "Error: DEPLOY_PASSWORD is set but password auth is not supported."
    echo "  Use SSH key auth via ssh-agent instead. Set DEPLOY_SSH_KEY in GitHub Actions."
    exit 1
else
    echo "Error: No SSH authentication available."
    echo "  - Ensure ssh-agent is running and SSH_AUTH_SOCK is set (use webfactory/ssh-agent in CI)"
    echo "  - Or set SSH_KEY_FILE env var pointing to the private key file"
    exit 1
fi

# Pre-flight connectivity check
echo ">>> Checking connectivity to $SSH_HOST..."
STEP="connectivity-check"
if ! $SSH_CMD -o ConnectTimeout=10 "$SSH_HOST" "echo connected" 2>/dev/null; then
    echo "Error: Cannot connect to $SSH_HOST. Check SSH key configuration and host reachability."
    exit 1
fi

# Step 1: Pull latest code
STEP="pull"
echo ">>> Pulling latest code..."
$SSH_CMD "$SSH_HOST" "cd $DEPLOY_DIR && git pull origin main"

# Step 2: Build and restart containers
STEP="build"
echo ">>> Building and restarting containers..."
$SSH_CMD "$SSH_HOST" "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE down && docker compose -f $COMPOSE_FILE up -d --build"

# Step 3: Verify containers are running
STEP="verify"
echo ">>> Verifying containers..."
$SSH_CMD "$SSH_HOST" "docker compose -f $COMPOSE_FILE ps"

echo ""
echo "=== Deployment Complete ==="
echo "Check https://204.168.181.142 for the application"

# Reset trap
trap - ERR
