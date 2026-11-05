import { store } from '../src/lib/store';
import { Entitlement } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

function expectError(fn: () => void, expectedSubstr: string, testName: string) {
  try {
    fn();
    console.error(`❌ ASSERTION FAILED: ${testName} - expected error containing "${expectedSubstr}" but none was thrown`);
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes(expectedSubstr)) {
      console.log(`✅ ${testName}: Caught expected error -> "${err.message}"`);
    } else {
      console.error(`❌ ASSERTION FAILED: ${testName} - error message "${err.message}" did not contain "${expectedSubstr}"`);
      process.exit(1);
    }
  }
}

console.log('=== TEST SUITE: DUAL-APPROVAL FINANCIAL GOVERNANCE ===\n');

// Helper to create a test entitlement fixture
function createMockEntitlement(amount: number, idSuffix: string): Entitlement {
  const id = `ent-test-gov-${Date.now()}-${idSuffix}`;
  const ent: Entitlement = {
    id,
    caseNumber: `CASE-GOV-${idSuffix.toUpperCase()}`,
    customerId: 'cust-101',
    customerName: 'Apex Fintech Solutions Inc.',
    customerPlan: 'Enterprise Tier 1',
    contractId: 'contract-01',
    contractNumber: 'SLA-2026-AF88',
    incidentId: 'inc-test-gov',
    incidentNumber: 'INC-2026-GOV',
    incidentSummary: 'Governance test incident',
    measuredUptime: 99.85,
    eligibleCredit: amount,
    status: 'pending_approval',
    calculation: {
      contractedUptime: 99.95,
      measuredUptime: 99.85,
      outageMinutes: 45,
      totalPeriodMinutes: 43200,
      breachMagnitude: 0.10,
      applicableTier: { uptimeThreshold: 99.90, creditPercentage: 10, label: 'Tier 1' },
      formula: `Base Spend * Tier% = $${amount.toFixed(2)}`,
      baseAmount: 14500,
      creditAmount: amount,
      calculatedAt: new Date().toISOString(),
      applicableClauseId: 'clause-01',
      applicableClauseTitle: 'Availability'
    },
    evidenceSummary: 'Datadog synthetic check logs',
    telemetrySource: 'Datadog APM',
    billingPeriodKey: '2026-11',
    idempotencyKey: `idemp-gov-${Date.now()}-${idSuffix}`,
    approvalHistory: [],
    payoutMethod: 'PayPal Refund'
  };
  (store as any).entitlements.unshift(ent);
  return ent;
}

// --------------------------------------------------------------------------
// TEST A & J: Valid Two-Person Approval Workflow (> $2,500.00 threshold)
// --------------------------------------------------------------------------
console.log('--- Test A & J: Valid Two-Person Dual Approval Workflow ---');
const entHigh = createMockEntitlement(4000.00, 'high-valid');

// Stage 1 Approval by Finance Controller
const stage1 = store.processApproval({
  entitlementId: entHigh.id,
  decision: 'approved',
  reviewedBy: 'Marcus Vance',
  role: 'FINANCE_CONTROLLER',
  notes: 'Stage 1 verified against contractual breach and metrics'
});
assert(stage1.stage === 'first_approval', 'Stage 1 returns first_approval signal');
assert(stage1.entitlement.status === 'pending_executive_approval', 'Status transitions to pending_executive_approval');
assert(stage1.entitlement.dualApprovalRequired === true, 'dualApprovalRequired is true');
assert(!stage1.refundRecord, 'No refund record created at Stage 1');

// Stage 2 Approval by Legal Counsel (Distinct Person)
const stage2 = store.processApproval({
  entitlementId: entHigh.id,
  decision: 'approved',
  reviewedBy: 'Sarah Jenkins',
  role: 'LEGAL_COUNSEL',
  notes: 'Stage 2 legal and executive approval confirmed'
});
assert(stage2.stage === 'second_approval', 'Stage 2 returns second_approval signal');
assert(stage2.entitlement.status === 'approved', 'Status transitions to approved after Stage 2');
assert(!!stage2.refundRecord, 'Refund record created after Stage 2 completion');
assert(stage2.refundRecord!.refundAmount === 4000.00, 'Refund record has correct amount $4,000.00');

// --------------------------------------------------------------------------
// TEST B: Separation of Duties (Same-person approval attempt)
// --------------------------------------------------------------------------
console.log('\n--- Test B: Separation of Duties Enforcement ---');
const entSamePerson = createMockEntitlement(3500.00, 'same-person');
store.processApproval({
  entitlementId: entSamePerson.id,
  decision: 'approved',
  reviewedBy: 'Elena Rostova',
  role: 'FINANCE_CONTROLLER'
});

expectError(
  () => store.processApproval({
    entitlementId: entSamePerson.id,
    decision: 'approved',
    reviewedBy: 'Elena Rostova',
    role: 'EXECUTIVE_DIRECTOR'
  }),
  'SEPARATION_OF_DUTIES_VIOLATION',
  'Same person cannot approve Stage 1 and Stage 2'
);

// --------------------------------------------------------------------------
// TEST C: Unauthorized Approver (Guest / Intern)
// --------------------------------------------------------------------------
console.log('\n--- Test C: Unauthorized Approver Prevention ---');
const entUnauth = createMockEntitlement(1500.00, 'unauthorized');
expectError(
  () => store.processApproval({
    entitlementId: entUnauth.id,
    decision: 'approved',
    reviewedBy: 'Unknown Visitor',
    role: 'GUEST'
  }),
  'UNAUTHORIZED_APPROVER',
  'Guest/Intern role rejected from approving'
);

// --------------------------------------------------------------------------
// TEST D: Insufficient Permissions for Stage 2 Executive Sign-off
// --------------------------------------------------------------------------
console.log('\n--- Test D: Insufficient Permissions for Stage 2 ---');
const entInsuff = createMockEntitlement(5000.00, 'insufficient-role');
store.processApproval({
  entitlementId: entInsuff.id,
  decision: 'approved',
  reviewedBy: 'Alice Finance',
  role: 'FINANCE_CONTROLLER'
});

expectError(
  () => store.processApproval({
    entitlementId: entInsuff.id,
    decision: 'approved',
    reviewedBy: 'Bob Junior-Finance',
    role: 'FINANCE_OFFICER'
  }),
  'INSUFFICIENT_PERMISSIONS',
  'Junior finance role rejected from Stage 2 executive sign-off'
);

// --------------------------------------------------------------------------
// TEST E: Amount Tampering after Stage 1 Approval
// --------------------------------------------------------------------------
console.log('\n--- Test E: Amount Tamper Detection ---');
const entTamper = createMockEntitlement(3000.00, 'tamper');
store.processApproval({
  entitlementId: entTamper.id,
  decision: 'approved',
  reviewedBy: 'Carol Finance',
  role: 'FINANCE_CONTROLLER'
});

// Malicious actor modifies the amount from 3000 to 5000 in memory
entTamper.eligibleCredit = 5000.00;

expectError(
  () => store.processApproval({
    entitlementId: entTamper.id,
    decision: 'approved',
    reviewedBy: 'David Director',
    role: 'EXECUTIVE_DIRECTOR'
  }),
  'APPROVAL_AMOUNT_MISMATCH',
  'Amount alteration after Stage 1 detected and approval invalidated'
);
assert(entTamper.status === 'requires_review', 'Entitlement reset to requires_review after tamper detection');

// --------------------------------------------------------------------------
// TEST F: Expired Stage 1 Approval (24-Hour TTL)
// --------------------------------------------------------------------------
console.log('\n--- Test F: Expired Approval Handling ---');
const entExpired = createMockEntitlement(3200.00, 'expired');
store.processApproval({
  entitlementId: entExpired.id,
  decision: 'approved',
  reviewedBy: 'Eve Finance',
  role: 'FINANCE_CONTROLLER'
});

// Fast-forward expiration to the past
entExpired.approvalExpiresAt = new Date(Date.now() - 1000 * 60).toISOString();

expectError(
  () => store.processApproval({
    entitlementId: entExpired.id,
    decision: 'approved',
    reviewedBy: 'Frank Executive',
    role: 'EXECUTIVE_DIRECTOR'
  }),
  'APPROVAL_EXPIRED',
  'Expired Stage 1 approval rejected'
);
assert(entExpired.status === 'requires_review', 'Expired approval reset status to requires_review');

// --------------------------------------------------------------------------
// TEST G: Duplicate Approval Attempt
// --------------------------------------------------------------------------
console.log('\n--- Test G: Duplicate Approval Prevention ---');
const entSmall = createMockEntitlement(800.00, 'duplicate');
store.processApproval({
  entitlementId: entSmall.id,
  decision: 'approved',
  reviewedBy: 'Grace Controller',
  role: 'FINANCE_CONTROLLER'
});
assert(entSmall.status === 'approved', 'Case approved on single approval');

expectError(
  () => store.processApproval({
    entitlementId: entSmall.id,
    decision: 'approved',
    reviewedBy: 'Grace Controller',
    role: 'FINANCE_CONTROLLER'
  }),
  'ALREADY_APPROVED',
  'Duplicate approval of already approved case rejected'
);

// --------------------------------------------------------------------------
// TEST H: Rejection Handling
// --------------------------------------------------------------------------
console.log('\n--- Test H: Rejection Handling ---');
const entReject = createMockEntitlement(2900.00, 'reject');
const rejectResult = store.processApproval({
  entitlementId: entReject.id,
  decision: 'rejected',
  reviewedBy: 'Henry Counsel',
  notes: 'Maintenance window excluded outage'
});
assert(rejectResult.entitlement.status === 'rejected', 'Status transitioned to rejected');
expectError(
  () => store.processApproval({
    entitlementId: entReject.id,
    decision: 'approved',
    reviewedBy: 'Iris Finance',
    role: 'FINANCE_CONTROLLER'
  }),
  'ALREADY_REJECTED',
  'Cannot approve a case that was previously rejected'
);

// --------------------------------------------------------------------------
// TEST I: Threshold Boundary Conditions ($2,500.00)
// --------------------------------------------------------------------------
console.log('\n--- Test I: Threshold Boundary Conditions ---');
// Case 1: Exactly at boundary ($2,500.00) -> single approval suffices
const entAtBoundary = createMockEntitlement(2500.00, 'boundary-exact');
const resExact = store.processApproval({
  entitlementId: entAtBoundary.id,
  decision: 'approved',
  reviewedBy: 'Jack Controller',
  role: 'FINANCE_CONTROLLER'
});
assert(resExact.stage === 'single_approval', 'Amount exactly equal to $2,500.00 uses single approval');
assert(resExact.entitlement.status === 'approved', 'Status is approved');

// Case 2: One cent above boundary ($2,500.01) -> requires dual approval
const entAboveBoundary = createMockEntitlement(2500.01, 'boundary-above');
const resAbove = store.processApproval({
  entitlementId: entAboveBoundary.id,
  decision: 'approved',
  reviewedBy: 'Karen Controller',
  role: 'FINANCE_CONTROLLER'
});
assert(resAbove.stage === 'first_approval', 'Amount $2,500.01 strictly triggers dual-approval Stage 1');
assert(resAbove.entitlement.status === 'pending_executive_approval', 'Status is pending_executive_approval');

// Verify Cryptographic Audit Trail
const integrity = store.verifyAuditIntegrity();
assert(integrity.isValid, `Cryptographic audit chain remains valid across all ${integrity.checkedEventsCount} events`);

// Cleanup temporary test fixtures so they do not pollute subsequent tests or persistent store
(store as any).entitlements = (store as any).entitlements.filter((e: any) => !e.id.includes('ent-test-gov'));
(store as any).refunds = (store as any).refunds.filter((r: any) => !r.entitlementId?.includes('ent-test-gov'));
(store as any).saveToDisk();

console.log('\n✅ ALL 10 DUAL-APPROVAL GOVERNANCE TESTS (A-J) PASSED!\n');
