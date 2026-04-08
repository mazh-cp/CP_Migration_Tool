#!/usr/bin/env bash
# =============================================================================
# Migrator — upgrade remote production from your workstation (SSH + curl)
#
# Does not require a local git clone. Fetches upgrade-production.sh from GitHub
# at the same ref you deploy (branch or tag), then runs it with sudo on the host.
#
# Usage:
#   REMOTE=ubuntu@203.0.113.10 ./deploy/upgrade-remote-production.sh [BRANCH_OR_TAG]
#
# Examples:
#   REMOTE=ubuntu@vm ./deploy/upgrade-remote-production.sh v1.5.2
#   REMOTE=ubuntu@vm DOC_RELEASE_TAG=v1.5.2 ./deploy/upgrade-remote-production.sh main
#
# Override repo (forks):
#   REPO_SLUG=org/CP_Migration_Tool REMOTE=user@host ./deploy/upgrade-remote-production.sh v1.5.2
# =============================================================================
set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE=user@host (e.g. REMOTE=ubuntu@203.0.113.10)}"
BRANCH="${1:-v1.5.2}"
REPO_SLUG="${REPO_SLUG:-mazh-cp/CP_Migration_Tool}"
DOC_RELEASE_TAG="${DOC_RELEASE_TAG:-$BRANCH}"
RAW_BASE="https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}"

SCRIPT_URL="${RAW_BASE}/deploy/upgrade-production.sh"

echo "==> Remote:  $REMOTE"
echo "==> Branch:  $BRANCH (script: $SCRIPT_URL)"
echo "==> Doc tag: $DOC_RELEASE_TAG"
echo ""

# shellcheck disable=SC2029
ssh -t "$REMOTE" \
  "curl -fsSL '${SCRIPT_URL}' | sudo env BRANCH='${BRANCH}' DOC_RELEASE_TAG='${DOC_RELEASE_TAG}' bash"

echo ""
echo "==> Done. Hard-refresh browsers (Ctrl+Shift+R). Re-run Parse on projects if needed."
