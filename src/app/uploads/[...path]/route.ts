import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

/** Node fs streams must be converted to web streams for the Response body. */
function toWebStream(stream: fs.ReadStream): ReadableStream {
  return Readable.toWeb(stream) as unknown as ReadableStream;
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathArray } = await params;
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const filePath = path.resolve(uploadsRoot, ...pathArray);

  // The path segments come straight from the URL, so confirm the resolved file
  // is still inside the uploads directory - otherwise a "../" segment that
  // survives decoding would read arbitrary files from the server.
  if (filePath !== uploadsRoot && !filePath.startsWith(uploadsRoot + path.sep)) {
    return new NextResponse("File not found", { status: 404 });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new NextResponse("File not found", { status: 404 });
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const { size } = fs.statSync(filePath);
    const isVideo = contentType.startsWith("video/");

    // Videos are served with Range support: Safari (and iOS in particular)
    // refuses to play <video> sources whose server ignores Range requests, and
    // streaming a slice also avoids buffering a 50MB file per request.
    const rangeHeader = req.headers.get("range");
    if (isVideo && rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match && (match[1] !== "" || match[2] !== "")) {
        let start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1]);
        let end = match[1] !== "" && match[2] !== "" ? Number(match[2]) : size - 1;
        if (end > size - 1) end = size - 1;

        if (start > end || start >= size) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}` },
          });
        }

        const stream = fs.createReadStream(filePath, { start, end });
        return new NextResponse(toWebStream(stream), {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    if (isVideo) {
      const stream = fs.createReadStream(filePath);
      return new NextResponse(toWebStream(stream), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Uploads serve error:", error);
    return new NextResponse("Error reading file", { status: 500 });
  }
}
