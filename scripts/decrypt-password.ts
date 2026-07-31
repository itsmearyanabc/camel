/**
 * Quick Password Decryption Tool
 * 
 * Usage:
 *   npx tsx scripts/decrypt-password.ts <username>
 * 
 * Example:
 *   npx tsx scripts/decrypt-password.ts john_doe
 */

import { PrismaClient } from "@prisma/client";
import { decryptPassword, isEncryptionConfigured } from "../src/lib/encryption";

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];

  if (!username) {
    console.error("❌ Please provide a username");
    console.log("\nUsage: npx tsx scripts/decrypt-password.ts <username>");
    console.log("Example: npx tsx scripts/decrypt-password.ts john_doe\n");
    process.exit(1);
  }

  if (!isEncryptionConfigured()) {
    console.error("❌ PASSWORD_ENCRYPTION_KEY is not configured in .env");
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        passwordEncrypted: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      console.error(`❌ User "${username}" not found`);
      process.exit(1);
    }

    console.log("\n📋 User Information:");
    console.log("===================");
    console.log(`Username: ${user.username}`);
    console.log(`User ID: ${user.id}`);
    console.log(`Role: ${user.role}`);
    console.log(`Created: ${user.createdAt.toLocaleString()}`);

    if (!user.passwordEncrypted) {
      console.log("\n⚠️  No encrypted password found for this user");
      console.log("This user was created before encryption was enabled");
      process.exit(0);
    }

    try {
      const decryptedPassword = decryptPassword(user.passwordEncrypted);
      console.log("\n🔓 Decrypted Password:");
      console.log("===================");
      console.log(`Password: ${decryptedPassword}`);
      console.log("\n✅ Success! You can now share this with the customer.\n");
    } catch (error) {
      console.error("\n❌ Failed to decrypt password");
      console.error("The encryption key may be wrong or the data is corrupted");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
