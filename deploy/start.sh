#!/bin/bash
# Wrapper to load .env before starting Next.js (ensures AUTH_* etc. are available)
# Place in apps/web/ and run from there, or use full path
cd "$(dirname "$0")"
set -a
[ -f .env ] && . ./.env
set +a
export NODE_ENV=production
export HOST=0.0.0.0
export PORT=${PORT:-3000}
exec npx next start -H 0.0.0.0 -p ${PORT:-3000}
