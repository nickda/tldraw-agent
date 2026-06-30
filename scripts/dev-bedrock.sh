#!/bin/bash
# Start the dev environment with Bedrock backend.
# Handles: fresh AWS creds, both vite + server, correct env vars.

set -e

PROFILE="${AWS_PROFILE:-ClaudeBedrockAccess}"
MODEL="${AGENT_BEDROCK_MODEL:-bedrock-claude-opus-4-8}"

echo "Refreshing AWS credentials (profile: $PROFILE)..."
rm -f ~/.aws/cli/cache/*.json
eval "$(aws configure export-credentials --profile "$PROFILE" --format env)"
echo "Creds valid until: $AWS_CREDENTIAL_EXPIRATION"

# Kill stale processes
lsof -ti:8787 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

export AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Starting server (model: $MODEL, region: $AWS_REGION)..."
AGENT_BEDROCK_MODEL="$MODEL" AGENT_BACKEND=bedrock AGENT_SERVE_DIST=false \
  npx tsx server/index.ts &
SERVER_PID=$!

echo "Starting vite..."
AGENT_BACKEND=bedrock npx vite --port 5173 &
VITE_PID=$!

sleep 4

# Health check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/stream \
  -H "Content-Type: application/json" -d '{}')
if [ "$STATUS" = "200" ]; then
  echo "Ready: http://localhost:5173"
else
  echo "WARNING: server returned $STATUS (may need 'aws sso login --profile $PROFILE')"
fi

echo "PIDs: server=$SERVER_PID vite=$VITE_PID"
echo "Press Ctrl+C to stop both."
wait
