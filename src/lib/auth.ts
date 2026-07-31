import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "camel971_session";

// Production: Require SESSION_SECRET environment variable
const SESSION_SECRET = process.env.SESSION_SECRET || "";
if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable is required in production. " +
      "Generate one with: openssl rand -base64 32"
    );
  } else {
    console.warn(
      "⚠️  WARNING: SESSION_SECRET is not set. Using default for development only. " +
      "Generate one with: openssl rand -base64 32"
    );
  }
}

interface SessionPayload {
  userId: string;
  role: string;
  username: string;
}

// Derive a 32-byte key from the secret
function deriveKey(): Buffer {
  return crypto.scryptSync(SESSION_SECRET, "s4f4r1_k3y_s4lt", 32);
}

// Encrypt with random IV prepended to ciphertext
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", deriveKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

// Decrypt by extracting IV from prefix
function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 2) return "";
    const iv = Buffer.from(parts[0], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", deriveKey(), iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

export async function createSession(payload: SessionPayload) {
  const sessionStr = JSON.stringify({
    ...payload,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  const encrypted = encrypt(sessionStr);
  
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60, // 24 hours
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }
  
  const decrypted = decrypt(sessionCookie.value);
  if (!decrypted) return null;
  
  try {
    const data = JSON.parse(decrypted);
    if (data.expiresAt < Date.now()) {
      return null; // expired
    }
    return {
      userId: data.userId,
      role: data.role,
      username: data.username,
    };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
