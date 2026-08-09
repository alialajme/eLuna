#!/usr/bin/env bash
#
# One-time setup: point git at the repo's committed hooks (.githooks) and check
# that gitleaks is available. Run once per fresh clone:  bash scripts/setup-hooks.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

git config core.hooksPath .githooks
echo "✅ core.hooksPath set to .githooks (pre-commit secret scan enabled)."

if command -v gitleaks >/dev/null 2>&1; then
  echo "✅ gitleaks found: $(gitleaks version)"
else
  echo "⚠️  gitleaks is NOT installed — commits will be blocked until you install it."
  echo "     macOS:  brew install gitleaks"
  echo "     other:  https://github.com/gitleaks/gitleaks#installing"
fi
