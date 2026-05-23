#!/usr/bin/env bash
# verify-shot-1.sh — Demo cut 1: BaseURLDiff
# Assumes Joule dev server already running on :3001.
# Output: single-line JSON to stdout. Exit 0 on PASS, 1 on FAIL.

set -u

JOULE_URL="${JOULE_URL:-http://localhost:3001/v1/chat/completions}"

RESPONSE=$(curl -sS -X POST "$JOULE_URL" \
  -H "Content-Type: application/json" \
  -d '{"model":"any","messages":[{"role":"user","content":"Please summarize this in one sentence: The carbon footprint of large language model inference is a growing concern."}]}' \
  --max-time 30 2>&1)

CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
  printf '{"shot":1,"pass":false,"reason":"curl exit %d"}\n' "$CURL_EXIT"
  exit 1
fi

# Extract id field with jq if available, else with grep
if command -v jq >/dev/null 2>&1; then
  ID=$(echo "$RESPONSE" | jq -r '.id // empty' 2>/dev/null)
else
  ID=$(echo "$RESPONSE" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
fi

if [[ "$ID" == chatcmpl-* ]]; then
  printf '{"shot":1,"pass":true,"evidence":"%s"}\n' "$ID"
  exit 0
fi

# Extract error message for diagnosis
if command -v jq >/dev/null 2>&1; then
  ERR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
else
  ERR=$(echo "$RESPONSE" | grep -oE '"error"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1)
fi

printf '{"shot":1,"pass":false,"reason":"no chatcmpl- id","detail":"%s"}\n' "${ERR:-no id}"
exit 1
