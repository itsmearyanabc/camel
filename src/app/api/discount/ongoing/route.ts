import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOngoingDiscount } from "@/lib/ongoingDiscount";

// The value changes the moment an admin toggles it, so it must never be served
// from a cache - a customer seeing a stale percentage would be quoted a total
// the server then refuses to charge.
export const dynamic = "force-dynamic";

/**
 * The store-wide discount, for display in the cart.
 *
 * Read-only and advisory: the checkout endpoints re-read this server-side and
 * compute the charge themselves, so a tampered response here changes what the
 * customer is shown and nothing about what they pay.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const discount = await getOngoingDiscount();
  return NextResponse.json({ enabled: discount.enabled, percent: discount.percent });
}
