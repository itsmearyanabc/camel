import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import fs from "fs";
import path from "path";

/**
 * Upload delivery media (images/videos) for per-unit pickup details.
 *
 * STAFF is allowed here (unlike product images): per-unit delivery details are
 * inventory work and staff already manage them through the area-details route.
 *
 * The 50MB video cap is deliberate: Telegram's Bot API rejects uploads above
 * 50MB, and these files are sent to the customer's Telegram after cooldown.
 * Capping at upload time guarantees every stored file is deliverable on both
 * surfaces instead of silently failing on one of them later.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Extension comes from a MIME allowlist, never from the client filename —
    // uploads are served from our own origin, so a scriptable extension
    // (.svg, .html) would be stored XSS.
    const IMAGE_TYPES: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    const VIDEO_TYPES: Record<string, string> = {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    };

    const isImage = file.type in IMAGE_TYPES;
    const isVideo = file.type in VIDEO_TYPES;

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: "Unsupported file type. Images: JPG, PNG, GIF, WebP. Videos: MP4, WebM, MOV." },
        { status: 400 }
      );
    }

    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: isImage ? "Image must be 8MB or smaller" : "Video must be 50MB or smaller (Telegram limit)" },
        { status: 400 }
      );
    }

    const ext = isImage ? IMAGE_TYPES[file.type] : VIDEO_TYPES[file.type];
    const buffer = Buffer.from(await file.arrayBuffer());

    const deliveryDir = path.join(process.cwd(), "public", "uploads", "delivery");
    fs.mkdirSync(deliveryDir, { recursive: true });

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
    fs.writeFileSync(path.join(deliveryDir, filename), buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/delivery/${filename}`,
      type: isImage ? "image" : "video",
    });
  } catch (err) {
    console.error("Delivery media upload error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
