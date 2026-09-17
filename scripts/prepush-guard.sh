#!/usr/bin/env bash
# ── Claude Code PreToolUse hook (Bash) ──
# Reads the tool call from stdin; when it is a `git push`, runs the
# preflight first and blocks the push (exit 2) if anything fails, so a
# broken commit never reaches GitHub — no red CI run, no failed Vercel
# build, no email. Anything that is not a push passes straight through.
set -uo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception: print("")')"
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
if bash "$root/scripts/preflight.sh" > /tmp/angus-preflight.log 2>&1; then
  exit 0
fi
{
  echo "Push blocked: preflight failed. CI and the Vercel build run these exact commands, so this push would fail red."
  echo "Fix the failures below, then push again."
  grep -E '^\s*✗|error|Error|FAIL' /tmp/angus-preflight.log | head -40
  echo "(full log: /tmp/angus-preflight.log)"
} >&2
exit 2
