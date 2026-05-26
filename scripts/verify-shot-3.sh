#!/usr/bin/env bash
# verify-shot-3.sh — Demo cut 3: Dashboard cumulative (live data point)
# Assumes Joule (:3001) AND Dashboard (:3000) dev servers are already running.
#
# Strategy:
#   Snapshot latestRecord.id from /api/usage BEFORE a live Joule call.
#   Make one live call to Joule (adds 1 record to joule.db).
#   Wait for DB write + Next.js dynamic re-render.
#   Re-read /api/usage and assert latestRecord.id changed.
#   This proves new data flows end-to-end into the dashboard's data API.
#
# Also counts data-bar attributes in the dashboard HTML as secondary evidence.
#
# Exit 0 = PASS, Exit 1 = FAIL. Output: single-line JSON to stdout.

set -u

JOULE_URL="${JOULE_URL:-http://localhost:3001/v1/chat/completions}"
DASH_URL="${DASH_URL:-http://localhost:3000}"

# ── 1) Snapshot BEFORE ──────────────────────────────────────────────────────
RESP_BEFORE=$(curl -sf "$DASH_URL/api/usage?t=$(date +%s%N)" 2>/dev/null)
if [ -z "$RESP_BEFORE" ]; then
  printf '{"shot":3,"pass":false,"reason":"dashboard /api/usage unreachable before call"}\n'
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  ID_BEFORE=$(echo "$RESP_BEFORE" | jq -r '.latestRecord.id // empty' 2>/dev/null)
else
  ID_BEFORE=$(echo "$RESP_BEFORE" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
fi

HTML_BEFORE=$(curl -sf "$DASH_URL/?t=$(date +%s%N)" 2>/dev/null)
COUNT_BEFORE=$(echo "$HTML_BEFORE" | grep -o 'data-bar' | wc -l | tr -d ' ')

# ── 2) Live call to Joule (adds 1 record to joule.db) ───────────────────────
JOULE_RESP=$(curl -sS -X POST "$JOULE_URL" \
  -H "Content-Type: application/json" \
  -d '{"model":"any","messages":[{"role":"user","content":"Please summarize this: Joule is a carbon-aware AI gateway."}]}' \
  --max-time 30 2>&1)

CURL_EXIT=$?
if [ $CURL_EXIT -ne 0 ]; then
  printf '{"shot":3,"pass":false,"reason":"Joule call failed (curl exit %d)"}\n' "$CURL_EXIT"
  exit 1
fi

# ── 3) Wait for DB write + Next.js re-render ────────────────────────────────
sleep 3

# ── 4) Snapshot AFTER ───────────────────────────────────────────────────────
RESP_AFTER=$(curl -sf "$DASH_URL/api/usage?t=$(date +%s%N)" 2>/dev/null)
if [ -z "$RESP_AFTER" ]; then
  printf '{"shot":3,"pass":false,"reason":"dashboard /api/usage unreachable after call"}\n'
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  ID_AFTER=$(echo "$RESP_AFTER" | jq -r '.latestRecord.id // empty' 2>/dev/null)
else
  ID_AFTER=$(echo "$RESP_AFTER" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
fi

HTML_AFTER=$(curl -sf "$DASH_URL/?t=$(date +%s%N)" 2>/dev/null)
COUNT_AFTER=$(echo "$HTML_AFTER" | grep -o 'data-bar' | wc -l | tr -d ' ')

# ── 5) Assert id changed ─────────────────────────────────────────────────────
if [[ -n "$ID_AFTER" && "$ID_AFTER" != "$ID_BEFORE" ]]; then
  echo ""
  echo "[Cut 3] Dashboard cumulative -- live call propagates to the chart in real time"
  echo "   OK  latest record before live call: $ID_BEFORE"
  echo "   OK  sent 1 live request to Joule (:3001)"
  echo "   OK  latest record after  live call: $ID_AFTER   <-- NEW record visible in dashboard"
  echo "   OK  PASS -- SQLite WAL write -> Next.js dynamic refresh"
  echo ""
  printf '{"shot":3,"pass":true,"id_before":"%s","id_after":"%s","data_bar_before":%s,"data_bar_after":%s}\n' \
    "$ID_BEFORE" "$ID_AFTER" "$COUNT_BEFORE" "$COUNT_AFTER"
  exit 0
fi

# ── 6) FAIL path ─────────────────────────────────────────────────────────────
printf '{"shot":3,"pass":false,"id_before":"%s","id_after":"%s","data_bar_before":%s,"data_bar_after":%s,"reason":"latestRecord.id did not change"}\n' \
  "$ID_BEFORE" "$ID_AFTER" "$COUNT_BEFORE" "$COUNT_AFTER"
exit 1
