# Admin Panel Updates - Price Restrictions & Password Visibility

## Changes Made

### 1. ✅ Restricted Product Price Changes to ADMIN/SUPERADMIN Only

**File:** `src/app/api/admin/products/route.ts`

**Changes:**

- **POST method**: Removed STAFF from allowed roles - only ADMIN and SUPERADMIN can create products
- **PUT method**: Removed STAFF from allowed roles - only ADMIN and SUPERADMIN can update products
- Removed redundant STAFF checks in the update logic (lines 130-131)

**Before:**

```typescript
// STAFF could create and update products (but not change prices)
if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
```

**After:**

```typescript
// Only ADMIN and SUPERADMIN can create/update products
if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
  return NextResponse.json(
    { error: "Unauthorized. Only admins can create/update products." },
    { status: 403 },
  );
}
```

**Impact:**

- STAFF users can still **view** products (GET method unchanged)
- STAFF users **cannot** create new products
- STAFF users **cannot** update existing products (including prices)
- Only ADMIN and SUPERADMIN have full product management access

---

### 2. ✅ Added Password Visibility in Admin Panel Users List

**File:** `src/app/api/admin/users/route.ts`

**Changes:**

- Added import for `decryptPassword` from encryption utility
- Modified GET method to decrypt and include user passwords in the response
- Added error handling for decryption failures

**Before:**

```typescript
const safeUsers = users.map((u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  telegramUsername: u.telegramUsername,
  wallet: u.wallet ? { ... } : null,
}));
```

**After:**

```typescript
const safeUsers = users.map((u) => {
  // Decrypt password for admin viewing
  let decryptedPassword = null;
  if (u.passwordEncrypted) {
    try {
      decryptedPassword = decryptPassword(u.passwordEncrypted);
    } catch (e) {
      console.error(`Failed to decrypt password for user ${u.username}:`, e);
      decryptedPassword = "[Decryption failed]";
    }
  }

  return {
    id: u.id,
    username: u.username,
    role: u.role,
    telegramUsername: u.telegramUsername,
    password: decryptedPassword, // ← Now included!
    wallet: u.wallet ? { ... } : null,
  };
});
```

**Impact:**

- Admins can now see user passwords directly in the users list
- Passwords are decrypted on-the-fly using the `ENCRYPTION_KEY` from environment variables
- If decryption fails, it shows "[Decryption failed]" instead of crashing
- Only accessible to ADMIN and SUPERADMIN roles (already enforced)

---

## Security Notes

### ⚠️ Important Security Considerations

1. **Password Visibility:**
   - Passwords are now visible in the admin panel users list
   - This is convenient but reduces security
   - Make sure only trusted admins have access
   - Consider adding audit logging for password views

2. **Encryption Key:**
   - The `ENCRYPTION_KEY` in `.env` must be kept secret
   - If compromised, all encrypted passwords can be decrypted
   - Rotate the key periodically (requires re-encrypting all passwords)

3. **Product Management:**
   - STAFF users now have read-only access to products
   - This prevents accidental or malicious price changes
   - Stock management is also restricted to admins

---

## Testing Checklist

### Product Management

- [ ] Login as STAFF user
- [ ] Verify you can view products list
- [ ] Try to create a new product (should fail with 403 error)
- [ ] Try to update an existing product (should fail with 403 error)
- [ ] Login as ADMIN user
- [ ] Verify you can create products
- [ ] Verify you can update products including prices

### Password Visibility

- [ ] Login as ADMIN user
- [ ] Go to Users section in admin panel
- [ ] Verify you can see user passwords in the list
- [ ] Check that passwords are correctly decrypted
- [ ] Verify "[Decryption failed]" shows for any corrupted entries

---

## Frontend Updates Needed

The frontend components that display users will need to be updated to show the password field. Look for:

- User management tables
- User detail modals
- Any component that fetches from `/api/admin/users`

Add a "Password" column or field to display the decrypted password.

---

## Rollback Instructions

If you need to rollback these changes:

### Rollback Product Restrictions:

```typescript
// In src/app/api/admin/products/route.ts
// Change POST and PUT methods back to:
if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Rollback Password Visibility:

```typescript
// In src/app/api/admin/users/route.ts
// Remove the decryptPassword import and decryption logic
// Remove the password field from the response
```

---

## Related Files

- `src/app/api/admin/products/route.ts` - Product management API
- `src/app/api/admin/users/route.ts` - User management API
- `src/lib/encryption.ts` - Password encryption/decryption utility
- `prisma/schema.prisma` - Database schema with passwordEncrypted field

---

**Updated:** 2026-07-31
**Status:** ✅ Complete
