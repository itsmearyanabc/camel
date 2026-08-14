import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Allowlist of valid setting keys to prevent arbitrary injection
const VALID_SETTING_KEYS = [
  "CRYPTO_WALLET_ADDRESS",
  "WALLET_BTC",
  "WALLET_ETH",
  "WALLET_USDT_ERC20",
  "WALLET_USDT_TRC20",
  "WALLET_SOL",
  "WALLET_TRX",
  "FEE_BTC",
  "FEE_ETH",
  "FEE_USDT_ERC20",
  "FEE_USDT_TRC20",
  "FEE_SOL",
  "FEE_TRX",
  "SITE_NAME",
  "SITE_DESCRIPTION",
  "MAINTENANCE_MODE",
  "COOLDOWN_SECONDS",
  // Always-on store-wide discount: no code to type, no per-user limits.
  // See src/lib/ongoingDiscount.ts for how these are read at checkout.
  "ONGOING_DISCOUNT_ENABLED",
  "ONGOING_DISCOUNT_PERCENT",
] as const;

type ValidSettingKey = typeof VALID_SETTING_KEYS[number];

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.setting.findMany();
    
    // Convert to key-value object
    const settingsMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error("Fetch settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key, value } = await req.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: "Key and value are required" }, { status: 400 });
    }

    if (!VALID_SETTING_KEYS.includes(key as ValidSettingKey)) {
      return NextResponse.json({ error: `Invalid setting key. Valid keys: ${VALID_SETTING_KEYS.join(", ")}` }, { status: 400 });
    }

    if (typeof value !== "string" || value.length > 500) {
      return NextResponse.json({ error: "Value must be a string of 500 characters or less" }, { status: 400 });
    }

    // The discount percentage is applied to every order in the shop, so a typo
    // here is not a recoverable mistake. Reject anything out of range at the
    // door rather than letting the checkout code decide what to do with it.
    if (key === "ONGOING_DISCOUNT_PERCENT") {
      const percent = Number(value);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        return NextResponse.json(
          { error: "Discount percentage must be a number between 0 and 100." },
          { status: 400 }
        );
      }
    }

    if (key === "ONGOING_DISCOUNT_ENABLED" && value !== "true" && value !== "false") {
      return NextResponse.json({ error: "Value must be \"true\" or \"false\"." }, { status: 400 });
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json({ success: true, setting });
  } catch (error) {
    console.error("Update setting error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
