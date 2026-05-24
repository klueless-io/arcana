#!/usr/bin/env bash
# release.sh — bump, build, test, commit, tag, publish
#
# Usage:
#   ./scripts/release.sh patch          # 2.1.1 → 2.1.2
#   ./scripts/release.sh minor          # 2.1.1 → 2.2.0
#   ./scripts/release.sh major          # 2.1.1 → 3.0.0
#   ./scripts/release.sh 2.3.0          # exact version
#
# The script will pause before publishing and ask for your npm OTP.
# Nothing is published until you enter a valid OTP.

set -euo pipefail

PACKAGES=(
  packages/cortex-contracts
  packages/cortex-core
  packages/cortex-testkit
  packages/cortex-provider-libsql
  packages/cortex-provider-sqlite-vec
  packages/cortex-provider-llm-claude-code
)

# ── Resolve new version ──────────────────────────────────────────────────────

BUMP=${1:-}
if [[ -z "$BUMP" ]]; then
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  exit 1
fi

CURRENT=$(node -p "require('./packages/cortex-contracts/package.json').version")

bump_version() {
  local current=$1 part=$2
  IFS='.' read -r major minor patch <<< "$current"
  case "$part" in
    major) echo "$((major+1)).0.0" ;;
    minor) echo "${major}.$((minor+1)).0" ;;
    patch) echo "${major}.${minor}.$((patch+1))" ;;
    *)     echo "$part" ;;  # treat as literal version
  esac
}

NEW=$(bump_version "$CURRENT" "$BUMP")

echo ""
echo "  Cortex release: $CURRENT → $NEW"
echo ""

# ── Verify working tree is clean ─────────────────────────────────────────────

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is dirty. Commit or stash changes first."
  git status --short
  exit 1
fi

# ── Bump version in all package.json files ───────────────────────────────────

echo "  [1/5] Bumping versions..."
for pkg in "${PACKAGES[@]}"; do
  node -e "
    const fs = require('fs');
    const p = '$pkg/package.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '$NEW';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
done
echo "        Done — all packages at $NEW"

# ── Build ─────────────────────────────────────────────────────────────────────

echo "  [2/5] Building..."
pnpm build
echo "        Build OK"

# ── Test ──────────────────────────────────────────────────────────────────────

echo "  [3/5] Running tests..."
pnpm test
echo "        Tests OK"

# ── Commit (no tag yet) ──────────────────────────────────────────────────────
# Tag is created AFTER successful npm publish — prevents the v2.1.4 problem
# where a tag existed locally for a version that never reached the registry.

echo "  [4/6] Committing version bump..."
git add packages/*/package.json
git commit -m "chore: release v${NEW}"
echo "        Committed (tag will be created after npm publish succeeds)"

# ── Publish ───────────────────────────────────────────────────────────────────

echo ""
echo "  [5/6] Ready to publish v${NEW} to npm."
echo "        Enter your npm OTP (or Ctrl-C to abort):"
read -r OTP

pnpm publish -r --access public --otp "$OTP"

# ── Verify the new version actually landed on npm ────────────────────────────
# pnpm publish exits 0 even when individual packages 404/fail. Confirm the
# first package surfaced at the expected version before tagging. npm CDN can
# take a few seconds to propagate after a successful publish, so retry a few
# times before declaring failure.

echo ""
echo "  [6/6] Verifying npm registry has v${NEW} (with retries for CDN propagation)..."
PUBLISHED=""
for attempt in 1 2 3 4 5; do
  PUBLISHED=$(npm view @kybernesis/cortex-contracts version 2>/dev/null || echo "MISSING")
  if [[ "$PUBLISHED" == "$NEW" ]]; then
    break
  fi
  echo "        attempt $attempt: registry shows '$PUBLISHED', waiting 3s..."
  sleep 3
done
if [[ "$PUBLISHED" != "$NEW" ]]; then
  echo "  ✗ Registry still shows @kybernesis/cortex-contracts at '$PUBLISHED' (expected '$NEW')."
  echo "    Publish did not complete or propagation stalled. NOT tagging."
  echo "    If npm view shows the right version manually, tag with: git tag v${NEW}"
  exit 1
fi
git tag "v${NEW}"
echo "        Registry confirmed; tagged v${NEW}"

echo ""
echo "  ✓ v${NEW} published. Push with:"
echo "    git push origin main --tags"
