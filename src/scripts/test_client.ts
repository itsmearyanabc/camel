import { prisma } from "../lib/db";
import bcrypt from "bcryptjs";

async function runAcceptanceTest() {
  console.log("=================================================");
  console.log("   Camel971- 100 CONSECUTIVE ORDERS TEST     ");
  console.log("=================================================");

  try {
    // 1. Clean up or set up a test user
    const username = `test_runner_${Date.now()}`;
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash("testpass123", salt);

    console.log(`Creating test customer account: ${username}`);
    const testUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "CUSTOMER",
      },
    });

    // Seed wallet with plenty of test credit ($5,000)
    const initialBalance = 5000.0;
    const testWallet = await prisma.wallet.create({
      data: {
        userId: testUser.id,
        balance: initialBalance,
      },
    });

    // 2. Create a test product
    const productPrice = 20.0;
    console.log("Creating test chemical product for purchase...");
    const testCategory = await prisma.category.create({
      data: {
        name: `TestCategory_${Date.now()}`,
        description: "Temporary testing category",
      },
    });

    const testProduct = await prisma.product.create({
      data: {
        categoryId: testCategory.id,
        name: `TestChemical_${Date.now()}`,
        description: "Test chemical compound CAS-999-99-9",
        price: productPrice,
        formula: "TstChem",
        casNumber: "999-99-9",
        stockState: "IN_STOCK",
      },
    });

    // 3. Seed exactly 100 distinct FIFO items
    console.log("Seeding exactly 100 FIFO inventory items with serial codes...");
    const totalTestItems = 100;
    for (let i = 1; i <= totalTestItems; i++) {
      await prisma.inventoryItem.create({
        data: {
          productId: testProduct.id,
          // We include the creation order index in the batch data so we can verify FIFO allocation order
          data: `BATCH-SERIAL-NO-${String(i).padStart(3, "0")}`,
          locationData: `Test locker shelf row ${i}`,
          isAllocated: false,
        },
      });
    }

    console.log("Seeding complete. Starting 100 consecutive purchase orders...");

    // Keep track of allocation order to verify FIFO sequence
    const allocatedSerials: string[] = [];

    // 4. Run 100 consecutive transactions
    for (let orderNum = 1; orderNum <= totalTestItems; orderNum++) {
      // Execute the exact transactional logic used in checkout API
      const resultOrder = await prisma.$transaction(async (tx) => {
        // Fetch wallet
        const wallet = await tx.wallet.findUnique({
          where: { userId: testUser.id },
        });

        if (!wallet || Number(wallet.balance) < Number(testProduct.price)) {
          throw new Error(`Order #${orderNum}: Insufficient wallet balance`);
        }

        // Fetch oldest unallocated item (FIFO)
        const item = await tx.inventoryItem.findFirst({
          where: { productId: testProduct.id, isAllocated: false },
          orderBy: { createdAt: "asc" }, // Oldest first
        });

        if (!item) {
          throw new Error(`Order #${orderNum}: Out of stock error`);
        }

        // Deduct balance
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: Number(testProduct.price) } },
        });

        // Add ledger record
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "PURCHASE",
            amount: -Number(testProduct.price),
            description: `Test purchase #${orderNum} of product ${testProduct.name}`,
          },
        });

        // Mark item as allocated
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            isAllocated: true,
            allocatedAt: new Date(),
          },
        });

        // Create Order record
        const createdOrder = await tx.order.create({
          data: {
            userId: testUser.id,
            totalAmount: Number(testProduct.price),
            status: "READY", // Short-circuit cooldown for immediate test evaluation
            items: {
              create: [
                {
                  productId: testProduct.id,
                  inventoryItemId: item.id,
                  priceAtPurchase: Number(testProduct.price),
                  status: "READY",
                }
              ]
            }
          },
        });

        return { order: createdOrder, itemSerial: item.data };
      });

      allocatedSerials.push(resultOrder.itemSerial);
      
      if (orderNum % 20 === 0) {
        console.log(` -> Processed ${orderNum}/100 successful test orders...`);
      }
    }

    console.log("\nAll 100 orders processed. Starting database audit...");

    // 5. Verification audits
    // Audit A: Verify wallet balance
    const finalWallet = await prisma.wallet.findUnique({
      where: { userId: testUser.id },
    });
    const expectedBalance = initialBalance - (productPrice * totalTestItems);
    const balanceMatch = finalWallet && Math.abs(Number(finalWallet.balance) - expectedBalance) < 0.01;
    
    console.log(`Audit A (Wallet Balance): Expected: $${expectedBalance.toFixed(2)}, Actual: $${Number(finalWallet?.balance ?? 0).toFixed(2)} - ${balanceMatch ? "SUCCESS ✅" : "FAIL ❌"}`);

    // Audit B: Verify total orders created
    const totalUserOrders = await prisma.order.count({
      where: { userId: testUser.id },
    });
    const ordersMatch = totalUserOrders === totalTestItems;
    console.log(`Audit B (Order Count): Expected: ${totalTestItems}, Actual: ${totalUserOrders} - ${ordersMatch ? "SUCCESS ✅" : "FAIL ❌"}`);

    // Audit C: Verify total ledger records
    const totalLedgers = await prisma.walletLedger.count({
      where: { walletId: testWallet.id },
    });
    const ledgersMatch = totalLedgers === totalTestItems;
    console.log(`Audit C (Ledger Actions): Expected: ${totalTestItems}, Actual: ${totalLedgers} - ${ledgersMatch ? "SUCCESS ✅" : "FAIL ❌"}`);

    // Audit D: Verify FIFO allocation order
    let fifoSuccess = true;
    for (let i = 0; i < totalTestItems; i++) {
      const expectedSerial = `BATCH-SERIAL-NO-${String(i + 1).padStart(3, "0")}`;
      if (allocatedSerials[i] !== expectedSerial) {
        console.log(`Mismatch at index ${i}: Expected ${expectedSerial}, got ${allocatedSerials[i]}`);
        fifoSuccess = false;
        break;
      }
    }
    console.log(`Audit D (FIFO Allocation Sequence): ${fifoSuccess ? "SUCCESS ✅" : "FAIL ❌"}`);

    // 6. Final Status
    if (balanceMatch && ordersMatch && ledgersMatch && fifoSuccess) {
      console.log("\n=================================================");
      console.log("  RESULT: 100 CONSECUTIVE TEST ORDERS PASSED! 🎉 ");
      console.log("  No critical failures or double allocations.    ");
      console.log("=================================================");
    } else {
      console.error("\n=================================================");
      console.error("  RESULT: TEST FAILED. Audits did not match. ❌  ");
      console.error("=================================================");
      process.exit(1);
    }
  } catch (error) {
    console.error("\nCRITICAL FAILURE DURING TEST EXECUTION:");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAcceptanceTest();
