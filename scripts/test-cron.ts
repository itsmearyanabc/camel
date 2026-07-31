async function testCron() {
  console.log("🔍 Testing cron job endpoint...\n");

  const CRON_SECRET = process.env.CRON_SECRET;

  if (!CRON_SECRET) {
    console.log("❌ CRON_SECRET is not set in .env file");
    console.log("\n🔧 Fix: Add this to your .env file:");
    console.log('   CRON_SECRET="your-secret-key-here"');
    console.log("\n📝 Generate a secret:");
    console.log('   Run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    return;
  }

  console.log("✅ CRON_SECRET exists");
  console.log("   Length:", CRON_SECRET.length, "characters");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/cron/process-cooldowns`;

  console.log("\n🔍 Calling cron endpoint...");
  console.log("   URL:", url);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Cron job executed successfully!");
      console.log("   Response:", data);
      
      if (data.processedCount > 0) {
        console.log(`\n📦 Processed ${data.processedCount} items`);
        console.log("   Check server logs for Telegram notification details");
      } else {
        console.log("\n📭 No items to process");
        console.log("   This is normal if no orders are ready for pickup");
      }

      if (data.autoCompletedCount > 0) {
        console.log(`\n✅ Auto-completed ${data.autoCompletedCount} items`);
      }
    } else {
      console.log("❌ Cron job failed!");
      console.log("   Status:", response.status);
      console.log("   Error:", data);
    }
  } catch (error: any) {
    console.log("❌ Failed to call cron endpoint");
    console.log("   Error:", error.message);
    console.log("\n🔧 Make sure:");
    console.log("   1. Dev server is running (npm run dev)");
    console.log("   2. NEXT_PUBLIC_APP_URL is set correctly");
    console.log("   3. Database is accessible");
  }
}

testCron().catch(console.error);
