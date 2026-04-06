#!/usr/bin/env bash
# =============================================================================
# Migrator — canonical production upgrade entrypoint (Ubuntu / Azure VM)
#
# When this file is curl-piped into bash, there is no on-disk sibling script and
# BASH_SOURCE is empty — we fetch deploy/update_azure_ubuntu.sh from GitHub.
#
# sudo does NOT keep BRANCH from "BRANCH=v1.x curl | sudo bash". Pass the ref
# inside sudo, or as an argument to bash -s (recommended).
#
# Latest main:
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
#
# Pinned tag (pick one):
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.5.0/deploy/upgrade-production.sh | sudo bash -s -- v1.5.0
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.5.0/deploy/upgrade-production.sh | sudo env BRANCH=v1.5.0 bash
#
# Optional: REPO_SLUG DOC_RELEASE_TAG (see update_azure_ubuntu.sh)
# =============================================================================
set -eo pipefail

# Positional ref when piped: curl ... | sudo bash -s -- v1.5.0
if [[ -z "${BRANCH:-}" && -n "${1:-}" ]]; then
  export BRANCH="$1"
  shift || true
fi

export DOC_RELEASE_TAG="${DOC_RELEASE_TAG:-v1.5.0}"
export BRANCH="${BRANCH:-main}"

THIS="${BASH_SOURCE[0]:-}"
if [[ -n "$THIS" ]]; then
  DIR="$(cd "$(dirname "$THIS")" && pwd)"
  if [[ -f "$DIR/update_azure_ubuntu.sh" ]]; then
    set -u
    exec bash "$DIR/update_azure_ubuntu.sh"
  fi
fi

REPO_SLUG="${REPO_SLUG:-mazh-cp/CP_Migration_Tool}"
URL="https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}/deploy/update_azure_ubuntu.sh"

set -u
echo "==> upgrade-production: running updater from ${URL}"
curl -fsSL "$URL" | bash -s
