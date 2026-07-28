import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orders = await prisma.order.findMany({
      include: {
        user: { 
          select: { 
            username: true, 
            telegramUsername: true,
            telegramId: true,
            passwordPlain: session.role !== "STAFF",
          } 
        },
        items: {
          include: { 
            product: { select: { name: true, price: true } },
          }
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Client Admin fetch orders error:", error);
    return NextResponse.json({ error: "Internal server error fetching orders" }, { status: 500 });
  }
}
