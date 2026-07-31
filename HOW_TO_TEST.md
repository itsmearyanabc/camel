# 🧪 HOW TO TEST YOUR APPLICATION

## 🚀 QUICK START

### Step 1: Start the Development Server

```bash
npm run dev
```

### Step 2: Open Testing Checklist

Open `TESTING_CHECKLIST.md` and follow it step by step.

### Step 3: Test Each Panel

1. **Admin Panel** (SUPERADMIN)
2. **Staff Panel** (STAFF)
3. **User Panel** (CUSTOMER)

---

## 🔐 1. TESTING ADMIN PANEL

### Login as Admin

1. Go to: `http://localhost:3000/login`
2. Enter admin credentials
3. Should redirect to: `/control-panel-x7k9` or `/admin/dashboard`

### What to Test:

- ✅ Dashboard loads correctly
- ✅ Can view all users
- ✅ Can create/edit/delete users
- ✅ Can view user passwords (NEW FEATURE)
- ✅ Can manage employees
- ✅ Can view all orders
- ✅ Can update order status
- ✅ Can access settings

### Test Password Decryption:

```bash
# In terminal
npx tsx scripts/decrypt-password.ts <username>
```

---

## 👥 2. TESTING STAFF PANEL

### Login as Staff

1. Go to: `http://localhost:3000/login`
2. Enter staff credentials
3. Should redirect to: `/client-admin/dashboard` or `/staff/dashboard`

### What to Test:

- ✅ Dashboard loads correctly
- ✅ Can view users (but NOT passwords)
- ✅ Can create users
- ✅ Can view orders
- ✅ Can update order status
- ✅ CANNOT delete orders
- ✅ CANNOT access `/admin/*` routes
- ✅ Can change own password

---

## 👤 3. TESTING USER PANEL

### Register New User

1. Go to: `http://localhost:3000/register`
2. Create new account
3. Should redirect to: `/dashboard`

### Login as User

1. Go to: `http://localhost:3000/login`
2. Enter user credentials
3. Should redirect to: `/dashboard`

### What to Test:

- ✅ Dashboard loads correctly
- ✅ Can view own orders only
- ✅ Can create new order
- ✅ Can view order details
- ✅ CANNOT see other users' orders
- ✅ Can update profile
- ✅ Can change password
- ✅ Can connect Telegram
- ✅ Can make payment

---

## 🔒 4. SECURITY TESTING

### Test Rate Limiting

```bash
# Try to login 101 times rapidly
# Should get blocked after 100 attempts
```

### Test Password Encryption

```bash
# 1. Register a new user
# 2. Check database - password should be encrypted
# 3. Use decrypt tool to verify
npx tsx scripts/decrypt-password.ts <username>
```

### Test Authorization

1. **Without login:**
   - Try accessing `/admin/*` → Should redirect to login
   - Try accessing `/dashboard` → Should redirect to login

2. **As Staff:**
   - Try accessing `/admin/*` → Should be blocked
   - Try accessing `/client-admin/*` → Should work

3. **As User:**
   - Try accessing `/admin/*` → Should be blocked
   - Try accessing `/client-admin/*` → Should be blocked
   - Try accessing `/dashboard` → Should work

---

## 🚀 5. AUTOMATED TESTING

### Run Route Verification

```bash
# Make sure dev server is running first
npm run dev

# In another terminal
npx tsx scripts/verify-routes.ts
```

This will test all API routes and show you which ones are working.

---

## 📊 6. MANUAL TESTING CHECKLIST

### Admin Panel (25 tests)

- [ ] Login/Logout
- [ ] Dashboard
- [ ] User Management (6 tests)
- [ ] Employee Management (4 tests)
- [ ] Order Management (4 tests)
- [ ] Password Decryption (2 tests)
- [ ] Settings (2 tests)

### Staff Panel (15 tests)

- [ ] Login/Access Control
- [ ] Dashboard
- [ ] User Management (3 tests)
- [ ] Order Management (3 tests)
- [ ] Profile (2 tests)

### User Panel (20 tests)

- [ ] Register/Login
- [ ] Dashboard
- [ ] Orders (4 tests)
- [ ] Profile (3 tests)
- [ ] Payment (2 tests)
- [ ] Telegram (2 tests)

### Security (10 tests)

- [ ] Password Encryption
- [ ] Session Security
- [ ] Rate Limiting
- [ ] Authorization (3 tests)
- [ ] Data Protection (3 tests)

---

## 🐛 7. COMMON ISSUES & FIXES

### Issue: "Cannot login"

**Fix:** Check if user exists in database

```bash
npx tsx scripts/decrypt-password.ts <username>
```

### Issue: "Password not working"

**Fix:** Password might be encrypted. Use decrypt tool to get it.

### Issue: "Rate limited"

**Fix:** Wait 15 minutes or restart the server

### Issue: "Cannot access admin panel"

**Fix:** Check user role in database. Should be SUPERADMIN.

### Issue: "Routes not working"

**Fix:**

1. Check if dev server is running
2. Run `npx tsx scripts/verify-routes.ts`
3. Check console for errors

---

## 📝 8. TESTING WORKFLOW

### Recommended Order:

1. ✅ Start dev server
2. ✅ Run route verification script
3. ✅ Test Admin Panel (25 tests)
4. ✅ Test Staff Panel (15 tests)
5. ✅ Test User Panel (20 tests)
6. ✅ Test Security (10 tests)
7. ✅ Document any issues found
8. ✅ Fix issues
9. ✅ Re-test

---

## 🎯 9. SUCCESS CRITERIA

### Admin Panel: ✅ PASS

- All 25 tests passing
- No console errors
- All features working

### Staff Panel: ✅ PASS

- All 15 tests passing
- No console errors
- Proper access control

### User Panel: ✅ PASS

- All 20 tests passing
- No console errors
- All features working

### Security: ✅ PASS

- All 10 tests passing
- Passwords encrypted
- Rate limiting working
- Authorization working

---

## 📞 10. NEED HELP?

### Check These Files:

- `TESTING_CHECKLIST.md` - Complete testing checklist
- `COMPLETE.md` - Final summary
- `SECURITY_STATUS.md` - Security status
- `DEPLOYMENT_READY.md` - Deployment checklist

### Run Verification:

```bash
npx tsx scripts/verify-routes.ts
```

### Check Logs:

- Browser console (F12)
- Terminal where dev server is running
- Network tab in browser DevTools

---

## 🎉 READY TO TEST!

1. Start dev server: `npm run dev`
2. Open: `http://localhost:3000`
3. Follow: `TESTING_CHECKLIST.md`
4. Mark tests as you complete them
5. Report any issues found

---

**Good luck with testing!** 🚀

_Last Updated: 7/31/2026_
