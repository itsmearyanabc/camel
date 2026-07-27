import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let disputes;

    if (["STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
      disputes = await prisma.dispute.findMany({
        include: {
          user: { select: { username: true, telegramUsername: true } },
          order: {
            include: {
              items: {
                include: {
                  product: true,
                }
              },
            },
          },
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      disputes = await prisma.dispute.findMany({
        where: { userId: session.userId },
        include: {
          order: {
            include: {
              items: {
                include: {
                  product: true,
                }
              },
            },
          },
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({ disputes });
  } catch (error) {
    console.error("Fetch disputes list error:", error);
    return NextResponse.json({ error: "Internal server error fetching disputes" }, { status: 500 });
  }
}
