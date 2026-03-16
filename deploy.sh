#!/bin/bash
# deploy.sh — Cloudflare Workers deployment script for mcp-xmind
set -e

cd /Users/tuongbeo/GitHub/mcp-xmind

echo "=== Step 1: Create R2 bucket ==="
./node_modules/.bin/wrangler r2 bucket create xmind-files

echo ""
echo "=== Step 2: Create KV namespace ==="
./node_modules/.bin/wrangler kv namespace create XMIND_META

echo ""
echo "=== IMPORTANT: Update wrangler.toml with the KV id above ==="
echo "Copy the 'id' from the output above into wrangler.toml [[kv_namespaces]] section"
echo ""
echo "Press Enter when wrangler.toml has been updated..."
read

echo "=== Step 3: Deploy ==="
./node_modules/.bin/wrangler deploy

echo ""
echo "=== Done! ==="
