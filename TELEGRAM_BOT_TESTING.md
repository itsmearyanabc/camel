# 🤖 TELEGRAM BOT TESTING GUIDE

## ✅ AUTOMATED MESSAGE SYSTEM STATUS

### Current Implementation:

Your system **ALREADY** sends automated messages with video URL and location URL to:

1. ✅ **Website** - Via `prisma.notification.create()`
2. ✅ **Telegram** - Via Telegram Bot API

### How It Works:

```
Order Cooldown Expires
    ↓
Cron Job Runs (process-cooldowns)
    ↓
Fetches locationUrl & videoUrl from ProductAreaDetail
    ↓
Updates OrderItem with location & video
    ↓
Creates Website Notification ✅
    ↓
Sends Telegram Message ✅
```

---

## 🧪 TESTING CHECKLIST

### 1. Telegram Bot Basic Functions

#### 1.1 Bot Commands

- [ ] **/start command**
  - Test: Send `/start` to bot
  - Expected: Welcome message with menu
  - Status: ⬜

- [ ] **Main Menu Display**
  - Test: Check if main menu shows
  - Expected: 4 buttons (Shop, Wallet, Orders, Disputes)
  - Status: ⬜

- [ ] **Account Linking**
  - Test: Link Telegram to website account
  - Expected: Successfully linked
  - Status: ⬜

#### 1.2 Shop Features

- [ ] **Browse Categories**
  - Test: Click "Browse Shop"
  - Expected: Shows product categories
  - Status: ⬜

- [ ] **View Products**
  - Test: Select a category
  - Expected: Shows products with prices
  - Status: ⬜

- [ ] **Place Order**
  - Test: Click "Order" on a product
  - Expected: Order created, cooldown starts
  - Status: ⬜

#### 1.3 Wallet Features

- [ ] **View Wallet**
  - Test: Click "Wallet & Ledger"
  - Expected: Shows balance and recent transactions
  - Status: ⬜

- [ ] **Website Link**
  - Test: Check if "Visit Website" button works
  - Expected: Opens website in browser
  - Status: ⬜

#### 1.4 Order Tracking

- [ ] **View Orders**
  - Test: Click "Track Orders"
  - Expected: Shows order list
  - Status: ⬜

- [ ] **View Order Details**
  - Test: Click on an order
  - Expected: Shows order details with status
  - Status: ⬜

- [ ] **Location Link**
  - Test: Check if location link is present
  - Expected: "View on Map" link works
  - Status: ⬜

- [ ] **Video Link**
  - Test: Check if video link is present
  - Expected: "Watch Video" link works
  - Status: ⬜

#### 1.5 Disputes

- [ ] **View Disputes**
  - Test: Click "Disputes Log"
  - Expected: Shows dispute list
  - Status: ⬜

---

### 2. Automated Message Testing

#### 2.1 Order Ready Notification

- [ ] **Website Notification**
  - Test: Place order, wait for cooldown
  - Expected: Notification appears on website
  - Check: Dashboard → Notifications
  - Status: ⬜

- [ ] **Telegram Notification**
  - Test: Place order, wait for cooldown
  - Expected: Message received on Telegram
  - Check: Telegram chat with bot
  - Status: ⬜

- [ ] **Message Content**
  - Test: Check notification content
  - Expected: Contains:
    - ✅ Product name
    - ✅ Admin message
    - ✅ Location URL (if set)
    - ✅ Video URL (if set)
    - ✅ Status: "READY FOR PICKUP"
  - Status: ⬜

#### 2.2 Location URL Testing

- [ ] **Location URL Present**
  - Test: Check if location URL is in message
  - Expected: "🗺️ Location: View on Map" link
  - Status: ⬜

- [ ] **Location URL Works**
  - Test: Click location link
  - Expected: Opens map/location in browser
  - Status: ⬜

- [ ] **Location URL on Website**
  - Test: Check order details on website
  - Expected: Location link visible and clickable
  - Status: ⬜

#### 2.3 Video URL Testing

- [ ] **Video URL Present**
  - Test: Check if video URL is in message
  - Expected: "🎥 Video Guide: Watch Video" link
  - Status: ⬜

- [ ] **Video URL Works**
  - Test: Click video link
  - Expected: Opens video in browser
  - Status: ⬜

- [ ] **Video URL on Website**
  - Test: Check order details on website
  - Expected: Video link visible and clickable
  - Status: ⬜

#### 2.4 Auto-Complete Notification

- [ ] **Auto-Complete After 2 Days**
  - Test: Wait 2 days after order ready
  - Expected: Order auto-completes
  - Status: ⬜

- [ ] **Telegram Notification**
  - Test: Check Telegram for auto-complete message
  - Expected: "Order Auto-Completed" message
  - Status: ⬜

---

### 3. Cron Job Testing

#### 3.1 Manual Cron Trigger

```bash
# Test cron job manually
curl -X GET http://localhost:3000/api/cron/process-cooldowns \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

- [ ] **Cron Job Runs**
  - Test: Trigger cron manually
  - Expected: Returns success with processedCount
  - Status: ⬜

- [ ] **Processes Cooldowns**
  - Test: Check if cooldown orders are processed
  - Expected: Orders move from COOLDOWN_ACTIVE to ON_PICKUP
  - Status: ⬜

- [ ] **Sends Notifications**
  - Test: Check if notifications are created
  - Expected: Website notifications created
  - Status: ⬜

- [ ] **Sends Telegram Messages**
  - Test: Check if Telegram messages are sent
  - Expected: Messages received on Telegram
  - Status: ⬜

#### 3.2 Automated Cron (Production)

- [ ] **Cron Scheduled**
  - Test: Check if cron is scheduled (e.g., every minute)
  - Expected: Runs automatically
  - Status: ⬜

- [ ] **Cron Logs**
  - Test: Check server logs for cron execution
  - Expected: Logs show cron running
  - Status: ⬜

---

### 4. User Experience Testing

#### 4.1 Bot Responsiveness

- [ ] **Fast Response**
  - Test: Send command to bot
  - Expected: Responds within 2 seconds
  - Status: ⬜

- [ ] **Error Handling**
  - Test: Send invalid command
  - Expected: Friendly error message
  - Status: ⬜

- [ ] **Button Navigation**
  - Test: Click all buttons
  - Expected: All buttons work correctly
  - Status: ⬜

#### 4.2 Message Formatting

- [ ] **Markdown Rendering**
  - Test: Check message formatting
  - Expected: Bold, links, emojis render correctly
  - Status: ⬜

- [ ] **Link Previews**
  - Test: Check if links show previews
  - Expected: Location/video links show preview
  - Status: ⬜

#### 4.3 Mobile Experience

- [ ] **Mobile Telegram**
  - Test: Use bot on mobile Telegram app
  - Expected: All features work on mobile
  - Status: ⬜

- [ ] **Button Size**
  - Test: Check if buttons are easy to tap
  - Expected: Buttons are large enough
  - Status: ⬜

---

### 5. Integration Testing

#### 5.1 Website ↔ Telegram Sync

- [ ] **Order Placed on Website**
  - Test: Place order on website
  - Expected: Order appears in Telegram bot
  - Status: ⬜

- [ ] **Order Placed on Telegram**
  - Test: Place order on Telegram
  - Expected: Order appears on website
  - Status: ⬜

- [ ] **Notifications Sync**
  - Test: Check notifications on both platforms
  - Expected: Same notification on website and Telegram
  - Status: ⬜

#### 5.2 Account Linking

- [ ] **Link from Website**
  - Test: Link Telegram from website dashboard
  - Expected: Telegram linked successfully
  - Status: ⬜

- [ ] **Link from Telegram**
  - Test: Link account from Telegram bot
  - Expected: Account linked successfully
  - Status: ⬜

- [ ] **Unlink**
  - Test: Unlink Telegram account
  - Expected: Account unlinked, bot asks to link again
  - Status: ⬜

---

## 🔧 SETUP VERIFICATION

### Environment Variables

Check if these are set in `.env`:

```env
TELEGRAM_BOT_1_TOKEN="your-bot-token"
CRON_SECRET="your-cron-secret"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **TELEGRAM_BOT_1_TOKEN** is set
- [ ] **CRON_SECRET** is set
- [ ] **NEXT_PUBLIC_SITE_URL** is set

### Database Fields

Check if these fields exist in `OrderItem`:

- [ ] `locationLink` (String?)
- [ ] `pickupVideoUrl` (String?)
- [ ] `adminMessage` (String?)
- [ ] `automatedMessageSent` (Boolean)
- [ ] `adminMessageSentAt` (DateTime?)

### ProductAreaDetail Fields

Check if these fields exist:

- [ ] `locationUrl` (String?)
- [ ] `videoUrl` (String?)
- [ ] `message` (String?)

---

## 🚀 QUICK TEST SCRIPT

### Test Automated Message Flow:

```bash
# 1. Place an order (via website or Telegram)
# 2. Wait for cooldown to expire (30 seconds)
# 3. Trigger cron manually:
curl -X GET http://localhost:3000/api/cron/process-cooldowns \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# 4. Check:
# - Website: Dashboard → Notifications
# - Telegram: Chat with bot
# - Database: OrderItem should have locationLink and pickupVideoUrl
```

---

## 📊 TESTING SUMMARY

### Telegram Bot Features

- Total Tests: 20
- Passed: 0
- Failed: 0
- Pending: 20

### Automated Messages

- Total Tests: 15
- Passed: 0
- Failed: 0
- Pending: 15

### Integration

- Total Tests: 10
- Passed: 0
- Failed: 0
- Pending: 10

---

## 🎯 SUCCESS CRITERIA

### ✅ Telegram Bot: PASS

- All commands working
- All buttons working
- Fast response time
- Good error handling

### ✅ Automated Messages: PASS

- Website notifications working
- Telegram notifications working
- Location URL included
- Video URL included
- Messages formatted correctly

### ✅ Integration: PASS

- Website and Telegram synced
- Orders appear on both platforms
- Notifications sent to both platforms

---

## 🐛 COMMON ISSUES & FIXES

### Issue: "Telegram messages not sending"

**Fix:**

1. Check `TELEGRAM_BOT_1_TOKEN` is set
2. Check user has `telegramId` in database
3. Check bot is not blocked by user
4. Check server logs for errors

### Issue: "Location/Video URL not showing"

**Fix:**

1. Check `ProductAreaDetail` has `locationUrl` and `videoUrl` set
2. Check `OrderItem` has `locationLink` and `pickupVideoUrl` after cron runs
3. Check cron job is running

### Issue: "Cron job not running"

**Fix:**

1. Check `CRON_SECRET` is set
2. Check cron is scheduled (use cron-job.org or similar)
3. Test manually with curl command

### Issue: "Bot not responding"

**Fix:**

1. Check bot token is correct
2. Check bot is running (check server logs)
3. Check webhook is set correctly

---

## 📞 NEED HELP?

### Check These Files:

- `src/bots/bot.ts` - Bot implementation
- `src/app/api/cron/process-cooldowns/route.ts` - Cron job
- `FIX_NOTIFICATIONS.md` - Notification fixes
- `URGENT_FIX.md` - Urgent fixes

### Test Scripts:

- `scripts/test-telegram.ts` - Test Telegram bot
- `scripts/test-notification.ts` - Test notifications
- `scripts/test-cron.ts` - Test cron job

---

## 🎉 READY TO TEST!

1. ✅ Verify environment variables are set
2. ✅ Start dev server: `npm run dev`
3. ✅ Test bot commands on Telegram
4. ✅ Place test order
5. ✅ Trigger cron manually
6. ✅ Check notifications on website and Telegram
7. ✅ Verify location and video URLs

---

**Good luck with testing!** 🚀

_Last Updated: 7/31/2026_
