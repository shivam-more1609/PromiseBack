import { store } from '../src/lib/store';
import { assert } from 'console';

function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runWebhookReconciliationTests() {
  console.log('\n--- EXECUTING PHASE 5: WEBHOOK RECONCILIATION & IDEMPOTENCY TESTS ---\n');

  // Test 1: Setup a test entitlement & approved refund awaiting reconciliation
  const testEntitlementId = `ent-test-wh-${Date.now()}`;
  const testCaptureId = `CAP-WH-TEST-${Date.now()}`;
  const testRefundId = `ref-wh-test-${Date.now()}`;
  const testPayPalRefundId = `WH-PP-REF-${Date.now()}`;

  // Add refund record in 'approved' status awaiting execution / webhook reconciliation
  const refunds = store.getRefunds();
  refunds.unshift({
    id: testRefundId,
    refundNumber: `REF-2026-TEST-${Math.floor(100 + Math.random() * 900)}`,
    entitlementId: testEntitlementId,
    customerId: 'cust-101',
    customerName: 'Apex Fintech Solutions Inc.',
    paypalAccount: 'payouts@apexfintech.io',
    paypalCaptureId: testCaptureId,
    originalPaymentId: 'PAYPAL-SUB-cust-101',
    refundAmount: 150.00,
    currency: 'USD',
    idempotencyRequestId: `idemp-test-${Date.now()}`,
    feeAmount: 0,
    status: 'approved',
    createdAt: new Date().toISOString()
  });

  console.log(`1. Testing automatic reconciliation on PAYMENT.CAPTURE.REFUNDED for capture ${testCaptureId} ...`);
  const event1Id = `WH-EVT-1-${Date.now()}`;
  const recResult1 = store.reconcileWebhookEvent({
    id: event1Id,
    event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: {
      id: testPayPalRefundId,
      capture_id: testCaptureId,
      amount: { total: '-150.00', currency: 'USD' },
      state: 'completed'
    },
    create_time: new Date().toISOString()
  });

  check(recResult1.reconciled === true, 'Webhook event reconciled');
  check(recResult1.actionTaken === 'REFUND_COMPLETED_VIA_WEBHOOK', `Action taken: REFUND_COMPLETED_VIA_WEBHOOK (got ${recResult1.actionTaken})`);
  check(recResult1.matchedRefundId === testRefundId, 'Matched correct internal refund ID');

  const updatedRefund = store.getRefundById(testRefundId);
  check(updatedRefund?.status === 'completed', `Refund status transitioned to completed (got ${updatedRefund?.status})`);
  check(updatedRefund?.paypalRefundId === testPayPalRefundId, 'Refund record updated with official PayPal refund ID');
  check(updatedRefund?.executedAt !== undefined, 'Refund record populated with execution timestamp');

  // Test 2: Duplicate Webhook Event Idempotency
  console.log('\n2. Testing duplicate webhook event rejection (Idempotency) ...');
  const recResultDuplicate = store.reconcileWebhookEvent({
    id: event1Id, // Same event ID!
    event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: {
      id: testPayPalRefundId,
      capture_id: testCaptureId
    }
  });

  check(recResultDuplicate.reconciled === true, 'Duplicate event safely processed');
  check(recResultDuplicate.actionTaken === 'DUPLICATE_EVENT_IGNORED', 'Duplicate event recognized and ignored (no double execution)');

  // Test 3: Safe handling of unknown or unrelated resource IDs (e.g. PayPal Webhook Simulator mock events)
  console.log('\n3. Testing safe handling of unmapped / simulator mock resource IDs ...');
  const eventUnknownId = `WH-EVT-SIMULATOR-${Date.now()}`;
  const recResultUnknown = store.reconcileWebhookEvent({
    id: eventUnknownId,
    event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: {
      id: '8VC964970N548345V', // Mock simulator ID not present in store
      capture_id: '5LK72275CG489890D'
    }
  });

  check(recResultUnknown.reconciled === true, 'Unmapped webhook safely handled');
  check(recResultUnknown.actionTaken === 'UNMAPPED_RESOURCE_ACKNOWLEDGED', 'Unmapped resource acknowledged without corrupting internal store');

  // Test 4: Capture Completed Webhook
  console.log('\n4. Testing PAYMENT.CAPTURE.COMPLETED webhook ...');
  const recResultCapture = store.reconcileWebhookEvent({
    id: `WH-EVT-CAP-${Date.now()}`,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP-2GG10928AB778901C',
      status: 'COMPLETED'
    }
  });

  check(recResultCapture.reconciled === true, 'Capture completed webhook handled');
  check(recResultCapture.actionTaken === 'CAPTURE_COMPLETED_VIA_WEBHOOK', 'Capture event registered');

  // Test 5: Capture Pending Webhook
  console.log('\n5. Testing PAYMENT.CAPTURE.PENDING webhook ...');
  const recResultPending = store.reconcileWebhookEvent({
    id: `WH-EVT-PENDING-${Date.now()}`,
    event_type: 'PAYMENT.CAPTURE.PENDING',
    resource: {
      id: 'CAP-TEST-PENDING-001',
      status: 'PENDING'
    }
  });
  check(recResultPending.reconciled === true, 'Capture pending webhook handled');
  check(recResultPending.actionTaken === 'CAPTURE_PENDING_ACKNOWLEDGED', 'Capture pending registered');

  // Test 6: Capture Denied Webhook
  console.log('\n6. Testing PAYMENT.CAPTURE.DENIED webhook ...');
  const recResultDenied = store.reconcileWebhookEvent({
    id: `WH-EVT-DENIED-${Date.now()}`,
    event_type: 'PAYMENT.CAPTURE.DENIED',
    resource: {
      id: 'CAP-TEST-DENIED-001',
      status: 'DENIED'
    }
  });
  check(recResultDenied.reconciled === true, 'Capture denied webhook handled');
  check(recResultDenied.actionTaken === 'CAPTURE_DENIED_ACKNOWLEDGED', 'Capture denied registered');

  // Test 7: Order Approved Webhook
  console.log('\n7. Testing CHECKOUT.ORDER.APPROVED webhook ...');
  const recResultApproved = store.reconcileWebhookEvent({
    id: `WH-EVT-ORDER-APP-${Date.now()}`,
    event_type: 'CHECKOUT.ORDER.APPROVED',
    resource: {
      id: 'ORD-TEST-APPROVED-001',
      status: 'APPROVED'
    }
  });
  check(recResultApproved.reconciled === true, 'Order approved webhook handled');
  check(recResultApproved.actionTaken === 'ORDER_APPROVED_ACKNOWLEDGED', 'Order approval registered');

  // Test 8: Audit Provencance & Chain Integrity
  console.log('\n8. Testing Audit Chain Integrity after all webhook events ...');
  const integrity = store.verifyAuditIntegrity();
  check(integrity.isValid === true, `SHA-256 audit chain verified intact across all ${integrity.checkedEventsCount} events`);

  console.log('\n✅ ALL PHASE 5 WEBHOOK RECONCILIATION & IDEMPOTENCY TESTS PASSED!\n');
}

runWebhookReconciliationTests();
