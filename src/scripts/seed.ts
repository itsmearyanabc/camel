import { prisma } from "../lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding Camel971database...");

  // Clear existing data (in correct order for foreign key constraints)
  await prisma.dispute.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.walletLedger.deleteMany({});
  await prisma.depositRequest.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. Create Users
  const salt = await bcrypt.genSalt(10);
  
  const adminPassword = process.env.ADMIN_PASSWORD || "admin2026";
  const staffPassword = "staff123";
  const customerPassword = "customer123";

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: await bcrypt.hash(adminPassword, salt),
      passwordPlain: adminPassword,
      role: "SUPERADMIN",
    },
  });

  const staff = await prisma.user.create({
    data: {
      username: "staff",
      passwordHash: await bcrypt.hash(staffPassword, salt),
      passwordPlain: staffPassword,
      role: "STAFF",
    },
  });

  const customer = await prisma.user.create({
    data: {
      username: "customer",
      passwordHash: await bcrypt.hash(customerPassword, salt),
      passwordPlain: customerPassword,
      role: "CUSTOMER",
    },
  });

  // Create wallets for ALL users (not just customer)
  await prisma.wallet.create({
    data: { userId: admin.id, balance: 0.0 },
  });
  await prisma.wallet.create({
    data: { userId: staff.id, balance: 0.0 },
  });
  await prisma.wallet.create({
    data: { userId: customer.id, balance: 500.0 },
  });

  console.log("Users & wallets seeded successfully.");

  // Seed default settings
  await prisma.setting.create({
    data: {
      key: "CRYPTO_WALLET_ADDRESS",
      value: process.env.CRYPTO_WALLET_ADDRESS || "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    },
  });

  console.log("Settings seeded successfully.");

  // 2. Create Categories
  const acids = await prisma.category.create({
    data: { name: "Acids", description: "Corrosive chemical compounds with pH < 7" },
  });

  const bases = await prisma.category.create({
    data: { name: "Bases", description: "Alkaline chemical compounds with pH > 7" },
  });

  const salts = await prisma.category.create({
    data: { name: "Salts", description: "Neutral ionic compounds formed by acid-base neutralization" },
  });

  const solvents = await prisma.category.create({
    data: { name: "Organic Solvents", description: "Carbon-based solvents for dissolution" },
  });

  console.log("Categories seeded successfully.");

  // 3. Create Products (Chemical Compounds)
  const productData = [
    {
      categoryId: acids.id,
      name: "Sulfuric Acid 98%",
      description: "Industrial grade concentrated sulfuric acid for chemistry labs.",
      price: 45.0,
      formula: "H2SO4",
      casNumber: "7664-93-9",
      stockState: "IN_STOCK",
    },
    {
      categoryId: acids.id,
      name: "Hydrochloric Acid 37%",
      description: "Laboratory grade hydrochloric acid for pH adjustment and cleaning.",
      price: 25.0,
      formula: "HCl",
      casNumber: "7647-01-0",
      stockState: "IN_STOCK",
    },
    {
      categoryId: bases.id,
      name: "Sodium Hydroxide (Lye) Pellets",
      description: "Anhydrous NaOH pellets, high purity 99%, for neutralization and soap making.",
      price: 18.5,
      formula: "NaOH",
      casNumber: "1310-73-2",
      stockState: "IN_STOCK",
    },
    {
      categoryId: salts.id,
      name: "Copper(II) Sulfate Pentahydrate",
      description: "Bright blue crystalline salt for analytical testing and agricultural use.",
      price: 32.0,
      formula: "CuSO4·5H2O",
      casNumber: "7758-99-8",
      stockState: "IN_STOCK",
    },
    {
      categoryId: solvents.id,
      name: "Acetone 99.9% Pure",
      description: "Aqueous-free pure organic solvent for cleaning laboratory glassware.",
      price: 22.0,
      formula: "CH3COCH3",
      casNumber: "67-64-1",
      stockState: "IN_STOCK",
    },
  ];

  const products = [];
  for (const p of productData) {
    const createdProduct = await prisma.product.create({ data: p });
    products.push(createdProduct);
  }

  console.log("Products seeded successfully.");

  // 4. Create FIFO Inventory Items (allocated in order of creation)
  for (const product of products) {
    for (let i = 1; i <= 5; i++) {
      await prisma.inventoryItem.create({
        data: {
          productId: product.id,
          data: `BATCH-${product.formula || "CHEM"}-${1000 + i} | Lab pickup locker: Shelf A${i}, code *9821#`,
          locationData: `Storage Bay ${String.fromCharCode(65 + i)}-${i * 10} | 45.4215° N, 75.6972° W`,
          isAllocated: false,
        },
      });
    }
  }

  console.log("FIFO Inventory Items seeded successfully.");
  console.log("========================================");
  console.log("Seeding complete!");
  console.log(`Admin login: admin / ${adminPassword} (SUPERADMIN)`);
  console.log("Staff login: staff / staff123 (STAFF)");
  console.log("Customer login: customer / customer123 (CUSTOMER, $500 balance)");
  console.log("========================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
