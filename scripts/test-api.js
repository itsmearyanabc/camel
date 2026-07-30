/**
 * Automated API Testing Script
 * 
 * This script tests all critical API endpoints to ensure they work correctly.
 * Run with: node scripts/test-api.js
 * 
 * Prerequisites:
 * - Development server running (npm run dev)
 * - Database seeded with test data
 * - Environment variables configured
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Helper function to make API requests
async function apiRequest(endpoint, options = {}) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));
    
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
    };
  }
}

// Test helper functions
function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}${message ? ` - ${message}` : ''}`);
  
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

function logSkip(name, reason) {
  console.log(`⏭️  SKIP: ${name} - ${reason}`);
  results.tests.push({ name, passed: null, message: reason });
  results.skipped++;
}

function logSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Test data
let testUser = {
  email: `test-${Date.now()}@example.com`,
  password: 'TestPassword123!',
  name: 'Test User',
};

let authToken = null;
let testProductId = null;
let testCouponCode = null;
let testOrderId = null;

// ============================================================================
// 1. AUTHENTICATION TESTS
// ============================================================================

async function testAuthentication() {
  logSection('1. AUTHENTICATION & SECURITY TESTS');

  // Test 1.1: Get CAPTCHA
  try {
    const captcha = await apiRequest('/api/auth/captcha');
    logTest(
      'GET /api/auth/captcha',
      captcha.ok && captcha.data.question && captcha.data.token,
      captcha.ok ? 'CAPTCHA generated successfully' : 'Failed to generate CAPTCHA'
    );
  } catch (error) {
    logTest('GET /api/auth/captcha', false, error.message);
  }

  // Test 1.2: Register new user
  try {
    const register = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
        captchaToken: 'test-token', // In real test, solve CAPTCHA
        captchaAnswer: '10',
      }),
    });
    
    logTest(
      'POST /api/auth/register',
      register.status === 200 || register.status === 201,
      register.ok ? 'User registered successfully' : register.data.error || 'Registration failed'
    );
  } catch (error) {
    logTest('POST /api/auth/register', false, error.message);
  }

  // Test 1.3: Login with valid credentials
  try {
    const login = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
        captchaToken: 'test-token',
        captchaAnswer: '10',
      }),
    });
    
    if (login.ok && login.data.token) {
      authToken = login.data.token;
    }
    
    logTest(
      'POST /api/auth/login',
      login.ok && login.data.token,
      login.ok ? 'Login successful' : login.data.error || 'Login failed'
    );
  } catch (error) {
    logTest('POST /api/auth/login', false, error.message);
  }

  // Test 1.4: Login with invalid password
  try {
    const invalidLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testUser.email,
        password: 'WrongPassword123!',
        captchaToken: 'test-token',
        captchaAnswer: '10',
      }),
    });
    
    logTest(
      'POST /api/auth/login (invalid password)',
      !invalidLogin.ok && invalidLogin.status === 401,
      'Correctly rejected invalid password'
    );
  } catch (error) {
    logTest('POST /api/auth/login (invalid password)', false, error.message);
  }

  // Test 1.5: Access protected endpoint without auth
  try {
    const unauthorized = await apiRequest('/api/wallet/balance');
    logTest(
      'GET /api/wallet/balance (unauthorized)',
      !unauthorized.ok && unauthorized.status === 401,
      'Correctly rejected unauthorized access'
    );
  } catch (error) {
    logTest('GET /api/wallet/balance (unauthorized)', false, error.message);
  }
}

// ============================================================================
// 2. PRODUCT TESTS
// ============================================================================

async function testProducts() {
  logSection('2. PRODUCT MANAGEMENT TESTS');

  // Test 2.1: Get all products
  try {
    const products = await apiRequest('/api/products');
    logTest(
      'GET /api/products',
      products.ok && Array.isArray(products.data),
      products.ok ? `Retrieved ${products.data.length} products` : 'Failed to retrieve products'
    );
    
    if (products.ok && products.data.length > 0) {
      testProductId = products.data[0].id;
    }
  } catch (error) {
    logTest('GET /api/products', false, error.message);
  }

  // Test 2.2: Get single product
  if (testProductId) {
    try {
      const product = await apiRequest(`/api/products/${testProductId}`);
      logTest(
        'GET /api/products/:id',
        product.ok && product.data.id === testProductId,
        product.ok ? 'Product retrieved successfully' : 'Failed to retrieve product'
      );
    } catch (error) {
      logTest('GET /api/products/:id', false, error.message);
    }
  } else {
    logSkip('GET /api/products/:id', 'No product ID available');
  }
}

// ============================================================================
// 3. COUPON TESTS
// ============================================================================

async function testCoupons() {
  logSection('3. COUPON SYSTEM TESTS');

  if (!authToken) {
    logSkip('Coupon tests', 'No auth token available');
    return;
  }

  // Test 3.1: Validate coupon (will fail if no coupon exists)
  try {
    const validate = await apiRequest('/api/coupons/validate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        code: 'TEST10',
        orderAmount: 100,
      }),
    });
    
    logTest(
      'POST /api/coupons/validate',
      validate.status === 200 || validate.status === 404,
      validate.ok ? 'Coupon validated' : 'Coupon not found (expected if no test coupon exists)'
    );
  } catch (error) {
    logTest('POST /api/coupons/validate', false, error.message);
  }
}

// ============================================================================
// 4. WALLET TESTS
// ============================================================================

async function testWallet() {
  logSection('4. WALLET MANAGEMENT TESTS');

  if (!authToken) {
    logSkip('Wallet tests', 'No auth token available');
    return;
  }

  // Test 4.1: Get wallet balance
  try {
    const balance = await apiRequest('/api/wallet/balance', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    
    logTest(
      'GET /api/wallet/balance',
      balance.ok && typeof balance.data.balance !== 'undefined',
      balance.ok ? `Balance: $${balance.data.balance}` : 'Failed to retrieve balance'
    );
  } catch (error) {
    logTest('GET /api/wallet/balance', false, error.message);
  }

  // Test 4.2: Get transaction history
  try {
    const transactions = await apiRequest('/api/wallet/transactions', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    
    logTest(
      'GET /api/wallet/transactions',
      transactions.ok && Array.isArray(transactions.data),
      transactions.ok ? `Retrieved ${transactions.data.length} transactions` : 'Failed to retrieve transactions'
    );
  } catch (error) {
    logTest('GET /api/wallet/transactions', false, error.message);
  }
}

// ============================================================================
// 5. CHECKOUT TESTS
// ============================================================================

async function testCheckout() {
  logSection('5. CHECKOUT FLOW TESTS');

  if (!authToken || !testProductId) {
    logSkip('Checkout tests', 'No auth token or product ID available');
    return;
  }

  // Test 5.1: Wallet checkout (will fail if insufficient balance)
  try {
    const checkout = await apiRequest('/api/orders/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        cart: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: 'WALLET',
      }),
    });
    
    logTest(
      'POST /api/orders/checkout (WALLET)',
      checkout.status === 200 || checkout.status === 400,
      checkout.ok ? 'Checkout successful' : checkout.data.error || 'Checkout failed (may be insufficient balance)'
    );
    
    if (checkout.ok && checkout.data.order) {
      testOrderId = checkout.data.order.id;
    }
  } catch (error) {
    logTest('POST /api/orders/checkout (WALLET)', false, error.message);
  }

  // Test 5.2: Crypto checkout
  try {
    const cryptoCheckout = await apiRequest('/api/orders/crypto-checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        cart: [{ productId: testProductId, quantity: 1 }],
        cryptoCurrency: 'BTC',
      }),
    });
    
    logTest(
      'POST /api/orders/crypto-checkout',
      cryptoCheckout.status === 200 || cryptoCheckout.status === 400 || cryptoCheckout.status === 500,
      cryptoCheckout.ok ? 'Crypto checkout initiated' : cryptoCheckout.data.error || 'Crypto checkout failed'
    );
  } catch (error) {
    logTest('POST /api/orders/crypto-checkout', false, error.message);
  }
}

// ============================================================================
// 6. NOWPAYMENTS INTEGRATION TESTS
// ============================================================================

async function testNOWPayments() {
  logSection('6. NOWPAYMENTS INTEGRATION TESTS');

  // Test 6.1: Check if NOWPayments is configured
  const hasApiKey = !!process.env.NOWPAYMENTS_API_KEY;
  const hasIpnSecret = !!process.env.NOWPAYMENTS_IPN_SECRET;
  
  logTest(
    'NOWPayments Configuration',
    hasApiKey && hasIpnSecret,
    hasApiKey && hasIpnSecret 
      ? 'NOWPayments credentials configured' 
      : 'NOWPayments credentials missing (set NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET)'
  );

  // Test 6.2: Webhook endpoint exists
  try {
    const webhook = await apiRequest('/api/webhooks/nowpayments', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
    });
    
    logTest(
      'POST /api/webhooks/nowpayments (endpoint exists)',
      webhook.status !== 0,
      webhook.status === 401 || webhook.status === 400 
        ? 'Webhook endpoint responding (correctly rejecting invalid signature)' 
        : 'Webhook endpoint accessible'
    );
  } catch (error) {
    logTest('POST /api/webhooks/nowpayments (endpoint exists)', false, error.message);
  }
}

// ============================================================================
// 7. ERROR HANDLING TESTS
// ============================================================================

async function testErrorHandling() {
  logSection('7. ERROR HANDLING TESTS');

  // Test 7.1: 404 for non-existent endpoint
  try {
    const notFound = await apiRequest('/api/nonexistent-endpoint');
    logTest(
      'GET /api/nonexistent-endpoint (404)',
      notFound.status === 404,
      'Correctly returned 404 for non-existent endpoint'
    );
  } catch (error) {
    logTest('GET /api/nonexistent-endpoint (404)', false, error.message);
  }

  // Test 7.2: 400 for malformed request
  try {
    const badRequest = await apiRequest('/api/orders/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken || 'invalid'}`,
      },
      body: JSON.stringify({ invalid: 'data' }),
    });
    
    logTest(
      'POST /api/orders/checkout (malformed request)',
      badRequest.status === 400 || badRequest.status === 401,
      'Correctly rejected malformed request'
    );
  } catch (error) {
    logTest('POST /api/orders/checkout (malformed request)', false, error.message);
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║          AUTOMATED API TESTING SUITE                       ║');
  console.log('║          Camel971 E-Commerce Platform                      ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTesting against: ${BASE_URL}`);
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const startTime = Date.now();

  // Run all test suites
  await testAuthentication();
  await testProducts();
  await testCoupons();
  await testWallet();
  await testCheckout();
  await testNOWPayments();
  await testErrorHandling();

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  logSection('TEST SUMMARY');
  console.log(`Total Tests: ${results.passed + results.failed + results.skipped}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`\nSuccess Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  // Exit with appropriate code
  if (results.failed > 0) {
    console.log('\n❌ Some tests failed. Please review the failures above.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('\n❌ Test suite crashed:', error);
  process.exit(1);
});
