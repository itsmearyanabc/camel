import { prisma } from "../src/lib/db";

async function test() {
  try {
    console.log("🔍 Testing notification system...\n");

    // Get first user
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        username: true,
        telegramId: true,
      },
    });

    if (!user) {
      console.log("❌ No users found in database");
      return;
    }

    console.log("✅ Found user:", {
      id: user.id,
      username: user.username,
      hasTelegramId: !!user.telegramId,
    });

    // Check if Notification table exists
    console.log("\n🔍 Checking if Notification table exists...");
    try {
      const count = await prisma.notification.count();
      console.log(`✅ Notification table exists! Current count: ${count}`);
    } catch (error: any) {
      console.log("❌ Notification table does NOT exist!");
      console.log("Error:", error.message);
      console.log("\n🔧 Fix: Run these commands:");
      console.log("   npx prisma db push");
      console.log("   npx prisma generate");
      return;
    }

    // Create test notification
    console.log("\n🔍 Creating test notification...");
    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: "ORDER_READY",
        title: "Test Notification",
        message: "This is a test notification to verify the system works!",
        link: "/dashboard",
      },
    });

    console.log("✅ Notification created successfully!");
    console.log("   ID:", notification.id);
    console.log("   Title:", notification.title);
    console.log("   Read:", notification.read);

    // Fetch all notifications for user
    console.log("\n🔍 Fetching all notifications for user...");
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    console.log(`✅ Found ${notifications.length} notifications:`);
    notifications.forEach((n, i) => {
      console.log(`   ${i + 1}. ${n.title} (${n.read ? "read" : "unread"})`);
    });

    // Count unread
    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        read: false,
      },
    });

    console.log(`\n✅ Unread count: ${unreadCount}`);
    console.log("\n🎉 Notification system is working correctly!");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error("\nFull error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
