# 🚀 Quick Fix Guide - Notification & Telegram Issues

## ⚡ TL;DR - Run These Commands

```bash
# 1. Fix database connection (update .env first!)
# 2. Push schema to database
npx prisma db push

# 3. Regenerate Prisma client
npx prisma generate

# 4. Restart dev server
npm run dev
```

## 📋 Step-by-Step Instructions

### Step 1: Fix Database Connection ⚠️ CRITICAL

Your `.env` file has an incorrect `DATABASE_URL`.

**Get the correct connection string from Supabase:**

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** → **Database**
4. Scroll to **Connection string**
5. Select **URI** tab
6. Copy the connection string
7. Replace `[YOUR-PASSWORD]` with your actual database password

**Update your `.env` file:**

```env
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
```

### Step 2: Push Database Schema

```bash
npx prisma db push
```

**Expected output:**

```
✔ Generated Prisma Client
🚀 Your database is now in sync with your Prisma schema
```

### Step 3: Regenerate Prisma Client

```bash
npx prisma generate
```

**Expected output:**

```
✔ Generated Prisma Client
```

### Step 4: Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## 🧪 Test Everything Works

### Test 1: Notification System

```bash
npx tsx scripts/test-notification.ts
```

**Expected output:**

```
✅ Found user: { id: '...', username: '...', hasTelegramId: true }
✅ Notification table exists! Current count: 0
✅ Notification created successfully!
✅ Found 1 notifications:
   1. Test Notification (unread)
✅ Unread count: 1
🎉 Notification system is working correctly!
```

### Test 2: Telegram Bot

```bash
npx tsx scripts/test-telegram.ts
```

**Expected output:**

```
✅ Bot token exists
✅ Bot token is valid!
   Bot username: YourBotName
✅ Users with Telegram: 5/10
🎉 Telegram bot configuration is correct!
```

### Test 3: Cron Job

```bash
# Make sure dev server is running first!
npm run dev

# In another terminal:
npx tsx scripts/test-cron.ts
```

**Expected output:**

```
✅ CRON_SECRET exists
✅ Cron job executed successfully!
   Response: { success: true, processedCount: 0, autoCompletedCount: 0 }
```

## 🔍 Verify in Browser

### 1. Check Notification Bell

1. Open http://localhost:3000/dashboard
2. Look for 🔔 icon in top navigation
3. Should see red badge with unread count
4. Click bell to see notifications

### 2. Check Browser Console

1. Open DevTools (F12)
2. Go to Console tab
3. Should NOT see errors about `/api/notifications`

### 3. Check Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "notifications"
4. Should see successful requests (200 OK)

## 🐛 Troubleshooting

### Issue: "Property 'notification' does not exist"

**Fix:**

```bash
npx prisma db push
npx prisma generate
# Restart dev server
```

### Issue: "FATAL: (ENOTFOUND) tenant/user postgres.[project] not found"

**Fix:** Update `DATABASE_URL` in `.env` with correct Supabase connection string

### Issue: Telegram messages not sending

**Check:**

1. Bot token is set: `TELEGRAM_BOT_1_TOKEN` in `.env`
2. Users have `telegramId` in database
3. Bot is not blocked by user
4. Check server logs for "Telegram notification check:" messages

### Issue: Notification badge not showing

**Check:**

1. Notification table exists: `npx prisma studio`
2. Notifications are being created: Check database
3. API is working: Check Network tab in browser
4. Component is rendered: Check Elements tab in browser

## 📊 What Each Test Checks

| Test                   | What It Checks                                           | What It Fixes                 |
| ---------------------- | -------------------------------------------------------- | ----------------------------- |
| `test-notification.ts` | Notification table exists, can create/read notifications | Database schema issues        |
| `test-telegram.ts`     | Bot token valid, users have telegramId                   | Telegram configuration issues |
| `test-cron.ts`         | Cron endpoint accessible, processes orders               | Cron job issues               |

## 🎯 Expected Behavior After Fix

### When Order Status Changes to ON_PICKUP:

1. **Website Notification:**
   - ✅ Notification created in database
   - ✅ Bell icon shows red badge
   - ✅ Click bell to see notification
   - ✅ Click notification to go to order

2. **Telegram Notification:**
   - ✅ User receives Telegram message
   - ✅ Message includes product name
   - ✅ Message includes location link
   - ✅ Message includes video link (if available)

## 📁 Files Created

- `scripts/test-notification.ts` - Test notification system
- `scripts/test-telegram.ts` - Test Telegram bot
- `scripts/test-cron.ts` - Test cron job endpoint
- `URGENT_FIX.md` - Detailed fix guide
- `FIX_NOTIFICATIONS.md` - Comprehensive troubleshooting
- `AUTOMATED_ORDER_FLOW.md` - System documentation

## 🆘 Still Not Working?

1. **Check server logs:**

   ```bash
   npm run dev
   # Watch for errors
   ```

2. **Check browser console:**
   - F12 → Console tab
   - Look for errors

3. **Check database:**

   ```bash
   npx prisma studio
   # Check if Notification table exists
   ```

4. **Run all tests:**
   ```bash
   npx tsx scripts/test-notification.ts
   npx tsx scripts/test-telegram.ts
   npx tsx scripts/test-cron.ts
   ```

## ✅ Success Checklist

- [ ] Database connection fixed
- [ ] `npx prisma db push` completed
- [ ] `npx prisma generate` completed
- [ ] Dev server restarted
- [ ] `test-notification.ts` passes
- [ ] `test-telegram.ts` passes
- [ ] `test-cron.ts` passes
- [ ] Notification bell shows in browser
- [ ] No errors in browser console
- [ ] No errors in server logs

---

**After completing these steps, both notification badge and Telegram messages will work!** 🎉
