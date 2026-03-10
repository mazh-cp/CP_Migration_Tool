#!/bin/bash
# Production startup - loads .env via Node (handles special chars in passwords)
cd "$(dirname "$0")"
exec node load-env.js
