#!/usr/bin/env bash
#
# Read-only health check for a deployed Camel971 VPS.
#
#   bash scripts/healthcheck.sh
#
# Checks the app, the database, both Telegram bots, the scheduled jobs and the
# environment it all depends on. Safe to run any time, as often as you like:
# nothing here writes to the database or changes configuration.
#
# It deliberately never prints a secret - only whether one is present.
#
# NOTE ON TELEGRAM: this uses getMe and getWebhookInfo, which are read-only.
# It must never call getUpdates - that would steal the long-poll from the
# running bot and knock it offline for a moment.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
WARN=0

ok()   { printf '  \033[32m✅ %s\033[0m\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31m❌ %s\033[0m\n' "$1"; FAIL=$((FAIL + 1)); }
warn() { printf '  \033[33m⚠️  %s\033[0m\n' "$1"; WARN=$((WARN + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
else
  echo "❌ No .env found at $APP_DIR/.env - cannot check anything."
  exit 1
fi

BASE_URL="${CRON_BASE_URL:-http://127.0.0.1:${PORT:-3000}}"

# Trim surrounding whitespace and quotes. Done with parameter expansion rather
# than `xargs`, which treats a backslash as an escape and would silently mangle
# a database password that contains one.
strip() {
  local v="${1:-}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  v="${v#\"}"; v="${v%\"}"
  v="${v#\'}"; v="${v%\'}"
  printf '%s' "$v"
}

# Report whether a variable is set, without ever echoing its value.
need_env() {
  local name="$1" label="${2:-$1}" value
  value="$(strip "${!name:-}")"
  if [ -n "$value" ]; then ok "$label is set"; else bad "$label is MISSING"; fi
}

opt_env() {
  local name="$1" label="${2:-$1}" note="${3:-}" value
  value="$(strip "${!name:-}")"
  if [ -n "$value" ]; then ok "$label is set"; else warn "$label not set${note:+ — $note}"; fi
}

# ---------------------------------------------------------------- app process
section "1. Application process"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 jlist 2>/dev/null | tr ',' '\n' | grep -q '"status":"online"'; then
    ok "pm2 reports at least one process online"
  else
    bad "pm2 has no online process"
  fi
  pm2 list 2>/dev/null | grep -E "camel|name" | head -5
else
  warn "pm2 not on PATH - skipping process check"
fi

# ------------------------------------------------------------ app + database
section "2. App and database"
HEALTH="$(curl -fsS --max-time 15 "$BASE_URL/api/health" 2>/dev/null)"
if [ -n "$HEALTH" ]; then
  case "$HEALTH" in
    *'"status":"healthy"'*) ok "app responding on $BASE_URL" ;;
    *) bad "app responded but is unhealthy: $HEALTH" ;;
  esac
  case "$HEALTH" in
    *'"database":"connected"'*) ok "database reachable (Supabase)" ;;
    *) bad "database NOT reachable — $HEALTH" ;;
  esac
else
  bad "no response from $BASE_URL/api/health (is the app up? right PORT?)"
fi

# ------------------------------------------------------------ telegram bots
section "3. Telegram bots"

# getMe proves the token is valid; getWebhookInfo shows whether anything is
# fighting over the updates. Neither consumes an update.
check_bot() {
  local label="$1" token; token="$(strip "${2:-}")"

  if [ -z "$token" ] || [ "${token#PLACEHOLDER}" != "$token" ]; then
    warn "$label: no token configured"
    return
  fi

  local me; me="$(curl -fsS --max-time 15 "https://api.telegram.org/bot${token}/getMe" 2>/dev/null)"
  case "$me" in
    *'"ok":true'*)
      local username; username="$(printf '%s' "$me" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
      ok "$label: token valid (@${username:-unknown})"
      ;;
    *)
      bad "$label: token REJECTED by Telegram"
      return
      ;;
  esac

  local info; info="$(curl -fsS --max-time 15 "https://api.telegram.org/bot${token}/getWebhookInfo" 2>/dev/null)"
  local hook; hook="$(printf '%s' "$info" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"
  if [ -n "$hook" ]; then
    if [ "$(strip "${USE_WEBHOOK:-}")" = "true" ]; then
      ok "$label: webhook set ($hook)"
    else
      bad "$label: a webhook is set ($hook) but USE_WEBHOOK is not true — long-polling will receive nothing"
    fi
  else
    ok "$label: no webhook (correct for long-polling)"
  fi

  # A 409 here is the classic "two pollers on one token" symptom.
  case "$info" in
    *'last_error_message'*)
      local err; err="$(printf '%s' "$info" | sed -n 's/.*"last_error_message":"\([^"]*\)".*/\1/p')"
      case "$err" in
        *409*|*"terminated by other"*) bad "$label: poller conflict — $err" ;;
        *) warn "$label: last Telegram error — $err" ;;
      esac
      ;;
  esac
}

T1="$(strip "${TELEGRAM_BOT_1_TOKEN:-}")"
T2="$(strip "${TELEGRAM_BOT_2_TOKEN:-}")"
TS="$(strip "${TELEGRAM_SUPPORT_BOT_TOKEN:-}")"

check_bot "Bot #1 (Shop)"    "$T1"
[ -n "$T2" ] && check_bot "Bot #2 (Mirror)" "$T2"
check_bot "Bot #3 (Support)" "$TS"

if [ -n "$TS" ] && { [ "$TS" = "$T1" ] || [ "$TS" = "$T2" ]; }; then
  bad "Support bot shares a token with a shop bot — it will refuse to start"
else
  [ -n "$TS" ] && ok "Support bot token is distinct from the shop bots"
fi

opt_env TELEGRAM_SUPPORT_BOT_USERNAME "Support bot username" \
  "the 'Chat with Support' button will not render without it"

if command -v pm2 >/dev/null 2>&1; then
  for want in "Bot #1" "Bot #3"; do
    if pm2 logs camel --lines 200 --nostream 2>/dev/null | grep -q "$want.*running (long-polling)"; then
      ok "$want reported 'running' in recent logs"
    else
      warn "$want not seen in the last 200 log lines (may just have scrolled off)"
    fi
  done
fi

# --------------------------------------------------------------- scheduled jobs
section "4. Scheduled jobs"
CRON_SECRET_VALUE="$(strip "${CRON_SECRET:-}")"
if [ -z "$CRON_SECRET_VALUE" ]; then
  bad "CRON_SECRET is MISSING — every cron endpoint refuses to run"
  bad "  => order delivery, stock reclaim and media cleanup are ALL disabled"
else
  ok "CRON_SECRET is set"
  for job in process-cooldowns expire-payments cleanup-media; do
    body="$(curl -fsS --max-time 60 -H "Authorization: Bearer ${CRON_SECRET_VALUE}" \
      "$BASE_URL/api/cron/$job" 2>/dev/null)"
    case "$body" in
      *'"success":true'*) ok "cron /$job responds OK" ;;
      "")                 bad "cron /$job: no response / rejected" ;;
      *)                  bad "cron /$job returned: $body" ;;
    esac
  done
fi

if crontab -l 2>/dev/null | grep -q "vps-cron.sh"; then
  ok "system crontab has vps-cron.sh entries"
  crontab -l 2>/dev/null | grep "vps-cron.sh" | sed 's/^/     /'
else
  warn "no vps-cron.sh entries in crontab — relying on the in-process timers in src/instrumentation.ts"
fi

# --------------------------------------------------------------- environment
section "5. Required configuration"
need_env DATABASE_URL
need_env SESSION_SECRET
opt_env  PASSWORD_ENCRYPTION_KEY "PASSWORD_ENCRYPTION_KEY" "admin password recovery will not work"
opt_env  NOWPAYMENTS_API_KEY     "NOWPAYMENTS_API_KEY"     "crypto checkout falls back to manual payment"
opt_env  NOWPAYMENTS_IPN_SECRET  "NOWPAYMENTS_IPN_SECRET"  "payment webhooks will be rejected"

APP_URL_VALUE="$(strip "${APP_URL:-${NEXT_PUBLIC_APP_URL:-${NEXT_PUBLIC_SITE_URL:-}}}")"
if [ -n "$APP_URL_VALUE" ]; then
  case "$APP_URL_VALUE" in
    https://*) ok "public URL set ($APP_URL_VALUE)" ;;
    *) warn "public URL is not https ($APP_URL_VALUE) — NOWPayments callbacks need a public https origin" ;;
  esac
else
  bad "APP_URL / NEXT_PUBLIC_SITE_URL is MISSING — crypto invoices cannot be created"
fi

# --------------------------------------------------------------- disk + media
section "6. Disk and uploads"
UPLOADS="$APP_DIR/public/uploads"
if [ -d "$UPLOADS" ] && [ -w "$UPLOADS" ]; then
  ok "uploads directory writable ($(du -sh "$UPLOADS" 2>/dev/null | cut -f1) used)"
else
  bad "uploads directory missing or not writable: $UPLOADS"
fi

USE_PCT="$(df -P "$APP_DIR" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if ! printf '%s' "$USE_PCT" | grep -qE '^[0-9]+$'; then
  warn "could not read disk usage"
elif [ "$USE_PCT" -ge 90 ]; then
  bad "disk ${USE_PCT}% full — uploads and delivery media will start failing"
elif [ "$USE_PCT" -ge 75 ]; then
  warn "disk ${USE_PCT}% full"
else
  ok "disk ${USE_PCT}% used"
fi

# --------------------------------------------------------------------- summary
printf '\n\033[1m────────────────────────────────────────\033[0m\n'
printf ' \033[32m%s passed\033[0m   \033[33m%s warnings\033[0m   \033[31m%s failed\033[0m\n' "$PASS" "$WARN" "$FAIL"
printf '\033[1m────────────────────────────────────────\033[0m\n'
[ "$FAIL" -eq 0 ] || exit 1
