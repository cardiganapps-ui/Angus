#!/usr/bin/env bash
# ── Preflight ──
# Exactly what CI and the Vercel build run, in the same order, with the
# exit code preserved. Run it before every push; the Claude Code hook in
# .claude/settings.json runs it FOR you and blocks `git push` when it
# fails. Two red-email rounds on 2026-09-17 came from a lint error that
# a local `npm run lint | tail -1` had hidden — a pipe swallows the exit
# code. This never pipes.
set -uo pipefail
cd "$(dirname "$0")/.."

steps=("typecheck" "lint" "test" "build")
failed=()
for s in "${steps[@]}"; do
  printf '\n\033[1m▸ npm run %s\033[0m\n' "$s"
  if npm run --silent "$s"; then
    printf '  ✓ %s\n' "$s"
  else
    printf '  ✗ %s\n' "$s"
    failed+=("$s")
  fi
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "✓ preflight clean — this push will not fail CI or the deploy"
  exit 0
fi
echo "✗ preflight failed: ${failed[*]} — fix before pushing (CI and Vercel run these same commands)"
exit 1
