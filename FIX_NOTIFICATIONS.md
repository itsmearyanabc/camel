# 🔧 Fix for Notification Issues

## Issues Identified

1. **Telegram messages not sending** - Bot token or user telegramId issue
2. **Notification badge not showing** - Database table doesn't exist yet

## Root Causes

### Issue 1: Telegram Not Working

The Telegram notification code is correct, but it's failing silently because:

- `TELEGRAM_BOT_1_TOKEN` environment variable might not be set
- User might not have `telegramId` in database
- Bot might be blocked by user

### Issue 2: Notification Badge Not Showing

The Notification table exists in schema but **NOT in database** because:

- Database migration hasn't been run yet
- Database connection is failing (ENOTFOUND error)

## Solutions

### Step 1: Fix Database Connection

The error shows: `FATAL: (ENOTFOUND) tenant/user postgres.[project] not found`

This means your `DATABASE_URL` is incorrect. Check your `.env` file:

```env
# Should look like this:
DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
DIRECT_URL="postgresql://postgres:[password]@[host]:5432/postgres"
```

**For Supabase:**

```env
DATABASE_URL="postgresql://postgres.xxxxx:[password]@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.xxxxx:[password]@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
```

### Step 2: Run Database Migration

Once database connection is fixed:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (creates Notification table)
npx prisma db push

# OR use migrations
npx prisma migrate dev --name add_notifications
```

### Step 3: Verify Telegram Bot Token

Check your `.env` file:

```env
TELEGRAM_BOT_1_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
```

**To get a bot token:**

1. Open Telegram
2. Search for `@BotFather`
3. Send `/newbot` or use existing bot
4. Copy the token

### Step 4: Verify User Has Telegram ID

Check if users have `telegramId` in database:

```sql
-- Run in your database
SELECT id, username, telegramId FROM "User" WHERE telegramId IS NOT NULL;
```

If users don't have `telegramId`, they need to:

1. Start the Telegram bot
2. Link their account (usually via `/start` command)

### Step 5: Test the System

#### Test 1: Check if Notification Table Exists

```bash
npx prisma studio
# Open browser and check if "Notification" table exists
```

#### Test 2: Manually Create a Notification

```typescript
// Create a test script: scripts/test-notification.ts
import { prisma } from "@/lib/db";

async function testNotification() {
  const notification = await prisma.notification.create({
    data: {
      userId: "YOUR_USER_ID", // Replace with actual user ID
      type: "ORDER_READY",
      title: "Test Notification",
      message: "This is a test notification",
      link: "/dashboard/orders",
    },
  });
  console.log("Created notification:", notification);
}

testNotification();
```

Run it:

```bash
npx tsx scripts/test-notification.ts
```

#### Test 3: Test Telegram Bot

```typescript
// Create a test script: scripts/test-telegram.ts
const botToken = process.env.TELEGRAM_BOT_1_TOKEN;
const chatId = "YOUR_TELEGRAM_ID"; // Replace with actual telegram ID

async function testTelegram() {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Test message from bot",
      }),
    },
  );
  const data = await response.json();
  console.log("Telegram response:", data);
}

testTelegram();
```

Run it:

```bash
npx tsx scripts/test-telegram.ts
```

### Step 6: Add Better Error Logging

Update the cron job to log why Telegram messages aren't sending:

```typescript
// In src/app/api/cron/process-cooldowns/route.ts
// Around line 103, add logging:

const user = item.order.user;
console.log("User telegram check:", {
  userId: user.id,
  username: user.username,
  hasTelegramId: !!user.telegramId,
  telegramId: user.telegramId,
  hasBotToken: !!botToken,
});

if (user.telegramId && botToken) {
  // ... existing code
} else {
  console.warn("Skipping Telegram notification:", {
    reason: !user.telegramId ? "No telegramId" : "No bot token",
    userId: user.id,
  });
}
```

### Step 7: Verify Notification Bell is Working

1. **Check if NotificationBell is rendered:**
   - Open browser DevTools
   - Go to Elements tab
   - Search for "🔔" in the HTML
   - Should find the notification bell button

2. **Check if API is working:**
   - Open browser DevTools
   - Go to Network tab
   - Look for `/api/notifications` requests
   - Check if they return 200 OK
   - Check response data

3. **Check database:**
   ```bash
   npx prisma studio
   # Open Notification table
   # Check if notifications exist
   ```

## Quick Fix Checklist

- [ ] Fix `DATABASE_URL` in `.env`
- [ ] Run `npx prisma db push`
- [ ] Verify `TELEGRAM_BOT_1_TOKEN` in `.env`
- [ ] Check users have `telegramId` in database
- [ ] Test notification creation manually
- [ ] Test Telegram bot manually
- [ ] Add error logging to cron job
- [ ] Verify NotificationBell component is rendered
- [ ] Check browser console for errors
- [ ] Check network tab for API calls

## Expected Behavior After Fix

### When Order Status Changes to ON_PICKUP:

1. **Website Notification:**
   - ✅ Notification created in database
   - ✅ Bell icon shows unread count badge
   - ✅ Click bell to see notification
   - ✅ Click notification to go to order

2. **Telegram Notification:**
   - ✅ User receives Telegram message
   - ✅ Message includes product name
   - ✅ Message includes location link
   - ✅ Message includes video link (if available)

## Still Not Working?

### Debug Steps:

1. **Check server logs:**

   ```bash
   npm run dev
   # Watch console for errors
   ```

2. **Check browser console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for errors

3. **Check network requests:**
   - Open DevTools (F12)
   - Go to Network tab
   - Filter by "notifications"
   - Check if requests are successful

4. **Check database:**

   ```bash
   npx prisma studio
   # Check if Notification table exists
   # Check if notifications are being created
   ```

5. **Test cron job manually:**
   ```bash
   curl -X GET http://localhost:3000/api/cron/process-cooldowns \
     -H "Authorization: Bearer your-cron-secret"
   ```

## Common Issues

### "Notification table doesn't exist"

**Solution:** Run `npx prisma db push`

### "Unauthorized" when calling /api/notifications

**Solution:** Make sure user is logged in

### Telegram message not sending

**Solution:**

- Check bot token is correct
- Check user has telegramId
- Check bot is not blocked
- Check server logs for errors

### Notification badge not showing

**Solution:**

- Check if notifications exist in database
- Check if API is returning data
- Check browser console for errors
- Verify NotificationBell component is rendered

## Need More Help?

1. Check server logs for errors
2. Check browser console for errors
3. Verify all environment variables are set
4. Test each component individually
5. Check database directly with Prisma Studio

---

**After following these steps, both Telegram and website notifications should work!** 🎉
