# 🚀 DEPLOYMENT CHECKLIST

## ✅ Pre-Deployment (COMPLETED)

- [x] Remove passwordPlain from all API responses
- [x] Remove passwordPlain from database schema
- [x] Add rate limiting to login endpoint
- [x] Create database migration script
- [x] Regenerate Prisma client
- [x] Verify TypeScript compilation (0 errors)
- [x] Test application locally

---

## 🔴 CRITICAL: Database Migration (DO THIS FIRST!)

### Step 1: Backup Database

```bash
# Create a backup before running migration
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Migration

```bash
# Option A: Using psql directly
psql $DATABASE_URL -f prisma/migrations/remove_password_plain.sql

# Option B: Using Supabase SQL Editor
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy contents of prisma/migrations/remove_password_plain.sql
# 3. Paste and run
```

### Step 3: Verify Migration

```sql
-- Run this query to verify passwordPlain column is gone:
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;

-- You should NOT see 'passwordPlain' in the results
```

---

## 📦 Deployment Steps

### 1. Commit Changes

```bash
git add .
git commit -m "🔒 SECURITY: Remove plain text password storage and add rate limiting

- Remove passwordPlain from all API responses
- Remove passwordPlain from database schema
- Add IP-based rate limiting to login endpoint
- Create migration to remove passwordPlain column
- Fixes critical security vulnerability"

git push origin main
```

### 2. Deploy to Production

```bash
# If using Vercel:
vercel --prod

# If using other platform, follow your deployment process
```

### 3. Run Migration on Production Database

```bash
# Connect to production database and run migration
psql $PRODUCTION_DATABASE_URL -f prisma/migrations/remove_password_plain.sql
```

### 4. Verify Deployment

- [ ] Visit production URL
- [ ] Test user registration
- [ ] Test user login
- [ ] Test password change
- [ ] Test admin panel
- [ ] Verify no errors in logs

---

## 🧪 Post-Deployment Testing

### Authentication Flow:

- [ ] Register new user
- [ ] Login with new user
- [ ] Login with admin credentials
- [ ] Change password
- [ ] Test rate limiting (try 6+ failed logins)

### Admin Panel:

- [ ] View users list (verify no passwordPlain)
- [ ] View orders (verify no passwordPlain)
- [ ] Create employee
- [ ] Update employee

### API Endpoints:

- [ ] GET /api/client-admin/users (no passwordPlain)
- [ ] GET /api/client-admin/orders (no passwordPlain)
- [ ] POST /api/auth/register (no passwordPlain)
- [ ] POST /api/auth/login (rate limited)
- [ ] POST /api/auth/change-password (no passwordPlain)

---

## 🔍 Monitoring

### Check Logs:

```bash
# Vercel
vercel logs

# Other platforms - check your logging dashboard
```

### What to Look For:

- ✅ No TypeScript errors
- ✅ No database errors
- ✅ No authentication errors
- ⚠️ Rate limiting working (429 errors after 5 attempts)

---

## 🚨 Rollback Plan (If Needed)

### If Something Goes Wrong:

1. **Revert Code:**

   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Restore Database:**

   ```bash
   # Restore from backup
   psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
   ```

3. **Redeploy:**
   ```bash
   vercel --prod
   ```

---

## 📊 Success Criteria

### Security:

- ✅ No plain text passwords in database
- ✅ No plain text passwords in API responses
- ✅ Rate limiting active on login endpoint
- ✅ All TypeScript errors resolved

### Functionality:

- ✅ Users can register
- ✅ Users can login
- ✅ Users can change password
- ✅ Admins can manage users
- ✅ Admins can manage orders
- ✅ Telegram bot works

---

## 📞 Support

### If You Encounter Issues:

1. **Check Logs:**
   - Application logs
   - Database logs
   - Vercel/hosting logs

2. **Common Issues:**
   - **Migration fails:** Check database permissions
   - **TypeScript errors:** Run `npx prisma generate`
   - **Login fails:** Clear browser cookies
   - **Rate limit too strict:** Adjust in `src/lib/rate-limit.ts`

3. **Get Help:**
   - Review `SECURITY_FIXES_APPLIED.md`
   - Review `SECURITY_AUDIT_REPORT.md`
   - Check Prisma docs: https://www.prisma.io/docs

---

## ✅ Sign-Off

**Deployment Date:** ******\_******
**Deployed By:** ******\_******
**Migration Run:** [ ] Yes [ ] No
**Tests Passed:** [ ] Yes [ ] No
**Production URL:** ******\_******

**Status:** [ ] SUCCESS [ ] ISSUES [ ] ROLLBACK

**Notes:**

---

---

---

---

**🎉 Congratulations! Your application is now significantly more secure!**
