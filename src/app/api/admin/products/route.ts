import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyRestockSubscribersForArea } from "@/lib/restock";
import { deleteProductPermanently } from "@/lib/productDeletion";

export async function GET() {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    include: {
      category: { select: { id: true, name: true, prefixCode: true } },
      cities: { select: { id: true, name: true } },
      areas: { select: { id: true, name: true } },
      areaDetails: {
        include: {
          area: { select: { id: true, name: true } },
          stockItems: { where: { status: "AVAILABLE" }, orderBy: { createdAt: "asc" as const } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    products: products.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      originalPrice: p.originalPrice ?? null,
      currency: p.currency,
      formula: p.formula,
      casNumber: p.casNumber,
      imageUrl: p.imageUrl,
      stockQuantity: p.stockQuantity,
      productType: p.productType || null,
      parentProductId: p.parentProductId || null,
      variantLabel: p.variantLabel || null,
      categoryId: p.category?.id || null,
      categoryName: p.category?.name || null,
      cities: p.cities,
      areas: p.areas,
      areaDetails: p.areaDetails,
      createdAt: p.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized. Only admins can create products." }, { status: 403 });
  }

  const { name, description, price, originalPrice, formula, casNumber, imageUrl, productType, currency, stockQuantity, cityIds, areaIds, areaStocks } = await req.json();

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Product name must be at least 2 characters" }, { status: 400 });
  }
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Product with this name already exists" }, { status: 400 });
  }

  let totalStock = parseInt(stockQuantity || "0", 10);
  if (areaStocks && Array.isArray(areaStocks)) {
    totalStock = areaStocks.reduce((sum: number, a: any) => sum + (parseInt(a.quantity, 10) || 0), 0);
  }

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      price: parseFloat(price),
      originalPrice: originalPrice !== undefined && originalPrice !== null && originalPrice !== "" ? parseFloat(originalPrice) : null,
      currency: currency || "USD",
      formula: formula?.trim() || null,
      casNumber: casNumber?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      productType: productType?.trim() || null,
      stockQuantity: totalStock,
      cities: cityIds && cityIds.length > 0 ? { connect: cityIds.map((id: string) => ({ id })) } : undefined,
      areas: areaIds && areaIds.length > 0 ? { connect: areaIds.map((id: string) => ({ id })) } : undefined,
    },
  });

  if (areaStocks && Array.isArray(areaStocks)) {
    for (const { areaId, quantity } of areaStocks) {
      await prisma.productAreaDetail.create({
        data: {
          productId: product.id,
          areaId,
          stockQuantity: parseInt(quantity, 10) || 0,
        },
      });
    }
  }

  return NextResponse.json({ product });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { productId, name, description, price, originalPrice, formula, casNumber, imageUrl, currency, stockQuantity, cityIds, areaIds, productType, areaStocks } = await req.json();

  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
  if (!existingProduct) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (name && name.trim() !== existingProduct.name) {
    const nameConflict = await prisma.product.findUnique({ where: { name: name.trim() } });
    if (nameConflict) {
      return NextResponse.json({ error: "Another product with this name already exists" }, { status: 400 });
    }
  }

  if (price !== undefined && price <= 0) {
    return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
  }

  // Staff run inventory, not the catalogue: they may move stock and change where
  // a product is offered, but every descriptive/pricing field is admin-only.
  // Enforced here and not only in the UI, since the panel is just one caller.
  const isStaff = session.role === "STAFF";

  const updateData: any = {};

  if (!isStaff) {
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (originalPrice !== undefined) {
      updateData.originalPrice = originalPrice === null || originalPrice === "" ? null : parseFloat(originalPrice);
    }
    if (currency !== undefined) updateData.currency = currency;
    if (formula !== undefined) updateData.formula = formula?.trim() || null;
    if (casNumber !== undefined) updateData.casNumber = casNumber?.trim() || null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;
    if (productType !== undefined) updateData.productType = productType?.trim() || null;
  }

  if (cityIds !== undefined) {
    updateData.cities = { set: cityIds.map((id: string) => ({ id })) };
  }
  if (areaIds !== undefined) {
    updateData.areas = { set: areaIds.map((id: string) => ({ id })) };
  }

  // Un-selecting an area only detaches the `areas` relation, but the storefront
  // and the Telegram bot both offer delivery straight from ProductAreaDetail
  // rows. Left alone, a de-selected area keeps taking orders. Empty it out so
  // "not available here" actually means it - the ledger rows are kept.
  if (Array.isArray(areaIds)) {
    const orphaned = await prisma.productAreaDetail.findMany({
      where: { productId, areaId: { notIn: areaIds } },
      select: { id: true },
    });
    if (orphaned.length > 0) {
      const orphanedIds = orphaned.map((d) => d.id);
      await prisma.$transaction([
        prisma.stockItem.deleteMany({
          where: { productAreaDetailId: { in: orphanedIds }, status: "AVAILABLE" },
        }),
        prisma.productAreaDetail.updateMany({
          where: { id: { in: orphanedIds } },
          data: { stockQuantity: 0 },
        }),
      ]);
    }
  }

  // Handle area-wise stock allocation
  const restockedAreaIds: string[] = [];

  if (areaStocks && Array.isArray(areaStocks)) {
    // Read every "before" quantity in a single query. One round trip per area
    // is what made saving feel slow: this database is pooled and in another
    // region, so each of those cost ~150ms of pure latency and a product with
    // a handful of areas spent seconds doing nothing but waiting.
    //
    // The previous values still have to be read before anything is written -
    // this is the only step that sees them, and both the stock ledger and the
    // out-of-stock -> in-stock detection depend on them.
    const stockAreaIds = areaStocks.map((a: any) => a.areaId);
    const existingDetails = await prisma.productAreaDetail.findMany({
      where: { productId, areaId: { in: stockAreaIds } },
      select: { areaId: true, stockQuantity: true },
    });
    const prevByArea = new Map(existingDetails.map((d) => [d.areaId, d.stockQuantity]));

    // One batched round trip for all the upserts; results come back in order.
    const savedDetails = await prisma.$transaction(
      areaStocks.map(({ areaId, quantity }: any) =>
        prisma.productAreaDetail.upsert({
          where: { productId_areaId: { productId, areaId } },
          update: { stockQuantity: parseInt(quantity, 10) || 0 },
          create: { productId, areaId, stockQuantity: parseInt(quantity, 10) || 0 },
        })
      )
    );

    // Ledger rows for whatever actually moved, batched the same way.
    const ledgerWrites = [];
    for (let i = 0; i < areaStocks.length; i++) {
      const { areaId, quantity } = areaStocks[i];
      const newQty = parseInt(quantity, 10) || 0;
      const prevQty = prevByArea.get(areaId) ?? 0;

      if (newQty !== prevQty) {
        ledgerWrites.push(
          prisma.stockEntry.create({
            data: {
              productAreaDetailId: savedDetails[i].id,
              quantity: newQty - prevQty,
              type: newQty > prevQty ? "RESTOCK" : "ADJUSTMENT",
              notes: `Inventory edit - stock set to ${newQty} unit(s)`,
              createdBy: session.userId,
            },
          })
        );
      }

      if (prevQty <= 0 && newQty > 0) {
        restockedAreaIds.push(areaId);
      }
    }
    if (ledgerWrites.length > 0) await prisma.$transaction(ledgerWrites);

    // Auto-compute total stock as sum of all area stocks
    const allAreaDetails = await prisma.productAreaDetail.findMany({
      where: { productId },
      select: { stockQuantity: true },
    });
    const totalStock = allAreaDetails.reduce((sum: number, d: any) => sum + (d.stockQuantity || 0), 0);
    updateData.stockQuantity = totalStock;
  } else if (stockQuantity !== undefined) {
    // Fallback: direct stock quantity if no areaStocks provided
    updateData.stockQuantity = parseInt(stockQuantity, 10);
  }

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: updateData,
  });

  // Variant children display the parent's identity (name, description, image,
  // type) with only their label and price differing. When the parent's shared
  // fields change, push them down so the storefront and bot never show a
  // renamed parent alongside children still carrying the old name.
  if (!isStaff) {
    const children = await prisma.product.findMany({
      where: { parentProductId: productId },
      select: { id: true, variantLabel: true },
    });
    if (children.length > 0) {
      // Concurrent rather than batched: each child is independently allowed to
      // fail (a name collision must not undo the parent save that already
      // landed), so their latencies overlap instead of stacking up.
      const results = await Promise.allSettled(
        children.map((child) =>
          prisma.product.update({
            where: { id: child.id },
            data: {
              name: `${updatedProduct.name} (${child.variantLabel || ""})`.trim(),
              description: updatedProduct.description,
              imageUrl: updatedProduct.imageUrl,
              productType: updatedProduct.productType,
              currency: updatedProduct.currency,
              categoryId: updatedProduct.categoryId,
            },
          })
        )
      );
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          console.error(`Failed to sync variant ${children[i].id} with parent:`, result.reason?.code || result.reason);
        }
      });
    }
  }

  // Fire-and-forget once the write has landed: customers waiting on this
  // product in this area hear about it as soon as stock is added, exactly as
  // they used to when restocking went through the old stock-entry screen.
  for (const areaId of restockedAreaIds) {
    void notifyRestockSubscribersForArea(productId, areaId);
  }

  return NextResponse.json({ product: updatedProduct });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const productId = typeof body?.productId === "string" ? body.productId : "";
  // Opt-in override for cleaning up test data. Absent it, order history always
  // wins over a delete.
  const force = body?.force === true;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  // Deleting a product cascades to its OrderItems - and, now that quantity
  // options are child products, a parent delete cascades through every option
  // as well. That would erase real customers' order history (and the wallet
  // ledger's counterpart rows) in one click, so refuse when any of the rows
  // about to disappear has been ordered.
  const variantIds = (
    await prisma.product.findMany({
      where: { parentProductId: productId },
      select: { id: true },
    })
  ).map((v) => v.id);

  const orderedCount = await prisma.orderItem.count({
    where: { productId: { in: [productId, ...variantIds] } },
  });

  if (orderedCount > 0 && !force) {
    // `requiresForce` is what lets the control panel offer the override instead
    // of dead-ending the admin on an error they cannot act on. Test products
    // routinely pick up a few orders and there has to be a way to clear them.
    return NextResponse.json(
      {
        error:
          `This product has ${orderedCount} order(s) against it and cannot be deleted without ` +
          `destroying that order history. Set its stock to 0 instead to stop selling it.`,
        requiresForce: true,
        orderCount: orderedCount,
      },
      { status: 400 }
    );
  }

  if (orderedCount > 0) {
    // Irreversible and destroys customer records, so it is gated the same way
    // permanent user deletion is: the acting admin re-enters their own
    // password, and the role is re-read from the database so a demoted
    // account's still-valid cookie cannot be used to do this.
    const actor = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!actor || !["ADMIN", "SUPERADMIN"].includes(actor.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    if (!password) {
      return NextResponse.json(
        { error: "Your password is required to delete a product with order history" },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, actor.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const summary = await deleteProductPermanently(productId);

    console.warn(
      `[PRODUCT PURGED] ${actor.username} (${actor.role}) force-deleted "${summary.name}" - ` +
      `${summary.variantsDeleted} option(s), ${summary.orderItemsDeleted} order line(s), ` +
      `${summary.ordersDeleted} order(s) removed, ${summary.couponUsagesReleased} coupon use(s) released.`
    );

    return NextResponse.json({ success: true, forced: true, ...summary });
  }

  const summary = await deleteProductPermanently(productId);
  return NextResponse.json({ success: true, ...summary });
}
