require('dotenv').config();
const https = require('https');

const bot1Token = process.env.TELEGRAM_BOT_1_TOKEN;
const bot2Token = process.env.TELEGRAM_BOT_2_TOKEN;
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!baseUrl) {
  console.error("❌ NEXT_PUBLIC_SITE_URL is not set in .env!");
  process.exit(1);
}

const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

if (!webhookSecret) {
  console.error("❌ TELEGRAM_WEBHOOK_SECRET is not set in .env!");
  console.error("   The webhook route rejects unsigned updates, so the bot would go silent.");
  console.error("   Generate one with: openssl rand -hex 32");
  process.exit(1);
}

function setWebhook(token, botId) {
  if (!token || token.startsWith("PLACEHOLDER")) return;

  const webhookUrl = `${baseUrl}/api/telegram/webhook?bot=${botId}`;
  // Telegram echoes this back in X-Telegram-Bot-Api-Secret-Token on every
  // update, which is what proves the request really came from Telegram.
  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`
    + `?url=${encodeURIComponent(webhookUrl)}`
    + `&secret_token=${encodeURIComponent(webhookSecret)}`;

  https.get(apiUrl, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`🤖 Bot #${botId} Webhook Set:`, JSON.parse(data));
    });
  }).on('error', err => console.error(err));
}

console.log("Setting webhooks for URL:", baseUrl);
setWebhook(bot1Token, '1');
setWebhook(bot2Token, '2');
