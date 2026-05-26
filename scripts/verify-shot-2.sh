#!/usr/bin/env bash
# verify-shot-2.sh — Demo cut 2: AutoModelSelection
# Assumes Joule dev server running on :3001 and joule.db at repo root.
# Sequence: summarize prompt → expect nano; code prompt → expect super.
# Checks last 2 rows of call_log.

set -u

JOULE_URL="${JOULE_URL:-http://localhost:3001/v1/chat/completions}"
DB_PATH="${JOULE_DB_PATH:-./joule.db}"

# 1) Summarize prompt (should route to nano-30b-a3b)
curl -sS -X POST "$JOULE_URL" \
  -H "Content-Type: application/json" \
  -d '{"model":"any","messages":[{"role":"user","content":"Please summarize this paragraph in one sentence: Carbon-aware AI gateways route requests to the smallest sufficient model and the lowest-carbon time-of-day."}]}' \
  --max-time 30 > /dev/null

# Brief pause to ensure DB write ordering
sleep 1

# 2) Code generation prompt (should route to super-120b-a12b)
curl -sS -X POST "$JOULE_URL" \
  -H "Content-Type: application/json" \
  -d '{"model":"any","messages":[{"role":"user","content":"Write a Python function that takes a list of integers and returns the sum of squares of even numbers."}]}' \
  --max-time 60 > /dev/null

sleep 1

# 3) Query DB for last 2 rows
# Uses Node.js + better-sqlite3 (project dep) as a portable fallback when sqlite3 CLI is absent.
_query_db() {
  node -e "
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH');
const rows = db.prepare('SELECT model_id FROM call_log ORDER BY ts DESC LIMIT 2').all();
rows.forEach(r => console.log(r.model_id));
db.close();
" 2>/dev/null
}

LAST_TWO=$(_query_db)
ROW1=$(echo "$LAST_TWO" | sed -n '1p')  # most recent = code
ROW2=$(echo "$LAST_TWO" | sed -n '2p')  # second-most-recent = summarize

# 4) Verify: row1=super-* AND row2=nano-*
PASS=false
if [[ "$ROW1" == super-* && "$ROW2" == nano-* ]]; then
  PASS=true
fi

if $PASS; then
  echo ""
  echo "[Cut 2] AutoModelSelection -- same endpoint, different intents -> different models"
  echo "   OK  'summarize' prompt routed to: $ROW2   (smaller, ~1/5 carbon)"
  echo "   OK  'code'      prompt routed to: $ROW1   (larger, more accurate)"
  echo "   OK  PASS -- Joule DecisionLayer picked the model per intent"
  echo ""
  printf '{"shot":2,"pass":true,"models":["%s","%s"]}\n' "$ROW1" "$ROW2"
  exit 0
fi

printf '{"shot":2,"pass":false,"models":["%s","%s"],"expected":["super-*","nano-*"]}\n' "$ROW1" "$ROW2"
exit 1
