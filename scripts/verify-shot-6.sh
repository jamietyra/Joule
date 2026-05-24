#!/usr/bin/env bash
# verify-shot-6.sh — Hermes natural-language chat (live agent)
# Assumes Joule (:3001) AND Dashboard (:3000) dev servers running.
# Output: single-line JSON. Exit 0 on PASS.

set -u

DASH_URL="${DASH_URL:-http://localhost:3000}"
QUESTION="${HERMES_TEST_QUESTION:-How much did we save this week?}"

# POST to /api/hermes
# Use node to safely JSON-encode the question (handles Korean properly)
RESPONSE=$(node -e "
const msg = process.argv[1];
const json = JSON.stringify({message: msg});
process.stdout.write(json);
" "$QUESTION" | curl -sS -X POST "$DASH_URL/api/hermes" \
  -H "Content-Type: application/json" \
  -d @- \
  --max-time 60 -w "\nHTTP_STATUS:%{http_code}" 2>&1)

STATUS=$(echo "$RESPONSE" | grep -oE "HTTP_STATUS:[0-9]+" | sed 's/HTTP_STATUS://')
BODY=$(echo "$RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$STATUS" != "200" ]; then
  printf '{"shot":6,"pass":false,"reason":"HTTP %s","body":%q}\n' "$STATUS" "$(echo "$BODY" | head -c 200)"
  exit 1
fi

# Extract answer and toolUsed using jq if available, else grep/sed
if command -v jq >/dev/null 2>&1; then
  ANSWER=$(echo "$BODY" | jq -r '.answer // empty' 2>/dev/null)
  TOOL=$(echo "$BODY" | jq -r '.toolUsed // empty' 2>/dev/null)
else
  ANSWER=$(echo "$BODY" | grep -oE '"answer"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"answer"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
  TOOL=$(echo "$BODY" | grep -oE '"toolUsed"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"toolUsed"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
fi

# Verify answer is non-empty and contains some content
if [ -z "$ANSWER" ] || [ "${#ANSWER}" -lt 5 ]; then
  printf '{"shot":6,"pass":false,"reason":"answer empty or too short","answer":"%s"}\n' "$ANSWER"
  exit 1
fi

# Verify toolUsed is getAggregateSavings (since question = "How much did we save this week?")
if [ "$TOOL" != "getAggregateSavings" ]; then
  printf '{"shot":6,"pass":false,"reason":"unexpected tool","toolUsed":"%s","expected":"getAggregateSavings"}\n' "$TOOL"
  exit 1
fi

# PASS — escape answer for JSON output
ANSWER_TRIMMED=$(echo "$ANSWER" | head -c 200)
printf '{"shot":6,"pass":true,"toolUsed":"%s","answerSample":"%s..."}\n' "$TOOL" "$ANSWER_TRIMMED"
exit 0
