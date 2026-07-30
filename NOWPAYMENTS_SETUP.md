# NOWPayments Integration Setup Guide

This guide will help you set up NOWPayments as your crypto payment gateway, replacing Cryptomus.

## Why NOWPayments?

- **Lower fees**: 0.5% - 1% (vs Cryptomus 2%)
- **300+ cryptocurrencies supported**
- **Better API documentation**
- **More reliable webhooks**
- **Auto-conversion options**

## Setup Steps

### 1. Create NOWPayments Account

1. Go to [https://nowpayments.io](https://nowpayments.io)
2. Sign up for a business account
3. Complete KYC verification (required for API access)

### 2. Get API Credentials

1. Log in to your NOWPayments dashboard
2. Go to **Settings** → **API Keys**
3. Click **Generate API Key**
4. Copy your API key

### 3. Set Up IPN (Instant Payment Notification)

1. In NOWPayments dashboard, go to **Settings** → **IPN Settings**
2. Set your IPN callback URL:
   ```
   https://yourdomain.com/api/webhooks/nowpayments
   ```
3. Generate an **IPN Secret Key**
4. Copy the IPN secret

### 4. Configure Environment Variables

Add these to your `.env` file:

```env
# NOWPayments Configuration
NOWPAYMENTS_API_KEY=your_api_key_here
NOWPAYMENTS_IPN_SECRET=your_ipn_secret_here

# Your app URL (for webhooks)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 5. Remove Old Cryptomus Variables (Optional)

You can remove or comment out these old variables:

```env
# OLD - No longer needed
# CRYPTOMUS_MERCHANT_ID=...
# CRYPTOMUS_API_KEY=...
```

## Supported Cryptocurrencies

NOWPayments supports 300+ cryptocurrencies. Here are the most popular ones configured in the system:

| Internal Code | NOWPayments Code | Name       | Network |
| ------------- | ---------------- | ---------- | ------- |
| BTC           | btc              | Bitcoin    | Bitcoin |
| ETH           | eth              | Ethereum   | ERC20   |
| USDT_ERC20    | usdterc20        | Tether USD | ERC20   |
| USDT_TRC20    | usdttrc20        | Tether USD | TRC20   |
| SOL           | sol              | Solana     | Solana  |
| TRX           | trx              | Tron       | TRC20   |

## Testing

### Test Mode

NOWPayments doesn't have a traditional test mode, but you can:

1. Use small amounts for testing
2. Use their [sandbox environment](https://sandbox.nowpayments.io) (separate account)

### Test Webhook Locally

Use a tool like [ngrok](https://ngrok.com) to test webhooks locally:

```bash
ngrok http 3000
```

Then set the ngrok URL as your IPN callback URL in NOWPayments dashboard.

## Webhook Events

The system handles these NOWPayments payment statuses:

- `waiting` - Payment created, waiting for payment
- `confirming` - Payment received, waiting for confirmations
- `confirmed` - Payment confirmed (✅ triggers order processing)
- `sending` - Payment being sent to your wallet
- `partially_paid` - Partial payment received
- `finished` - Payment completed (✅ triggers order processing)
- `failed` - Payment failed (❌ cancels order)
- `refunded` - Payment refunded (❌ cancels order)
- `expired` - Payment expired (❌ cancels order)

## Migration from Cryptomus

The system has been updated to use NOWPayments instead of Cryptomus:

### Files Changed:

- ✅ `src/lib/nowpayments.ts` - New NOWPayments library
- ✅ `src/app/api/webhooks/nowpayments/route.ts` - New webhook handler
- ✅ `src/app/api/orders/crypto-checkout/route.ts` - Updated to use NOWPayments
- ✅ `src/app/api/wallet/deposit/route.ts` - Updated to use NOWPayments

### Old Files (Can be removed):

- `src/app/api/webhooks/cryptomus/route.ts` - Old Cryptomus webhook

## Troubleshooting

### Webhook not receiving events

1. Check that your IPN callback URL is correct in NOWPayments dashboard
2. Verify your server is accessible from the internet
3. Check server logs for webhook errors
4. Verify IPN secret matches in both NOWPayments and your `.env`

### Payment not processing

1. Check that `NOWPAYMENTS_API_KEY` is set correctly
2. Verify the payment status in NOWPayments dashboard
3. Check webhook logs for errors
4. Ensure database transactions are completing

### Invalid signature errors

1. Verify `NOWPAYMENTS_IPN_SECRET` matches your NOWPayments dashboard
2. Check that the webhook is receiving the `x-nowpayments-sig` header
3. Ensure the payload is being parsed correctly

## Support

- NOWPayments Documentation: https://documenter.getpostman.com/view/7907941/S1a32n38
- NOWPayments Support: support@nowpayments.io
- API Status: https://status.nowpayments.io

## Fee Comparison

| Provider     | Fee       | Minimum |
| ------------ | --------- | ------- |
| NOWPayments  | 0.5% - 1% | $1      |
| Cryptomus    | 2%        | $1      |
| CoinPayments | 0.5% - 1% | Varies  |

## Security Notes

1. **Never commit** your API keys to version control
2. Use environment variables for all sensitive data
3. Always verify webhook signatures
4. Use HTTPS for all webhook endpoints
5. Regularly rotate your API keys

## Next Steps

1. Set up your NOWPayments account
2. Configure environment variables
3. Test with a small payment
4. Monitor webhook logs
5. Remove old Cryptomus code (optional)

---

**Need help?** Check the [NOWPayments API documentation](https://documenter.getpostman.com/view/7907941/S1a32n38) or contact their support.
