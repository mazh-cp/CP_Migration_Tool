#!/usr/bin/env bash
# =============================================================================
# Migrator — upgrade production VM directly from GitHub (run ON the server)
#
# Pulls deploy/upgrade-production.sh from GitHub at BRANCH, then runs the full
# updater (git pull, npm ci, Prisma, build, systemd refresh, restart).
#
# Latest main (recommended after each merge):
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-on-vm.sh | sudo bash
#
# Pinned tag:
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.1/deploy/upgrade-on-vm.sh | sudo env BRANCH=v1.6.1 DOC_RELEASE_TAG=v1.6.1 bash
#
# Fork: REPO_SLUG=your-org/your-fork
# Requires Node 22.13+ for current main (installer uses NodeSource 22.x).
# =============================================================================
set -euo pipefail

REPO_SLUG="${REPO_SLUG:-mazh-cp/CP_Migration_Tool}"
BRANCH="${BRANCH:-main}"
DOC_RELEASE_TAG="${DOC_RELEASE_TAG:-$BRANCH}"
SCRIPT_URL="https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}/deploy/upgrade-production.sh"

echo "==> Migrator upgrade from GitHub"
echo "    Repository: ${REPO_SLUG}"
echo "    Ref:        ${BRANCH}"
echo "    Doc tag:    ${DOC_RELEASE_TAG}"
echo "    Fetching:   ${SCRIPT_URL}"
echo ""

curl -fsSL "$SCRIPT_URL" | env BRANCH="$BRANCH" DOC_RELEASE_TAG="$DOC_RELEASE_TAG" bash