#!/bin/bash
# CP Migration Tool — Post-install verification
# Run: bash deploy/post_install_checks.sh

set -e
PORT="${PORT:-3000}"

echo "==> Post-install checks"
echo ""

# Health
echo -n "  Health endpoint: "
if curl -sf "http://127.0.0.1:$PORT/health" | grep -q '"status":"ok"'; then
  echo "OK"
else
  echo "FAIL"
  exit 1
fi

# Ready
echo -n "  Ready endpoint:  "
if curl -sf "http://127.0.0.1:$PORT/ready" | grep -q '"status":"ready"'; then
  echo "OK"
else
  echo "FAIL"
  exit 1
fi

# Login page
echo -n "  Login page:      "
if curl -sf "http://127.0.0.1:$PORT/login" | grep -q 'Sign in'; then
  echo "OK"
else
  echo "FAIL"
  exit 1
fi

echo ""
echo "All checks passed."
