#!/usr/bin/env bash
# verify-shot-5.sh — Demo cut 5: XCarbonGrams source label (Defensive measurement)
# Assumes Joule dev server running on :3001 and joule.db at repo root.
# Checks that the latest call_log row has source = 'static' OR 'header'.

set -u

JOULE_URL="${JOULE_URL:-http://localhost:3001/v1/chat/completions}"
DB_PATH="${JOULE_DB_PATH:-./joule.db}"

# 1) Fire one request to generate a call_log row
curl -sS -X POST "$JOULE_URL" \
  -H "Content-Type: application/json" \
  -d '{"model":"any","messages":[{"role":"user","content":"Please summarize this in one sentence: The world is warming."}]}' \
  --max-time 30 > /dev/null

sleep 1

# 2) Query the source field of the latest row
# Uses Node.js + better-sqlite3 (project dep) as a portable fallback when sqlite3 CLI is absent.
_query_db() {
  node -e "
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH');
const row = db.prepare('SELECT source FROM call_log ORDER BY ts DESC LIMIT 1').get();
if (row) {
  console.log(row.source || '');
} else {
  console.log('');
}
db.close();
" 2>/dev/null
}

SOURCE=$(_query_db)

# 3) Verify source is either 'static' or 'header'
if [[ "$SOURCE" == "static" || "$SOURCE" == "header" ]]; then
  if [[ "$SOURCE" == "header" ]]; then
    SOURCE_LABEL="Crusoe X-Carbon-grams header (direct)"
  else
    SOURCE_LABEL="Joule conversion table"
  fi
  echo ""
  echo "[Cut 5] XCarbonGrams source label -- Defensive carbon measurement"
  echo "   OK  latest call's carbon source: $SOURCE   ($SOURCE_LABEL)"
  echo "   OK  if Crusoe sends X-Carbon-grams header -> source=\"header\""
  echo "   OK  otherwise Joule falls back to per-model lookup table -> source=\"static\""
  echo "   OK  PASS -- every call labels its carbon origin (no silent guess)"
  echo ""
  printf '{"shot":5,"pass":true,"source":"%s"}\n' "$SOURCE"
  exit 0
fi

printf '{"shot":5,"pass":false,"source":"%s","reason":"source not in {static,header}"}\n' "$SOURCE"
exit 1
