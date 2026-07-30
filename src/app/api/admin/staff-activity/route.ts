import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get("staffId");

    if (!staffId) {
      return NextResponse.json({ error: "Staff ID is required" }, { status: 400 });
    }

    // For now, we'll return a mock activity log
    // In a real implementation, you would create a StaffActivity table in Prisma
    // and track actions like login, order updates, product changes, etc.
    
    // Mock activity data
    const activity = [
      {
        id: "1",
        staffId,
        action: "LOGIN",
        details: "Logged in successfully",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      },
      {
        id: "2",
        staffId,
        action: "ORDER_UPDATE",
        details: "Updated order status to COMPLETED",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      },
      {
        id: "3",
        staffId,
        action: "PRODUCT_UPDATE",
        details: "Modified product inventory",
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      },
    ];

    return NextResponse.json({ activity });
  } catch (e) {
    console.error("GET /api/admin/staff-activity error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST endpoint to log staff activity (can be called from various actions)
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, details } = body;

    if (!action || !details) {
      return NextResponse.json({ error: "Action and details are required" }, { status: 400 });
    }

    // In a real implementation, you would save this to a StaffActivity table
    // For now, we'll just return success
    console.log(`Staff Activity: ${session.username} - ${action}: ${details}`);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/staff-activity error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
