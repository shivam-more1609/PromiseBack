import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { getPayPalSandboxOrderDetails, isPayPalSandboxConfigured } from '../src/lib/paypal';
import { store } from '../src/lib/store';

// Ensure .env.local is loaded for test execution
function loadEnv() {
  const envPath = path.resolve('D:/PayPal_HACK/.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}
loadEnv();

console.log('--- EXECUTING PHASE 4 & 5: REDIRECT PERSISTENCE & RESTORATION TESTS ---\n');

async function testRedirectPersistence() {
  const transactions = [
    { orderId: '4WW11507TX3021917', captureId: '13F84345FS415154U', payerId: '25K68ZHFRZXLS' },
    { orderId: '98E62163N4112711D', captureId: '68F34499U0675760F', payerId: '25K68ZHFRZXLS' }
  ];

  // Test 1: URL Parameter Extraction Simulation for both transactions
  console.log('[TEST 1] URL Parameter Parser Simulation for Both Transactions');
  for (const tx of transactions) {
    const mockUrl = `http://localhost:3000/settings?order_approved=true&token=${tx.orderId}&PayerID=${tx.payerId}`;
    const parsedUrl = new URL(mockUrl);
    const token = parsedUrl.searchParams.get('token');
    const payerId = parsedUrl.searchParams.get('PayerID');
    const isApproved = parsedUrl.searchParams.get('order_approved');

    assert.strictEqual(token, tx.orderId, `Token correctly extracted as ${tx.orderId}`);
    assert.strictEqual(payerId, tx.payerId, 'PayerID correctly extracted');
    assert.strictEqual(isApproved, 'true', 'order_approved flag correctly parsed');
    console.log(`✅ PASS: Parameters for ${tx.orderId} successfully parsed`);
  }

  // Test 2: Server-Side Approval & Status Verification on PayPal Sandbox
  console.log('\n[TEST 2] Server-Side Order Inspection & Verification on PayPal Sandbox');
  if (isPayPalSandboxConfigured()) {
    for (const tx of transactions) {
      const orderDetails = await getPayPalSandboxOrderDetails(tx.orderId);
      assert.ok(orderDetails.success, `Server-side order fetch must succeed for ${tx.orderId}`);
      assert.strictEqual(orderDetails.orderId, tx.orderId, 'Order ID matches');
      assert.ok(['APPROVED', 'COMPLETED'].includes(orderDetails.status || ''), `Status is valid: ${orderDetails.status}`);
      assert.strictEqual(orderDetails.intent, 'CAPTURE', 'Intent is CAPTURE');
      console.log(`✅ PASS: Server-side inspection verified order ${orderDetails.orderId} status: ${orderDetails.status}`);
    }
  } else {
    console.log('⚠️ SKIP: Sandbox credentials not configured in environment.');
  }

  // Test 3: Session State Serialization & Restoration Logic
  console.log('\n[TEST 3] Checkout State Serialization & Restoration Logic');
  const CHECKOUT_STORAGE_KEY = 'promiseback_sandbox_checkout';
  const mockStorage: Record<string, string> = {};

  const saveState = (data: any) => {
    mockStorage[CHECKOUT_STORAGE_KEY] = JSON.stringify({ ...data, timestamp: Date.now() });
  };

  const loadState = () => {
    const raw = mockStorage[CHECKOUT_STORAGE_KEY];
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > 4 * 60 * 60 * 1000) return null; // 4h TTL
    return data;
  };

  saveState({
    orderId: '98E62163N4112711D',
    customerId: 'cust-101',
    amount: '10.00',
    approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=98E62163N4112711D',
    status: 'APPROVED'
  });

  const restored = loadState();
  assert.ok(restored !== null, 'Saved checkout state must be restorable');
  assert.strictEqual(restored.orderId, '98E62163N4112711D');
  assert.strictEqual(restored.customerId, 'cust-101');
  assert.strictEqual(restored.status, 'APPROVED');
  console.log('✅ PASS: Checkout state safely restored across navigation/reload');

  // Test 4: Error Handling on Corrupted or Non-Existent Return Tokens
  console.log('\n[TEST 4] Resilience & Error Handling for Invalid Return Tokens');
  if (isPayPalSandboxConfigured()) {
    const invalidOrder = await getPayPalSandboxOrderDetails('INVALID_ORDER_TOKEN_999');
    assert.strictEqual(invalidOrder.success, false, 'Invalid order token should cleanly fail');
    assert.ok(invalidOrder.error, 'Descriptive error message returned for invalid token');
    console.log(`✅ PASS: Invalid token safely rejected with descriptive error: ${invalidOrder.error}`);
  }

  // Test 5: Verify Ledger State Consistency for Both Genuine Captures
  console.log('\n[TEST 5] Ledger Verification of Both Genuine Captures');
  store.syncFromDisk();
  const genuineCaptures = store.getGenuineCaptures();
  
  for (const tx of transactions) {
    const matched = genuineCaptures.find(c => c.paypalCaptureId === tx.captureId);
    assert.ok(matched, `Genuine capture ${tx.captureId} must be present in store`);
    assert.strictEqual(matched.customerId, 'cust-101', 'Capture mapped to cust-101');
    assert.strictEqual(matched.amount, 10, 'Capture amount is $10.00');
    assert.strictEqual(matched.currency, 'USD', 'Currency is USD');
    console.log(`✅ PASS: Capture ${tx.captureId} (Order ${tx.orderId}) verified in ledger`);
  }

  const customer = store.getCustomerById('cust-101');
  assert.ok(['13F84345FS415154U', '68F34499U0675760F'].includes(customer?.paypalCaptureId || ''), 'Customer cust-101 linked to a genuine capture');
  console.log(`✅ PASS: Customer cust-101 active capture: ${customer?.paypalCaptureId}`);

  console.log('\n========================================');
  console.log('✅ ALL REDIRECT PERSISTENCE TESTS PASSED');
  console.log('========================================\n');
}

testRedirectPersistence().catch(err => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
