# 🔓 HOW TO DECRYPT PASSWORDS

## Method 1: Command Line (Easiest)

When a customer contacts you saying they forgot their password:

```bash
npx tsx scripts/decrypt-password.ts <username>
```

**Example:**

```bash
npx tsx scripts/decrypt-password.ts john_doe
```

**Output:**

```
📋 User Information:
===================
Username: john_doe
User ID: abc-123-def
Role: CUSTOMER
Created: 7/31/2026, 5:30:00 AM

🔓 Decrypted Password:
===================
Password: mySecretPass123

✅ Success! You can now share this with the customer.
```

---

## Method 2: API Endpoint (For Admin Panel)

If you're logged in as admin, you can call:

```
GET /api/admin/users/{userId}/password
```

**Example using fetch:**

```javascript
const response = await fetch(`/api/admin/users/${userId}/password`);
const data = await response.json();
console.log(data.password); // "mySecretPass123"
```

---

## Method 3: Direct Database Query (Advanced)

If you have database access:

```sql
-- Get encrypted password
SELECT "passwordEncrypted" FROM "User" WHERE username = 'john_doe';
```

Then decrypt it using the encryption utility in your code.

---

## 🎯 Recommended Workflow

1. **Customer contacts you:** "I forgot my password"
2. **Verify their identity:** Ask for username, email, order details, etc.
3. **Run the decrypt command:**
   ```bash
   npx tsx scripts/decrypt-password.ts their_username
   ```
4. **Copy the password** from the output
5. **Send it to the customer** via Telegram/email
6. **Recommend** they change it after logging in

---

## ⚡ Quick Reference

| What You Need              | Command                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| Decrypt password           | `npx tsx scripts/decrypt-password.ts <username>`                           |
| Generate new key           | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Encrypt existing passwords | `npx tsx scripts/encrypt-existing-passwords.ts`                            |

---

## 🔒 Security Reminder

- ✅ Only decrypt passwords when customers request it
- ✅ Verify customer identity before sharing passwords
- ✅ Use secure channels to send passwords (Telegram, encrypted email)
- ❌ Don't log or store decrypted passwords
- ❌ Don't share passwords in plain text over insecure channels

---

**That's it! Super easy! 🎉**
