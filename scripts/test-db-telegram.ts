import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
// Removed node-fetch
const prisma = new PrismaClient();

async function main() {
  const username = 'aryanyadav';
  console.log('Checking user:', username);
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.log('User not found!');
    return;
  }
  
  console.log('Found user:', user.username);
  console.log('Telegram ID:', user.telegramId);

  if (!user.telegramId) {
    console.log('No telegramId found in DB for this user!');
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
  console.log('Bot token present?', !!botToken);

  if (botToken) {
    console.log('Attempting to send test message...');
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.telegramId,
        text: 'This is a test message to verify Telegram is working.',
      }),
    });
    
    if (res.ok) {
      console.log('Test message sent successfully!');
    } else {
      console.log('Failed to send test message:', res.status, await res.text());
    }
  }
}

main().finally(() => prisma.$disconnect());
