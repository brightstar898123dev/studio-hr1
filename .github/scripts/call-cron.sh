#!/usr/bin/env bash
# Calls one of the app's scheduled-job endpoints.
# Usage: call-cron.sh <job-name> [extra-query]
# Needs the repository secrets APP_URL (e.g. https://hr.company.com) and CRON_SECRET.
# Jobs that have more work than fits in one call answer "done": false, so we call again (up to 10 times).
set -euo pipefail

JOB="$1"
QUERY="${2:-}"

if [ -z "${APP_URL:-}" ] || [ -z "${CRON_SECRET:-}" ]; then
  echo "::error::Missing repository secrets. Add APP_URL and CRON_SECRET under Settings -> Secrets and variables -> Actions."
  exit 1
fi

URL="${APP_URL%/}/api/cron/${JOB}${QUERY}"
for attempt in $(seq 1 10); do
  echo "Call ${attempt}: POST /api/cron/${JOB}${QUERY}"
  HTTP=$(curl -sS -o response.json -w "%{http_code}" -X POST "$URL" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    --max-time 120 --retry 2 --retry-delay 10 --retry-all-errors || echo "000")
  cat response.json 2>/dev/null || true
  echo
  if [ "$HTTP" != "200" ]; then
    echo "::error::The app answered HTTP ${HTTP}. Check that APP_URL is right and that CRON_SECRET matches the value in Vercel."
    exit 1
  fi
  if grep -q '"done":true' response.json; then
    echo "Finished."
    exit 0
  fi
  echo "More work left; calling again."
done
echo "Stopped after 10 calls; the next scheduled run will continue."
