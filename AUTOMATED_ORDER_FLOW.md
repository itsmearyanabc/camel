# Automated Order Status Change System - Documentation

## Overview

The automated order status change system is **fully functional** and has been **preserved** in Phase 8. This document explains how it works.

## Status Flow

```
PENDING → PROCESSING → COOLDOWN_ACTIVE → ON_PICKUP → COMPLETED
```

## Automated Transitions

### 1. COOLDOWN_ACTIVE → ON_PICKUP (Automatic)

**Trigger**: Cron job runs every minute
**Condition**: `cooldownEndAt <= now` AND `automatedMessageSent = false`

**What Happens**:

1. System finds all `COOLDOWN_ACTIVE` items where cooldown has expired
2. Fetches area details (location URL, video, message)
3. Updates OrderItem:
   - `status` → `ON_PICKUP`
   - `locationLink` → from area details
   - `pickupVideoUrl` → from area details
   - `adminMessage` → from area details
   - `automatedMessageSent` → `true`
   - `adminMessageSentAt` → current time
   - `onPickupAt` → current time
4. Creates website notification
5. Sends Telegram notification (grouped by product)
6. Updates master Order status to `PROCESSING`

**Code Location**: `src/app/api/cron/process-cooldowns/route.ts` (Lines 34-132)

### 2. ON_PICKUP → COMPLETED (Automatic)

**Trigger**: Cron job runs every minute
**Condition**: `onPickupAt <= 2 days ago`

**What Happens**:

1. System finds all `ON_PICKUP` items older than 2 days
2. Updates OrderItem status to `COMPLETED`
3. Checks if all items in order are completed
4. If yes, updates master Order status to `COMPLETED`
5. Sends Telegram notification

**Code Location**: `src/app/api/cron/process-cooldowns/route.ts` (Lines 166-220)

## Manual Transitions

### PENDING → PROCESSING

**Trigger**: Admin manually updates order status
**Location**: Staff panel (`/control-panel-x7k9`)

### PROCESSING → COOLDOWN_ACTIVE

**Trigger**: Automatic when order is created with area that has cooldown
**Location**:

- `src/app/api/orders/checkout/route.ts`
- `src/app/api/orders/crypto-checkout/route.ts`

## Cron Job Details

### Endpoint

```
GET /api/cron/process-cooldowns
```

### Authentication

```
Authorization: Bearer YOUR_CRON_SECRET
```

### Frequency

**Recommended**: Every minute

### Response

```json
{
  "success": true,
  "processedCount": 5,
  "autoCompletedCount": 2
}
```

## Notification System

### Website Notifications (NEW in Phase 8)

- Created when status changes to `ON_PICKUP`
- Stored in `Notification` table
- Displayed in notification bell
- Real-time updates

### Telegram Notifications (EXISTING)

- Sent when status changes to `ON_PICKUP`
- Grouped by product (if multiple items)
- Includes location link and video
- Sent when auto-completed

## Database Fields

### OrderItem

```prisma
model OrderItem {
  status              String   // COOLDOWN_ACTIVE, ON_PICKUP, COMPLETED
  cooldownEndAt       DateTime? // When cooldown expires
  onPickupAt          DateTime? // When status changed to ON_PICKUP
  automatedMessageSent Boolean  // Prevent duplicate notifications
  adminMessageSentAt   DateTime? // When notification was sent
  locationLink        String?   // Google Maps URL
  pickupVideoUrl      String?   // Video guide URL
  adminMessage        String?   // Custom message
}
```

### ProductAreaDetail

```prisma
model ProductAreaDetail {
  locationUrl     String?  // Google Maps URL
  videoUrl        String?  // Video guide URL
  message         String?  // Custom message
  cooldownMinutes Int?     // Cooldown period
}
```

## Key Features

### 1. Cooldown System

- **Per-Area Configuration**: Each area can have different cooldown times
- **Automatic Processing**: No manual intervention needed
- **Flexible**: Can be disabled by not setting cooldown

### 2. Notification Grouping

- **Smart Grouping**: Multiple items from same product grouped together
- **Quantity Display**: Shows "2x Product Name" if quantity > 1
- **Single Message**: One Telegram message per product

### 3. Auto-Complete

- **2-Day Window**: Orders auto-complete after 2 days in ON_PICKUP
- **Prevents Stale Orders**: Keeps system clean
- **Notification**: User informed via Telegram

### 4. Error Handling

- **Graceful Failures**: Telegram errors don't stop processing
- **Logging**: All errors logged for debugging
- **Retry Logic**: Failed items processed in next cron run

## Configuration

### Environment Variables

```env
# Required
CRON_SECRET=your-secret-key-here
TELEGRAM_BOT_1_TOKEN=your-bot-token

# Optional
NODE_ENV=production
```

### Setting Up Cron

#### Option 1: Vercel Cron

```json
{
  "crons": [
    {
      "path": "/api/cron/process-cooldowns",
      "schedule": "* * * * *"
    }
  ]
}
```

#### Option 2: External Cron Service

```bash
# Every minute
* * * * * curl -X GET https://your-domain.com/api/cron/process-cooldowns \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### Option 3: GitHub Actions

```yaml
name: Process Cooldowns
on:
  schedule:
    - cron: "* * * * *"
jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cron Endpoint
        run: |
          curl -X GET https://your-domain.com/api/cron/process-cooldowns \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Monitoring

### What to Monitor

- Cron job execution time
- Number of processed items
- Number of auto-completed items
- Telegram API errors
- Database errors

### Logs to Watch

```
[Process Cooldowns] Processed 5 items
[Process Cooldowns] Auto-completed 2 items
[Process Cooldowns] Failed to send telegram message
```

### Alerts to Set Up

- Cron job not running (no executions in 5 minutes)
- High error rate (> 10% of items)
- Telegram API failures
- Database connection issues

## Testing

### Manual Test

```bash
# 1. Create order with cooldown
# 2. Wait for cooldown to expire (or manually update cooldownEndAt)
# 3. Call cron endpoint
curl -X GET http://localhost:3000/api/cron/process-cooldowns \
  -H "Authorization: Bearer your-cron-secret"

# 4. Check response
# 5. Verify order status changed
# 6. Verify notification created
# 7. Verify Telegram message sent
```

### Automated Test

```typescript
// Test cooldown expiration
const item = await prisma.orderItem.create({
  data: {
    status: "COOLDOWN_ACTIVE",
    cooldownEndAt: new Date(Date.now() - 1000), // 1 second ago
    automatedMessageSent: false,
    // ... other fields
  },
});

// Run cron job
await fetch("/api/cron/process-cooldowns", {
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});

// Verify status changed
const updated = await prisma.orderItem.findUnique({ where: { id: item.id } });
expect(updated.status).toBe("ON_PICKUP");
```

## Troubleshooting

### Cron Job Not Running

- Check cron service is configured
- Verify CRON_SECRET is set
- Check server logs for errors
- Test endpoint manually

### Notifications Not Sending

- Verify Telegram bot token
- Check user has telegramId
- Verify bot is not blocked
- Check server logs

### Orders Not Auto-Completing

- Verify onPickupAt is set
- Check 2-day threshold
- Verify cron job is running
- Check database for errors

## Changes in Phase 8

### What Was Added

- ✅ Website notification creation (Line 91-99)
- ✅ Notification model in database
- ✅ Notification bell component
- ✅ API endpoints for notifications

### What Was Preserved

- ✅ Cooldown processing logic
- ✅ Telegram notification system
- ✅ Auto-complete functionality
- ✅ Status transition flow
- ✅ Error handling
- ✅ Grouping logic

## Conclusion

The automated order status change system is **fully functional** and **unchanged** from the original implementation. Phase 8 only **added** website notifications while **preserving** all existing functionality.

The system is production-ready and working as expected! 🎉
