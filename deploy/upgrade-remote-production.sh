#!/usr/bin/env bash
# =============================================================================
# Migrator — remote production VM upgrade (workstation → SSH → Ubuntu host)
#
# Runs entirely on the VM after SSH: downloads deploy/upgrade-production.sh from
# GitHub at your chosen ref, then executes it with sudo. No local git clone
# required on your laptop.
#
# Current stack (see CHANGELOG.md, tag v1.5.3+):
#   • Node.js 22.x LTS (NodeSource) — installer/updater upgrades if < 22
#   • npm ci, Prisma generate + db push, turbo monorepo build (Next.js 15)
#   • Refreshes systemd unit, restarts cp-migration-tool, health-checks /health
#
# Prerequisites on the VM (first-time: deploy/install_azure_ubuntu.sh):
#   • Git checkout at APP_DIR (default /opt/cp_migration_tool)
#   • apps/web/.env with at least DATABASE_URL, SESSION_SECRET (≥32 chars in prod),
#     AUTH_USERNAME / AUTH_PASSWORD (or DB users), COOKIE_SECURE as appropriate
#
# Single command (no repo clone on laptop — replace ubuntu@YOUR-VM):
#   ssh -t ubuntu@YOUR-VM 'curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.5.3/deploy/upgrade-production.sh | sudo env BRANCH=v1.5.3 DOC_RELEASE_TAG=v1.5.3 bash'
#
# Usage (from clone):
#   REMOTE=ubuntu@203.0.113.10 ./deploy/upgrade-remote-production.sh [BRANCH_OR_TAG]
#
# Examples:
#   REMOTE=ubuntu@vm ./deploy/upgrade-remote-production.sh v1.5.3
#   REMOTE=ubuntu@vm ./deploy/upgrade-remote-production.sh main
#   REMOTE=ubuntu@vm DOC_RELEASE_TAG=v1.5.3 ./deploy/upgrade-remote-production.sh main
#
# Optional environment (exported before running this script):
#   REPO_SLUG     — default mazh-cp/CP_Migration_Tool (forks)
#   DOC_RELEASE_TAG — changelog label in server banner (default: same as BRANCH)
#   NODE_OPTIONS  — passed to sudo on the VM for npm run build (e.g. larger heap)
#   SSH_OPTS      — extra args to ssh (default: -o ServerAliveInterval=30)
#
# =============================================================================
set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE=user@host (e.g. REMOTE=ubuntu@203.0.113.10)}"
BRANCH="${1:-v1.5.3}"
REPO_SLUG="${REPO_SLUG:-mazh-cp/CP_Migration_Tool}"
DOC_RELEASE_TAG="${DOC_RELEASE_TAG:-$BRANCH}"
RAW_BASE="https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}"
SCRIPT_URL="${RAW_BASE}/deploy/upgrade-production.sh"
SSH_OPTS="${SSH_OPTS:--o ServerAliveInterval=30 -o ServerAliveCountMax=120}"

# Optional larger heap for npm run build (server also defaults 6144 MB if unset).
NODE_EXPORT=""
if [[ -n "${NODE_OPTIONS:-}" ]]; then
  NODE_EXPORT=" NODE_OPTIONS=$(printf '%q' "$NODE_OPTIONS")"
fi

echo "==> Remote:       $REMOTE"
echo "==> Git ref:       $BRANCH (script URL below)"
echo "==> Doc tag:       $DOC_RELEASE_TAG"
echo "==> Script:        $SCRIPT_URL"
if [[ -n "${NODE_OPTIONS:-}" ]]; then
  echo "==> NODE_OPTIONS:  $NODE_OPTIONS (passed to remote build)"
fi
echo ""

# shellcheck disable=SC2029
ssh -t $SSH_OPTS "$REMOTE" \
  "set -euo pipefail; curl -fsSL '${SCRIPT_URL}' | sudo env BRANCH='${BRANCH}' DOC_RELEASE_TAG='${DOC_RELEASE_TAG}'${NODE_EXPORT} bash"

echo ""
echo "==> Done."
echo "    Hard-refresh browsers (Ctrl+Shift+R). Re-run Parse on projects if schema or parsers changed."
echo "    Logs: ssh $REMOTE 'sudo journalctl -u cp-migration-tool -n 80 --no-pager'"
