import { prisma } from "../lib/db";

async function main() {
  console.log("Removing all previous customer accounts...");
  
  // Delete all users with the role 'CUSTOMER'
  const result = await prisma.user.deleteMany({
    where: {
      role: "CUSTOMER"
    }
  });

  console.log(`Successfully removed ${result.count} customer(s).`);
  console.log("Fresh start ready!");
}

main()
  .catch((e) => {
    console.error("Error wiping customers:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

