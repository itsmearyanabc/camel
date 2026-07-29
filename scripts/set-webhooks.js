require('dotenv').config();
const https = require('https');

const bot1Token = process.env.TELEGRAM_BOT_1_TOKEN;
const bot2Token = process.env.TELEGRAM_BOT_2_TOKEN;
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!baseUrl) {
  console.error("❌ NEXT_PUBLIC_SITE_URL is not set in .env!");
  process.exit(1);
}

function setWebhook(token, botId) {
  if (!token || token.startsWith("PLACEHOLDER")) return;
  
  const webhookUrl = `${baseUrl}/api/telegram/webhook?bot=${botId}`;
  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

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
