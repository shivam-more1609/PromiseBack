import { store } from '../src/lib/store';
import fs from 'fs';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

console.log('=== TEST SUITE: FINANCIAL LEDGER RECONCILIATION & INTEGRITY ===\n');

// 1. Verify Ground Truth Baseline State
const cust = store.getCustomerById('cust-101');
assert(!!cust, 'cust-101 exists in store');
assert(cust!.refundableBalance === 10020, `cust-101 refundableBalance is $10,020.00 (got: $${cust!.refundableBalance})`);
assert(cust!.paypalCaptureId === '68F34499U0675760F', `cust-101 points to latest genuine capture 68F34499U0675760F (got: ${cust!.paypalCaptureId})`);

const genuineCaptures = store.getGenuineCaptures();
assert(genuineCaptures.length >= 2, `At least 2 genuine captures recorded (got: ${genuineCaptures.length})`);

const cap1 = genuineCaptures.find(c => c.paypalCaptureId === '13F84345FS415154U');
const cap2 = genuineCaptures.find(c => c.paypalCaptureId === '68F34499U0675760F');
assert(!!cap1, 'Capture 1 (13F84345FS415154U) exists');
assert(!!cap2, 'Capture 2 (68F34499U0675760F) exists');
assert(cap1!.amount === 10.00, 'Capture 1 amount is $10.00');
assert(cap2!.amount === 10.00, 'Capture 2 amount is $10.00');

// 2. Test Idempotency of Repeated Reconciliation
const recon1 = store.reconcileCustomerLedger('cust-101', true);
assert(recon1.reconciledBalance === 10020, 'Reconciliation pass 1 computes $10,020.00');
assert(recon1.latestCaptureId === '68F34499U0675760F', 'Reconciliation pass 1 preserves latest capture 68F34499U0675760F');

const recon2 = store.reconcileCustomerLedger('cust-101', true);
assert(recon2.reconciledBalance === 10020, 'Reconciliation pass 2 computes $10,020.00 (idempotent)');
assert(recon2.genuineDepositsTotal === 20.00, 'Genuine deposits total strictly $20.00');

// 3. Test Duplicate Capture Prevention
const initialCapturesCount = store.getGenuineCaptures().length;
const duplicateAttempt = store.recordGenuineSandboxCapture({
  customerId: 'cust-101',
  orderId: '98E62163N4112711D',
  captureId: '68F34499U0675760F',
  amount: 10.00,
  currency: 'USD',
  status: 'COMPLETED'
});
const countAfterDuplicate = store.getGenuineCaptures().length;
assert(initialCapturesCount === countAfterDuplicate, 'Duplicate capture record was rejected and not added to store');
assert(duplicateAttempt.paypalCaptureId === '68F34499U0675760F', 'Returned existing capture record cleanly');

// 4. Test Simulated Refund Exclusion
// Verify that non-genuine/simulated refunds (e.g. mock captures) do not deduct from genuine customer balance
const reconSim = store.reconcileCustomerLedger('cust-101', false);
assert(reconSim.genuineRefundsTotal === 0, `Simulated/mock test refunds excluded from genuine deductions (got: $${reconSim.genuineRefundsTotal})`);
assert(reconSim.reconciledBalance === 10020, 'Balance remains exactly $10,020.00');

// 5. Test Seed Reset Protection
store.resetToSeed();
const custAfterReset = store.getCustomerById('cust-101');
assert(custAfterReset!.refundableBalance === 10020, `resetToSeed preserves reconciled balance $10,020.00 (got: $${custAfterReset!.refundableBalance})`);
assert(custAfterReset!.paypalCaptureId === '68F34499U0675760F', `resetToSeed preserves latest capture ID 68F34499U0675760F (got: ${custAfterReset!.paypalCaptureId})`);

// 6. Test Disk Reload / Persistence
store.syncFromDisk();
const custAfterSync = store.getCustomerById('cust-101');
assert(custAfterSync!.refundableBalance === 10020, `Disk sync preserves $10,020.00 (got: $${custAfterSync!.refundableBalance})`);
assert(custAfterSync!.paypalCaptureId === '68F34499U0675760F', `Disk sync preserves latest capture (got: ${custAfterSync!.paypalCaptureId})`);

// 7. Verify SHA-256 Audit Trail Integrity
const integrity = store.verifyAuditIntegrity();
assert(integrity.isValid, `Cryptographic SHA-256 audit chain is valid across all ${integrity.checkedEventsCount} events`);

console.log('\n✅ ALL FINANCIAL LEDGER RECONCILIATION TESTS PASSED!\n');
