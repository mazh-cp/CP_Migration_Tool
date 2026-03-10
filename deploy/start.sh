#!/bin/bash
# Production startup - uses Node loader (no shell expansion of $ in passwords)
cd "$(dirname "$0")"
exec node load-env.js
