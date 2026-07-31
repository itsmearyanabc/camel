/**
 * Route Verification Script
 * Tests all API routes to ensure they're working correctly
 */

import { config } from "dotenv";
config();

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

interface TestResult {
  route: string;
  method: string;
  status: "✅ PASS" | "❌ FAIL" | "⚠️ SKIP";
  statusCode?: number;
  message?: string;
}

const results: TestResult[] = [];

// Helper function to test a route
async function testRoute(
  route: string,
  method: string = "GET",
  expectedStatus: number[] = [200, 401, 403],
  body?: any
): Promise<void> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${route}`, options);
    const statusCode = response.status;

    if (expectedStatus.includes(statusCode)) {
      results.push({
        route,
        method,
        status: "✅ PASS",
        statusCode,
        message: "Route accessible",
      });
    } else {
      results.push({
        route,
        method,
        status: "❌ FAIL",
        statusCode,
        message: `Unexpected status code: ${statusCode}`,
      });
    }
  } catch (error: any) {
    results.push({
      route,
      method,
      status: "❌ FAIL",
      message: error.message,
    });
  }
}

async function runTests() {
  console.log("🧪 Starting Route Verification...\n");
  console.log(`Base URL: ${BASE_URL}\n`);

  // ============================================
  // 1. AUTHENTICATION ROUTES
  // ============================================
  console.log("📝 Testing Authentication Routes...");
  await testRoute("/api/auth/login", "POST", [400, 401, 429], {
    username: "test",
    password: "test",
  });
  await testRoute("/api/auth/register", "POST", [400, 429], {
    username: "test",
    password: "test",
  });
  await testRoute("/api/auth/change-password", "POST", [401]);

  // ============================================
  // 2. ADMIN ROUTES (Should require auth)
  // ============================================
  console.log("🔐 Testing Admin Routes...");
  await testRoute("/api/admin/users", "GET", [401, 403]);
  await testRoute("/api/admin/employees", "GET", [401, 403]);
  await testRoute("/api/admin/orders", "GET", [401, 403]);
  await testRoute("/api/admin/products", "GET", [401, 403]);
  await testRoute("/api/admin/categories", "GET", [401, 403]);
  await testRoute("/api/admin/coupons", "GET", [401, 403]);
  await testRoute("/api/admin/locations", "GET", [401, 403]);
  await testRoute("/api/admin/stock-entries", "GET", [401, 403]);
  await testRoute("/api/admin/staff-activity", "GET", [401, 403]);

  // ============================================
  // 3. CLIENT-ADMIN ROUTES (Staff access)
  // ============================================
  console.log("👥 Testing Client-Admin Routes...");
  await testRoute("/api/client-admin/users", "GET", [401, 403]);
  await testRoute("/api/client-admin/orders", "GET", [401, 403]);

  // ============================================
  // 4. USER ROUTES
  // ============================================
  console.log("👤 Testing User Routes...");
  await testRoute("/api/orders", "GET", [401]);
  await testRoute("/api/wallet", "GET", [401]);
  await testRoute("/api/notifications", "GET", [401]);
  await testRoute("/api/dashboard", "GET", [401]);

  // ============================================
  // 5. PUBLIC ROUTES
  // ============================================
  console.log("🌐 Testing Public Routes...");
  await testRoute("/api/health", "GET", [200]);
  await testRoute("/api/inventory", "GET", [200, 401]);

  // ============================================
  // 6. WEBHOOK ROUTES
  // ============================================
  console.log("🔗 Testing Webhook Routes...");
  await testRoute("/api/webhooks/telegram", "POST", [400, 401]);
  await testRoute("/api/webhooks/coinbase", "POST", [400, 401]);

  // ============================================
  // 7. CRON ROUTES
  // ============================================
  console.log("⏰ Testing Cron Routes...");
  await testRoute("/api/cron/process-cooldowns", "GET", [401, 403]);

  // ============================================
  // PRINT RESULTS
  // ============================================
  console.log("\n" + "=".repeat(80));
  console.log("📊 TEST RESULTS");
  console.log("=".repeat(80) + "\n");

  const passed = results.filter((r) => r.status === "✅ PASS").length;
  const failed = results.filter((r) => r.status === "❌ FAIL").length;
  const skipped = results.filter((r) => r.status === "⚠️ SKIP").length;

  results.forEach((result) => {
    console.log(
      `${result.status} ${result.method.padEnd(6)} ${result.route.padEnd(50)} ${
        result.statusCode ? `[${result.statusCode}]` : ""
      } ${result.message || ""}`
    );
  });

  console.log("\n" + "=".repeat(80));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Skipped: ${skipped}`);
  console.log(`📊 Total: ${results.length}`);
  console.log("=".repeat(80) + "\n");

  if (failed === 0) {
    console.log("🎉 All routes are working correctly!\n");
  } else {
    console.log("⚠️  Some routes failed. Please check the errors above.\n");
  }
}

// Run tests
runTests().catch(console.error);
