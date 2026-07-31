async function testTelegram() {
  console.log("🔍 Testing Telegram bot configuration...\n");

  const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");

  // Check if token exists
  if (!botToken) {
    console.log("❌ TELEGRAM_BOT_1_TOKEN is not set in .env file");
    console.log("\n🔧 Fix: Add this to your .env file:");
    console.log('   TELEGRAM_BOT_1_TOKEN="your-bot-token-here"');
    console.log("\n📝 To get a bot token:");
    console.log("   1. Open Telegram");
    console.log("   2. Search for @BotFather");
    console.log("   3. Send /newbot or use existing bot");
    console.log("   4. Copy the token");
    return;
  }

  console.log("✅ Bot token exists");
  console.log("   Length:", botToken.length, "characters");
  console.log("   Starts with:", botToken.substring(0, 10) + "...");

  // Test bot token validity
  console.log("\n🔍 Testing bot token validity...");
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();

    if (data.ok) {
      console.log("✅ Bot token is valid!");
      console.log("   Bot username:", data.result.username);
      console.log("   Bot name:", data.result.first_name);
      console.log("   Bot ID:", data.result.id);
    } else {
      console.log("❌ Bot token is INVALID!");
      console.log("   Error:", data.description);
      console.log("\n🔧 Fix: Get a new token from @BotFather");
      return;
    }
  } catch (error: any) {
    console.log("❌ Failed to connect to Telegram API");
    console.log("   Error:", error.message);
    return;
  }

  // Check if users have telegramId
  console.log("\n🔍 Checking if users have telegramId...");
  try {
    const { prisma } = await import("../src/lib/db");
    
    const usersWithTelegram = await prisma.user.count({
      where: {
        telegramId: { not: null },
      },
    });

    const totalUsers = await prisma.user.count();

    console.log(`✅ Users with Telegram: ${usersWithTelegram}/${totalUsers}`);

    if (usersWithTelegram === 0) {
      console.log("\n⚠️  No users have telegramId set!");
      console.log("\n📝 Users need to:");
      console.log("   1. Start your Telegram bot");
      console.log("   2. Link their account (usually via /start command)");
      console.log("   3. This will save their telegramId in the database");
    } else {
      // Show sample users
      const sampleUsers = await prisma.user.findMany({
        where: {
          telegramId: { not: null },
        },
        select: {
          username: true,
          telegramId: true,
        },
        take: 3,
      });

      console.log("\n📋 Sample users with Telegram:");
      sampleUsers.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.username} (ID: ${user.telegramId})`);
      });
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.log("❌ Failed to check database");
    console.log("   Error:", error.message);
  }

  console.log("\n🎉 Telegram bot configuration is correct!");
  console.log("\n📝 Next steps:");
  console.log("   1. Make sure users have telegramId in database");
  console.log("   2. Test sending a message manually");
  console.log("   3. Check server logs when cron job runs");
}

testTelegram().catch(console.error);
