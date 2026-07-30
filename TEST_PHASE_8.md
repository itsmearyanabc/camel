# Phase 8 Testing Guide

## Quick Test Checklist

### 1. Database Migration

```bash
# Generate Prisma client (already done)
npx prisma generate

# Run migration (when database is accessible)
npx prisma migrate dev --name add_notifications

# Or push schema directly
npx prisma db push
```

### 2. Test Notification System

#### A. Create a Test Notification

```bash
# Use Prisma Studio to manually create a notification
npx prisma studio
```

Or use the API:

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-id", "type": "ORDER_READY", "title": "Test", "message": "Test notification"}'
```

#### B. View Notifications

1. Log in to dashboard
2. Look for bell icon in top navigation
3. Click bell to see dropdown
4. Verify unread count badge appears

### 3. Test Cooldown System

#### A. Create Order with Cooldown

1. Go to admin panel (`/control-panel-x7k9`)
2. Edit a product
3. Add area detail with cooldown (e.g., 60 minutes)
4. Save product
5. Place order as customer
6. Verify order status is `COOLDOWN_ACTIVE`

#### B. Test Cron Job

```bash
# Call cron endpoint manually
curl -X GET http://localhost:3000/api/cron/process-cooldowns \
  -H "Authorization: Bearer your-cron-secret"
```

Expected response:

```json
{
  "success": true,
  "processedCount": 1,
  "autoCompletedCount": 0
}
```

### 4. Test Location Map

#### A. Add Location URL to Product

1. Go to admin panel
2. Edit product area detail
3. Add Google Maps URL (e.g., `https://maps.google.com/?q=25.2048,55.2708`)
4. Save

#### B. View Location Map

1. Place order as customer
2. Wait for cooldown to expire
3. View order details
4. Verify location map appears
5. Click "Calculate Distance" (requires location permission)
6. Verify distance is displayed

### 5. Test Telegram Notifications

#### A. Verify Bot Token

```bash
# Check environment variable
echo $TELEGRAM_BOT_1_TOKEN
```

#### B. Test Notification Delivery

1. Place order with Telegram-linked account
2. Wait for cooldown to expire
3. Check Telegram for notification
4. Verify message includes location link and video

### 6. Integration Test

#### Complete Flow:

1. **Setup**: Admin configures product with area, location, cooldown
2. **Order**: Customer places order
3. **Cooldown**: Order enters `COOLDOWN_ACTIVE` status
4. **Wait**: Cooldown period expires
5. **Cron**: Cron job processes cooldown
6. **Notification**: Customer receives website + Telegram notification
7. **Location**: Customer views map with distance
8. **Pickup**: Customer picks up order
9. **Complete**: Order auto-completes after 2 days

## Expected Results

### ✅ Notification Bell

- Bell icon visible in dashboard nav
- Unread count badge shows correct number
- Dropdown displays notifications
- Click notification marks as read
- "Mark all read" button works

### ✅ Cooldown System

- Orders start in `COOLDOWN_ACTIVE` status
- Countdown timer displays correctly
- Status changes to `ON_PICKUP` after cooldown
- Notifications sent on status change

### ✅ Location Map

- Map component renders correctly
- Coordinates extracted from URL
- Distance calculation works
- "Open in Google Maps" link works

### ✅ Telegram Integration

- Messages sent to correct user
- Markdown formatting correct
- Location links clickable
- Video links work

## Troubleshooting

### Notifications Not Appearing

- Check database migration ran successfully
- Verify `Notification` model exists in Prisma client
- Check browser console for errors
- Verify API endpoint returns data

### Cooldown Not Processing

- Check cron job is running
- Verify `CRON_SECRET` is set
- Check server logs for errors
- Verify `cooldownEndAt` is in the past

### Location Map Not Working

- Verify Google Maps URL format
- Check browser supports geolocation
- Verify location permission granted
- Check console for errors

### Telegram Not Sending

- Verify bot token is correct
- Check user has `telegramId` set
- Verify bot is not blocked by user
- Check server logs for API errors

## Performance Testing

### Load Test Notifications

```bash
# Create 100 notifications
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/notifications \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"test-user\", \"type\": \"GENERAL\", \"title\": \"Test $i\", \"message\": \"Load test\"}"
done
```

### Monitor Cron Performance

```bash
# Time cron execution
time curl -X GET http://localhost:3000/api/cron/process-cooldowns \
  -H "Authorization: Bearer your-cron-secret"
```

## Security Testing

### Test Unauthorized Access

```bash
# Should return 401
curl -X GET http://localhost:3000/api/notifications

# Should return 401
curl -X GET http://localhost:3000/api/cron/process-cooldowns
```

### Test Authorization

```bash
# Should only return user's own notifications
curl -X GET http://localhost:3000/api/notifications \
  -H "Cookie: session=user1-session"
```

## Next Steps

After testing:

1. Deploy to staging environment
2. Run full integration tests
3. Monitor error logs
4. Set up production cron job
5. Configure monitoring/alerts
6. Deploy to production
