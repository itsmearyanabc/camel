import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("cryptomus=2b995505", {
    status: 200,
    headers: {
      "Content-Type": "text/html",
    },
  });
}
