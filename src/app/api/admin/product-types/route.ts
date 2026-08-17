import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Remove a product type from the catalogue.
 *
 * Product types are not a table of their own: `productType` is a free-text
 * column on Product, and the admin dropdown is built from the distinct values
 * currently in use (see productTypeOptions in ProductManagement.tsx). So
 * "deleting a type" means clearing it off every product that carries it, after
 * which it stops appearing in the list. The products themselves are untouched.
 *
 * Admin-only: productType is a catalogue field, and staff manage stock rather
 * than the catalogue - the same split PUT /api/admin/products enforces.
 *
 * Body: { type: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json(
        { error: "Unauthorized. Only admins can manage product types." },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const type = typeof body?.type === "string" ? body.type.trim() : "";
    if (!type) {
      return NextResponse.json({ error: "Product type is required" }, { status: 400 });
    }

    // Exact match on purpose. Two types differing only in case ("burial" and
    // "Burial") are two separate entries in the dropdown, so removing one must
    // never quietly take the other with it.
    const cleared = await prisma.product.updateMany({
      where: { productType: type },
      data: { productType: null },
    });

    return NextResponse.json({ success: true, type, cleared: cleared.count });
  } catch (error) {
    console.error("Delete product type error:", error);
    return NextResponse.json({ error: "Failed to remove product type" }, { status: 500 });
  }
}
