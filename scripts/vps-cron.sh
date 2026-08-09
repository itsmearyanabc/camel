#!/usr/bin/env bash
#
# Scheduled jobs for a self-hosted (VPS) deployment.
#
# Two things depend on this running. Without it:
#   * process-cooldowns  — pickup location + video are only released while a
#     customer happens to have the dashboard open (it polls /api/orders/status).
#     Anyone who orders and closes the tab is never notified, on the site or on
#     Telegram.
#   * expire-payments    — crypto orders whose payment window lapsed are never
#     cancelled, so the stock they reserved is held forever and can never be
#     sold again.
#
# Install (run as the same user that owns the app):
#
#   chmod +x scripts/vps-cron.sh
#   crontab -e
#
# then add these two lines, using an ABSOLUTE path to this script:
#
#   */2 * * * * /var/www/camel971/scripts/vps-cron.sh cooldowns >> /var/log/camel971-cron.log 2>&1
#   */10 * * * * /var/www/camel971/scripts/vps-cron.sh payments  >> /var/log/camel971-cron.log 2>&1
#
# Verify it is working:
#   tail -f /var/log/camel971-cron.log
# A healthy run prints: {"success":true,"processedCount":0,...}

set -euo pipefail

# Directory this script lives in, so .env is found regardless of cwd.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$APP_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$APP_DIR/.env"; set +a
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date -Is) ERROR: CRON_SECRET is not set in $APP_DIR/.env — the endpoints will reject this call."
  exit 1
fi

# Call the app on localhost: it avoids a round trip through the public
# hostname, and keeps working if DNS or the reverse proxy is briefly down.
BASE_URL="${CRON_BASE_URL:-http://127.0.0.1:3000}"

case "${1:-}" in
  cooldowns) ENDPOINT="/api/cron/process-cooldowns" ;;
  payments)  ENDPOINT="/api/cron/expire-payments" ;;
  *)
    echo "usage: $0 {cooldowns|payments}"
    exit 2
    ;;
esac

echo -n "$(date -Is) ${1} -> "
curl -fsS --max-time 120 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${BASE_URL}${ENDPOINT}"
echo
