# Crypto Payments (NOWPayments) — Setup & Deployment

Customers can pay for products with cryptocurrency from **both** the website
(cart checkout and the dashboard quick-buy) and the **Telegram bot**. Both
surfaces create a hosted NOWPayments invoice and are confirmed by the same IPN
webhook, so an order behaves identically wherever it came from.

---

## 1. Environment variables to add on the VPS

Add these to the `.env` file on the server (or to your systemd/PM2/Docker env),
then rebuild and restart.

```env
NOWPAYMENTS_API_KEY=V0J5Q1B-FGM4J2Z-NZ4H9D5-M9DQMFN
NOWPAYMENTS_IPN_SECRET=stuvDeRvgpd24WsX5NsfjJCQNcLbgU+Y
NOWPAYMENTS_SANDBOX=false

# MUST be the real public https origin — no trailing slash.
APP_URL=https://camel971.com
NEXT_PUBLIC_APP_URL=https://camel971.com
NEXT_PUBLIC_SITE_URL=https://camel971.com

# Required for the payment-expiry cron below.
CRON_SECRET=<generate with: openssl rand -base64 32>
```

### Why the URL matters

`APP_URL` builds the IPN callback address that NOWPayments calls to confirm
payments. If it is missing or wrong, **customers pay and the order is never
confirmed**. The code now refuses to create an invoice at all when no public URL
is configured, rather than taking money it cannot confirm.

Set `APP_URL` (no `NEXT_PUBLIC_` prefix) — it is read from the environment at
runtime, so a restart is enough. `NEXT_PUBLIC_*` values are inlined into the
bundle at `next build` and then frozen; editing them on the server without
rebuilding has no effect. Set all three anyway and rebuild:

```bash
npm run build && pm2 restart all
```

> The public key `32ea1f95-9907-449e-8227-1c692132033c` is only used by
> NOWPayments' client-side widget. This integration uses the server-side invoice
> API, so it is not needed anywhere in the app.

---

## 2. Database migration

The integration adds payment-tracking columns. Run against production:

```bash
npx prisma migrate deploy
```

This applies `20260803000000_add_nowpayments_tracking`, which adds
`providerPaymentId` (unique — this is what makes a replayed webhook unable to
credit twice), `providerInvoiceId`, `paymentUrl`, `paymentStatus`, `paidAmount`,
`paidCurrency` and `paymentExpiresAt` to `Order` and `DepositRequest`. Every
statement is `IF NOT EXISTS`, so it is safe to re-run.

---

## 3. NOWPayments dashboard configuration

1. **Settings → Payments → Instant Payment Notifications**
   Set the IPN callback URL to:
   ```
   https://your-real-domain.com/api/webhooks/nowpayments
   ```
2. Confirm the IPN secret shown there matches `NOWPAYMENTS_IPN_SECRET` exactly.
3. Set a payout wallet so settled funds have somewhere to go.

### ⚠️ IP whitelist — check this

While verifying the key against the live API, this came back:

```
403 ENDPOINT_NOT_ALLOWED — "Access denied | Invalid IP"
```

That means **IP whitelisting is enabled on your NOWPayments account**. Invoice
creation itself was verified working, but if the whitelist is ever tightened the
server will stop being able to create invoices. Go to **Settings → Security → IP
whitelist** and make sure your **VPS public IP** is listed. Find it with:

```bash
curl -s https://api.ipify.org
```

---

## 4. The payment-expiry cron (runs automatically)

Crypto checkout reserves stock the moment the invoice is created, so two people
can't be sent to pay for the same last unit. NOWPayments only sends a webhook
once a payment actually exists — a customer who opens the invoice and closes the
tab produces **no callback at all**. Without this job those units stay reserved
forever and the product looks permanently sold out.

This runs **inside the app process** every 5 minutes via `src/instrumentation.ts`,
alongside the existing cooldown cron. **No crontab entry is needed** — but it
only runs when `CRON_SECRET` is set, because the endpoint refuses unauthenticated
calls.

Before cancelling anything, the job re-checks each order against the NOWPayments
API, so a payment that settled during a dropped webhook is never thrown away.

If you'd rather drive it externally instead, the endpoint is:

```bash
*/5 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://camel971.com/api/cron/expire-payments > /dev/null
```

> **Security note:** with `CRON_SECRET` unset, `/api/cron/process-cooldowns`
> compares against an empty string, so anyone sending `Authorization: Bearer `
> could trigger it. Setting `CRON_SECRET` closes that hole.

---

## 5. How the flow works

**Website (cart or dashboard) / Telegram bot**

1. Customer picks products and chooses "Pay with Crypto".
2. Stock is reserved and a `PENDING_PAYMENT` order is created.
3. A NOWPayments invoice is created; the customer is redirected (web) or given
   an "Open Payment Page" button (Telegram).
4. Customer pays with **any** supported coin — by default no coin is pinned, so
   the hosted page shows the full picker. They can still pre-select one.
5. NOWPayments calls `/api/webhooks/nowpayments`.
6. The webhook verifies the signature, **re-fetches the payment from the
   NOWPayments API**, checks the amount covers the order, then flips the order
   to `COOLDOWN_ACTIVE` so the existing delivery cron picks it up.
7. The customer gets an in-app notification and a Telegram message.

**Payment statuses**

| Status | Effect |
| --- | --- |
| `waiting`, `confirming`, `sending` | Recorded; stock stays reserved |
| `confirmed`, `finished` | ✅ Order fulfilled, cooldown starts |
| `partially_paid` | Held for manual review; stock stays reserved, expiry disabled |
| `failed`, `refunded`, `expired` | ❌ Order cancelled, stock and coupon released |

---

## 6. Testing after deploy

1. `curl https://your-real-domain.com/api/health` — server is up.
2. Place a small real order (e.g. $10) via the website cart.
3. Confirm you land on `nowpayments.io/payment/?iid=...`.
4. Pay it, then check server logs for:
   ```
   NOWPayments webhook: finished for <order-id>
   Processed NOWPayments order <order-id>
   ```
5. Confirm the order moved to `COOLDOWN_ACTIVE` and the customer was notified.
6. Repeat from the Telegram bot: **Browse Shop → product → ₿ Pay with Crypto**.
7. Create an order and *don't* pay it; after an hour the expiry cron should
   cancel it and restore the stock.

If webhooks never arrive, check the IPN URL in the dashboard, that the domain is
publicly reachable over HTTPS, and that `NEXT_PUBLIC_APP_URL` was set **before**
the last build.

---

## 7. Security notes

- The IPN signature is verified with HMAC-SHA512 over the key-sorted body, using
  a constant-time comparison.
- Every confirmation is independently re-verified against the NOWPayments API,
  so a forged or replayed callback cannot release goods.
- Underpayments beyond a $0.50 tolerance are never fulfilled — they are flagged
  and held for manual review rather than auto-cancelled, so an underpayment
  can't be used to free up another buyer's reserved stock.
- `providerPaymentId` is unique per order, so a duplicate webhook cannot credit
  a wallet or release an order twice.
- The credentials in this file are live. Rotate them if this repo is ever shared,
  and never commit the real `.env`.
