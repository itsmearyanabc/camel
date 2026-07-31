# ⚡ QUICK SETUP - Encrypted Password System

## 🚀 5-Minute Setup

### 1️⃣ Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (64 characters).

### 2️⃣ Add to .env

```env
PASSWORD_ENCRYPTION_KEY="paste-your-64-character-key-here"
```

### 3️⃣ Run Migration

```bash
psql $DATABASE_URL -f prisma/migrations/encrypt_passwords.sql
```

### 4️⃣ Encrypt Existing Passwords

```bash
npx tsx scripts/encrypt-existing-passwords.ts
```

### 5️⃣ Restart App

```bash
npm run dev
```

---

## ✅ Done!

Your passwords are now encrypted! 🎉

---

## 📖 Full Documentation

See `ENCRYPTED_PASSWORD_SYSTEM.md` for complete details.

---

## 🆘 Need Help?

### Test if it works:

```bash
# Register a new user, then check the database:
psql $DATABASE_URL -c "SELECT username, \"passwordEncrypted\" FROM \"User\" LIMIT 1;"
```

You should see something like:

```
username | passwordEncrypted
---------|------------------
testuser | a1b2c3...:d4e5f6...:9z8y7x...
```

The password is encrypted! ✅

---

## 🔑 Admin Usage

When a customer forgets their password:

1. Go to admin panel
2. Find the user
3. Call API: `GET /api/admin/users/{userId}/password`
4. Tell customer their password

---

**That's it! You're all set! 🎉**
