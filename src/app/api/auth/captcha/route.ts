import { NextResponse } from "next/server";
import crypto from "crypto";

const CAPTCHA_SECRET = "captcha_boys_secret_987654321";

function encryptAnswer(answer: string): string {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    crypto.scryptSync(CAPTCHA_SECRET, "salt", 32),
    Buffer.alloc(16, 0)
  );
  let encrypted = cipher.update(answer, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decryptAnswer(token: string): string {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      crypto.scryptSync(CAPTCHA_SECRET, "salt", 32),
      Buffer.alloc(16, 0)
    );
    let decrypted = decipher.update(token, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return "";
  }
}

export async function GET() {
  let num1 = Math.floor(Math.random() * 9) + 1;
  let num2 = Math.floor(Math.random() * 9) + 1;
  const isSubtraction = Math.random() > 0.5;
  let question, answer;

  if (isSubtraction) {
    if (num2 > num1) {
      const temp = num1;
      num1 = num2;
      num2 = temp;
    }
    answer = num1 - num2;
    question = `What is ${num1} - ${num2}?`;
  } else {
    answer = num1 + num2;
    question = `What is ${num1} + ${num2}?`;
  }
  
  const token = encryptAnswer(JSON.stringify({ answer: answer.toString(), expiresAt: Date.now() + 5 * 60 * 1000 })); // 5 min expiry
  
  return NextResponse.json({ question, token });
}
