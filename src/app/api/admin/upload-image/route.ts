import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Uploads are served from our own origin, so the extension is what decides
    // the Content-Type the browser executes. Anything scriptable (.svg, .html)
    // would become stored XSS on the site, so only raster images are accepted
    // and the extension is taken from an allowlist rather than the filename.
    const ALLOWED: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPG, PNG, GIF or WebP." },
        { status: 400 }
      );
    }

    const MAX_BYTES = 8 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 8MB or smaller" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Create a unique filename
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
    
    const publicDir = path.join(process.cwd(), "public");
    const uploadsDir = path.join(publicDir, "uploads");
    const productsDir = path.join(uploadsDir, "products");

    // Ensure directories exist
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    if (!fs.existsSync(productsDir)) fs.mkdirSync(productsDir);

    const filePath = path.join(productsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `/uploads/products/${filename}`;

    return NextResponse.json({ success: true, url: imageUrl });
  } catch (err) {
    console.error("Image upload error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
