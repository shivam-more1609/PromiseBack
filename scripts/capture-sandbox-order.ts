import { capturePayPalSandboxOrder, getPayPalSandboxOrderDetails } from '../src/lib/paypal';
import { store } from '../src/lib/store';

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: npx tsx scripts/capture-sandbox-order.ts <orderId> [customerId]');
    process.exit(1);
  }
  const customerId = process.argv[3] || 'cust-101';

  console.log(`\n========================================`);
  console.log(`PROMISEBACK SANDBOX ORDER CAPTURE CLI`);
  console.log(`========================================`);
  console.log(`Order ID:    ${orderId}`);
  console.log(`Customer ID: ${customerId}\n`);

  console.log(`[Step 1] Inspecting order status on PayPal Sandbox...`);
  const orderDetails = await getPayPalSandboxOrderDetails(orderId);
  if (!orderDetails.success) {
    console.error(`❌ Failed to retrieve order: ${orderDetails.error}`);
    process.exit(1);
  }

  console.log(`Order Status: ${orderDetails.status}`);
  if (orderDetails.status === 'CREATED') {
    console.log(`\n⚠️ ORDER NOT YET APPROVED BY BUYER.`);
    console.log(`Please open the approval URL in your browser, log in with a PayPal Sandbox Personal buyer account, and complete checkout:`);
    console.log(`\n👉 https://www.sandbox.paypal.com/checkoutnow?token=${orderId}\n`);
    console.log(`After approving, run this script again to capture the payment.`);
    process.exit(0);
  }

  console.log(`\n[Step 2] Order is ${orderDetails.status}. Triggering capture on PayPal...`);
  const captureResult = await capturePayPalSandboxOrder({ orderId });

  if (!captureResult.success) {
    console.error(`❌ Capture failed: ${captureResult.error}`);
    console.error(`Raw PayPal Response:`, JSON.stringify(captureResult.rawResponse, null, 2));
    process.exit(1);
  }

  console.log(`✅ CAPTURE SUCCESSFUL!`);
  console.log(`Capture ID:   ${captureResult.captureId}`);
  console.log(`Status:       ${captureResult.status}`);
  console.log(`Amount:       $${captureResult.amount?.toFixed(2)} ${captureResult.currency}`);

  console.log(`\n[Step 3] Mapping genuine capture to customer ${customerId}...`);
  const record = store.recordGenuineSandboxCapture({
    customerId,
    orderId,
    captureId: captureResult.captureId!,
    amount: captureResult.amount || 10.00,
    currency: captureResult.currency || 'USD',
    status: captureResult.status || 'COMPLETED',
    capturedAt: captureResult.createTime,
    rawPayload: captureResult.rawResponse
  });

  console.log(`✅ Genuine capture stored in PromiseBack ledger:`);
  console.log(JSON.stringify(record, null, 2));
}

main().catch(err => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
