#!/bin/bash
#
# SSH Tunnel to Qwen Inference Server
#
# This creates a secure tunnel from localhost:8000 to the VPS Qwen server.
# Run this in the background before starting the MCP server.
#

set -e

# Configure via environment variables (no hardcoded hosts).
#   VPS_HOST=your.server.example VPS_USER=admin ./tunnel-qwen.sh
VPS_HOST="${VPS_HOST:-your-inference-host.example}"
VPS_USER="${VPS_USER:-admin}"
SSH_KEY="${SSH_KEY:-/tmp/qwen_vps_key}"
LOCAL_PORT="${LOCAL_PORT:-8000}"
REMOTE_PORT="${REMOTE_PORT:-8000}"

if [ "$VPS_HOST" = "your-inference-host.example" ]; then
  echo "Set VPS_HOST to your inference server, e.g. VPS_HOST=your.server ./tunnel-qwen.sh" >&2
  exit 1
fi

echo "🔐 Setting up SSH tunnel to Qwen inference server..."
echo "   Local:  http://localhost:${LOCAL_PORT}"
echo "   Remote: ${VPS_USER}@${VPS_HOST}:${REMOTE_PORT}"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""

# Create tunnel (this blocks until Ctrl+C)
ssh -i "$SSH_KEY" \
    -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
    -N \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    "${VPS_USER}@${VPS_HOST}"
