import crypto from "crypto";

// Get encryption key from environment variable
// Generate one with: node -e "console.log(crypto.randomBytes(32).toString('hex'))"
const ENCRYPTION_KEY = process.env.PASSWORD_ENCRYPTION_KEY || "";

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.warn(
    "⚠️  WARNING: PASSWORD_ENCRYPTION_KEY is not set or invalid. " +
    "Password encryption will not work. " +
    "Generate a key with: node -e \"console.log(crypto.randomBytes(32).toString('hex'))\""
  );
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plain text password
 * Returns: iv:authTag:encryptedData (all hex encoded)
 */
export function encryptPassword(plainPassword: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error("PASSWORD_ENCRYPTION_KEY is not configured");
  }

  try {
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    let encrypted = cipher.update(plainPassword, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Return iv:authTag:encryptedData
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt password");
  }
}

/**
 * Decrypt an encrypted password
 * Input format: iv:authTag:encryptedData (all hex encoded)
 */
export function decryptPassword(encryptedPassword: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error("PASSWORD_ENCRYPTION_KEY is not configured");
  }

  try {
    // Split the encrypted string
    const parts = encryptedPassword.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted password format");
    }

    const [ivHex, authTagHex, encryptedData] = parts;
    
    // Convert from hex
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt password");
  }
}

/**
 * Check if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  return ENCRYPTION_KEY.length === 64;
}
