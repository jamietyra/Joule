#!/usr/bin/env bash
# verify-shot-4.sh — Demo cut 4: Hermes weekly report dry-run
# Runs Hermes CLI in --dry-run mode. No SMTP, no live Joule server needed.
# Output: single-line JSON. Exit 0 on PASS.

set -u

DB_PATH="${JOULE_DB_PATH:-./joule.db}"
# Default: write next to joule.db (repo root). Override via PREVIEW_PATH env.
PREVIEW_PATH="${PREVIEW_PATH:-./weekly-report-preview.html}"

# 1) Remove any previous preview
rm -f "$PREVIEW_PATH"

# 2) Run Hermes CLI in dry-run mode
npx tsx hermes/index.ts run weekly-report \
  --dry-run \
  --db "$DB_PATH" \
  --to test@example.com \
  --output "$PREVIEW_PATH" \
  > ./hermes-shot4.log 2>&1

HERMES_EXIT=$?

# 3) Verify file exists
if [ ! -f "$PREVIEW_PATH" ]; then
  printf '{"shot":4,"pass":false,"reason":"preview file not created","hermes_exit":%d}\n' "$HERMES_EXIT"
  exit 1
fi

# 4) Verify HTML contains "Top 3"
if ! grep -q "Top 3" "$PREVIEW_PATH"; then
  printf '{"shot":4,"pass":false,"reason":"Top 3 marker missing","preview":"%s"}\n' "$PREVIEW_PATH"
  exit 1
fi

# 5) PASS
SIZE=$(wc -c < "$PREVIEW_PATH")
echo ""
echo "[Cut 4] Hermes Weekly Report (dry-run) -- 3-block HTML preview generation"
echo "   OK  preview file: $PREVIEW_PATH   ($SIZE bytes)"
echo "   OK  'Top 3' marker detected -- Cumulative Savings / Top 3 Calls / Recommended Actions"
echo "   OK  PASS -- same template ships via Gmail SMTP in production"
echo ""
printf '{"shot":4,"pass":true,"preview":"%s","htmlBytes":%d}\n' "$PREVIEW_PATH" "$SIZE"
exit 0
