#!/bin/bash
# One-step setup for ClawWorker (OpenClaw on Cloudflare Workers)
# Run: npm run setup  (or ./scripts/setup.sh)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ClawWorker - One-Step Setup                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required. Install Node.js first." >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "Error: npx is required." >&2; exit 1; }

echo "📦 Installing dependencies..."
npm install --silent

echo ""
echo "AI Provider - choose one:"
echo "  1) Anthropic (direct) - Enter your ANTHROPIC_API_KEY"
echo "  2) Cloudflare AI Gateway - Enter gateway credentials"
echo "  3) Skip (configure later via: wrangler secret put ANTHROPIC_API_KEY)"
echo ""
read -p "Choice [1]: " AI_CHOICE
AI_CHOICE=${AI_CHOICE:-1}

if [ "$AI_CHOICE" = "1" ]; then
  echo ""
  read -sp "Enter your Anthropic API key (sk-ant-...): " ANTHROPIC_API_KEY
  echo ""
  if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: API key cannot be empty." >&2
    exit 1
  fi
elif [ "$AI_CHOICE" = "2" ]; then
  echo ""
  read -sp "CLOUDFLARE_AI_GATEWAY_API_KEY: " CLOUDFLARE_AI_GATEWAY_API_KEY
  echo ""
  read -p "CF_AI_GATEWAY_ACCOUNT_ID: " CF_AI_GATEWAY_ACCOUNT_ID
  read -p "CF_AI_GATEWAY_GATEWAY_ID: " CF_AI_GATEWAY_GATEWAY_ID
  if [ -z "$CLOUDFLARE_AI_GATEWAY_API_KEY" ] || [ -z "$CF_AI_GATEWAY_ACCOUNT_ID" ] || [ -z "$CF_AI_GATEWAY_GATEWAY_ID" ]; then
    echo "Error: All AI Gateway fields are required." >&2
    exit 1
  fi
fi

# Generate gateway token
GATEWAY_TOKEN=$(openssl rand -hex 32)
echo ""
echo "Generated gateway token (save this!): $GATEWAY_TOKEN"
echo ""

# R2 storage (required for memory persistence)
echo "R2 Storage (required) - Create an API token at: Dashboard → R2 → Manage R2 API Tokens"
echo "  Use Object Read & Write, select the clawworker-data bucket (created on first deploy)"
echo ""
read -p "R2_ACCESS_KEY_ID: " R2_ACCESS_KEY_ID
read -sp "R2_SECRET_ACCESS_KEY: " R2_SECRET_ACCESS_KEY
echo ""
read -p "CF_ACCOUNT_ID (Dashboard → account name → Copy Account ID): " CF_ACCOUNT_ID

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$CF_ACCOUNT_ID" ]; then
  echo "Error: All R2 credentials are required for memory persistence." >&2
  exit 1
fi

# Deploy
echo "🚀 Deploying to Cloudflare..."
npm run build --silent 2>/dev/null || npm run build
npx wrangler deploy

# Set secrets (targets worker from wrangler.jsonc)
echo ""
echo "🔐 Configuring secrets..."

echo "$GATEWAY_TOKEN" | npx wrangler secret put GATEWAY_TOKEN

if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "$ANTHROPIC_API_KEY" | npx wrangler secret put ANTHROPIC_API_KEY
fi

if [ -n "$CLOUDFLARE_AI_GATEWAY_API_KEY" ]; then
  echo "$CLOUDFLARE_AI_GATEWAY_API_KEY" | npx wrangler secret put CLOUDFLARE_AI_GATEWAY_API_KEY
  echo "$CF_AI_GATEWAY_ACCOUNT_ID" | npx wrangler secret put CF_AI_GATEWAY_ACCOUNT_ID
  echo "$CF_AI_GATEWAY_GATEWAY_ID" | npx wrangler secret put CF_AI_GATEWAY_GATEWAY_ID
fi

echo "$R2_ACCESS_KEY_ID" | npx wrangler secret put R2_ACCESS_KEY_ID
echo "$R2_SECRET_ACCESS_KEY" | npx wrangler secret put R2_SECRET_ACCESS_KEY
echo "$CF_ACCOUNT_ID" | npx wrangler secret put CF_ACCOUNT_ID

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ ClawWorker setup complete!                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Add this token to your worker URL (shown in deploy output above):"
echo ""
echo "  Control UI:  https://YOUR-WORKER.workers.dev/?token=$GATEWAY_TOKEN"
echo "  Admin UI:    https://YOUR-WORKER.workers.dev/_admin/?token=$GATEWAY_TOKEN"
echo ""
echo "⚠️  First request may take 1-2 minutes (container cold start)"
echo ""
echo "Optional: Enable Cloudflare Access for production auth (see README)"
echo ""
