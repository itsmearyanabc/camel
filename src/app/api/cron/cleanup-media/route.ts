import { NextResponse } from "next/server";
import { cleanupExpiredDeliveryMedia, MEDIA_RETENTION_DAYS } from "@/lib/mediaRetention";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Removes pickup photos/videos belonging to orders that completed more than
 * MEDIA_RETENTION_DAYS ago, so uploaded media does not accumulate on the disk
 * forever. Files still referenced by an area template, an unsold unit, or a
 * newer order are kept - see cleanupExpiredDeliveryMedia.
 */
export async function GET(req: Request) {
  // The empty-secret check matters: without it an unset CRON_SECRET makes
  // `Authorization: Bearer ` a valid credential and leaves this open to anyone.
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupExpiredDeliveryMedia();
  return NextResponse.json({ success: true, retentionDays: MEDIA_RETENTION_DAYS, ...result });
}
