import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Manage a product's weight/quantity variants ("2g", "3g", ...).
 *
 * Each variant is a child Product row: it carries its own price, its own
 * per-area stock and its own per-unit delivery media, so checkout, stock
 * reservation, coupons and delivery all work on it with zero special-casing.
 * The parent is the display shell (name, description, image, type).
 *
 * This endpoint reconciles the submitted list against the existing children:
 *   - rows with an id update that child's label/price (and derived name),
 *   - rows without an id create a new child,
 *   - existing children missing from the list are deleted — but ONLY if they
 *     have no order history. OrderItem.product cascades on product delete, so
 *     deleting a sold variant would silently erase real customers' order rows.
 *     Those must be zeroed out (stock 0) instead, which hides them from sale
 *     while keeping the history intact.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized. Only admins can manage variants." }, { status: 403 });
  }

  const { id: productId } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rows: Array<{ id?: string; label?: string; price?: unknown }> = Array.isArray(body?.variants)
    ? body.variants
    : [];

  if (rows.length > 20) {
    return NextResponse.json({ error: "A product can have at most 20 variants" }, { status: 400 });
  }

  // Validate every row before writing anything.
  const seenLabels = new Set<string>();
  const cleanRows: Array<{ id?: string; label: string; price: number }> = [];
  for (const row of rows) {
    const label = typeof row?.label === "string" ? row.label.trim() : "";
    const price = Number(row?.price);

    if (!label || label.length > 40) {
      return NextResponse.json({ error: "Each variant needs a label of 1-40 characters (e.g. \"2g\")" }, { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: `Variant "${label}" needs a price greater than 0` }, { status: 400 });
    }
    const key = label.toLowerCase();
    if (seenLabels.has(key)) {
      return NextResponse.json({ error: `Duplicate variant label "${label}"` }, { status: 400 });
    }
    seenLabels.add(key);
    cleanRows.push({
      id: typeof row.id === "string" && row.id ? row.id : undefined,
      label,
      price: Math.round(price * 100) / 100,
    });
  }

  const parent = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: { select: { id: true, variantLabel: true } },
      cities: { select: { id: true } },
      areas: { select: { id: true } },
    },
  });
  if (!parent) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (parent.parentProductId) {
    return NextResponse.json({ error: "A variant cannot have variants of its own" }, { status: 400 });
  }

  const existingIds = new Set(parent.variants.map((v) => v.id));

  // Every submitted id must belong to THIS parent - otherwise a crafted id
  // could rename/reprice an unrelated product.
  for (const row of cleanRows) {
    if (row.id && !existingIds.has(row.id)) {
      return NextResponse.json({ error: "Unknown variant id submitted" }, { status: 400 });
    }
  }

  const submittedIds = new Set(cleanRows.filter((r) => r.id).map((r) => r.id as string));
  const removedIds = parent.variants.filter((v) => !submittedIds.has(v.id)).map((v) => v.id);

  // Refuse the whole save if a removal would destroy order history. The admin
  // gets a clear instruction instead of a silent data loss.
  if (removedIds.length > 0) {
    const blocked = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: removedIds } },
    });
    if (blocked.length > 0) {
      const blockedLabels = parent.variants
        .filter((v) => blocked.some((b) => b.productId === v.id))
        .map((v) => v.variantLabel || v.id.slice(0, 8));
      return NextResponse.json(
        {
          error:
            `Cannot remove variant(s) ${blockedLabels.map((l) => `"${l}"`).join(", ")} - customers have ordered them. ` +
            `Set their stock to 0 instead to stop selling them.`,
        },
        { status: 400 }
      );
    }
  }

  const childName = (label: string) => `${parent.name} (${label})`;

  try {
    await prisma.$transaction(async (tx) => {
      // Deletions first so a label that moves between rows can't collide.
      if (removedIds.length > 0) {
        await tx.product.deleteMany({ where: { id: { in: removedIds }, parentProductId: parent.id } });
      }

      for (const row of cleanRows) {
        if (row.id) {
          await tx.product.update({
            where: { id: row.id },
            data: {
              variantLabel: row.label,
              name: childName(row.label),
              price: row.price,
              // Keep the shared display fields in step with the parent.
              description: parent.description,
              imageUrl: parent.imageUrl,
              productType: parent.productType,
              currency: parent.currency,
              categoryId: parent.categoryId,
            },
          });
        } else {
          await tx.product.create({
            data: {
              name: childName(row.label),
              parentProductId: parent.id,
              variantLabel: row.label,
              price: row.price,
              description: parent.description,
              imageUrl: parent.imageUrl,
              productType: parent.productType,
              currency: parent.currency,
              categoryId: parent.categoryId,
              // Start from the parent's locations so a new option is not born
              // invisible. It still sells nothing until stock is added against
              // an area, which is what actually gates availability.
              cities: parent.cities.length > 0
                ? { connect: parent.cities.map((c) => ({ id: c.id })) }
                : undefined,
              areas: parent.areas.length > 0
                ? { connect: parent.areas.map((a) => ({ id: a.id })) }
                : undefined,
              stockQuantity: 0,
            },
          });
        }
      }
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A product with one of these variant names already exists. Choose a different label." },
        { status: 400 }
      );
    }
    console.error("Variants update error:", e);
    return NextResponse.json({ error: "Failed to update variants" }, { status: 500 });
  }

  const variants = await prisma.product.findMany({
    where: { parentProductId: parent.id },
    select: { id: true, variantLabel: true, price: true, stockQuantity: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, variants });
}
