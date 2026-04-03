#!/usr/bin/env sh
# Stop processes listening on common Next.js dev ports (macOS / Linux; uses lsof).
for port in 3000 3001 3002 3003; do
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "clear: stopping listener(s) on port $port (PIDs: $pids)"
    for pid in $pids; do
      kill -9 "$pid" 2>/dev/null || true
    done
  fi
done
