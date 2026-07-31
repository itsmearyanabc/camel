/**
 * Script to encrypt existing plain text passwords
 * 
 * This script will:
 * 1. Find all users with passwordEncrypted field containing plain text
 * 2. Encrypt those passwords using AES-256-GCM
 * 3. Update the database with encrypted passwords
 * 
 * Usage:
 *   npx tsx scripts/encrypt-existing-passwords.ts
 * 
 * Prerequisites:
 *   - PASSWORD_ENCRYPTION_KEY must be set in .env
 *   - Database migration must be run first
 */

import { PrismaClient } from "@prisma/client";
import { encryptPassword, isEncryptionConfigured } from "../src/lib/encryption";

const prisma = new PrismaClient();

async function main() {
  console.log("🔐 Password Encryption Script");
  console.log("==============================\n");

  // Check if encryption is configured
  if (!isEncryptionConfigured()) {
    console.error("❌ ERROR: PASSWORD_ENCRYPTION_KEY is not configured!");
    console.error("\nPlease:");
    console.error("1. Generate a key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.error("2. Add it to your .env file: PASSWORD_ENCRYPTION_KEY=<your-key>");
    console.error("3. Run this script again\n");
    process.exit(1);
  }

  console.log("✅ Encryption key is configured\n");

  // Find all users with passwordEncrypted field
  const users = await prisma.user.findMany({
    where: {
      passwordEncrypted: {
        not: null,
      },
    },
    select: {
      id: true,
      username: true,
      passwordEncrypted: true,
    },
  });

  console.log(`📊 Found ${users.length} users with passwords\n`);

  if (users.length === 0) {
    console.log("✅ No passwords to encrypt. All done!");
    return;
  }

  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const currentValue = user.passwordEncrypted!;

      // Check if already encrypted (encrypted format: iv:authTag:data)
      if (currentValue.includes(":") && currentValue.split(":").length === 3) {
        console.log(`⏭️  Skipping ${user.username} (already encrypted)`);
        skipped++;
        continue;
      }

      // Encrypt the plain password
      const encryptedPassword = encryptPassword(currentValue);

      // Update the user
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordEncrypted: encryptedPassword },
      });

      console.log(`✅ Encrypted password for ${user.username}`);
      encrypted++;
    } catch (error) {
      console.error(`❌ Error encrypting password for ${user.username}:`, error);
      errors++;
    }
  }

  console.log("\n==============================");
  console.log("📊 Summary:");
  console.log(`   ✅ Encrypted: ${encrypted}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log("==============================\n");

  if (errors > 0) {
    console.error("⚠️  Some passwords failed to encrypt. Please check the errors above.");
    process.exit(1);
  } else {
    console.log("🎉 All passwords encrypted successfully!");
  }
}

main()
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
