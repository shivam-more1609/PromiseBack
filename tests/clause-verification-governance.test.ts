/**
 * Clause-Level Human Verification & Contract Governance Workflow Test Suite
 *
 * Verifies:
 * 1. REAL CLOUDPULSE 8-CLAUSE LIFECYCLE:
 *    - Loads actual CloudPulse fixture with all 8 extracted clauses.
 *    - Verifying 1 clause (1/8) keeps contract in 'requires_review'.
 *    - Verifying 4 clauses (4/8 = 50%) strictly keeps contract in 'requires_review' and blocks financial recovery.
 *    - Flagging any clause keeps contract in 'requires_review'.
 *    - Only after all 8 required clauses are verified does the contract transition to 'active'.
 * 2. AUTHENTICATED REVIEWER IDENTITY:
 *    - Reviewer identity comes exclusively from authenticated server session.
 *    - Frontend-supplied reviewer names in request body CANNOT override authenticated identity.
 *    - No hardcoded fallback identities are used.
 *    - Unauthorized requests return 401.
 * 3. LOCAL vs SERVERLESS PERSISTENCE DISTINCTION:
 *    - Local development and server restart persistence via data/store.json.
 *    - Clear documentation that local JSON does not provide permanent Vercel serverless persistence.
 */

import fs from 'fs';
import path from 'path';
import '../src/lib/serverlessPolyfills';
import { store } from '../src/lib/store';
import { extractContractFromPdfBuffer } from '../src/lib/contractExtractor';
import { calculateEntitlementEngine } from '../src/lib/slaEngine';
import { createSessionToken } from '../src/lib/auth';
import { PATCH as contractPatchRoute } from '../src/app/api/contracts/[id]/route';
import { Contract, Customer, Incident } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runGovernanceAuditTests() {
  console.log('\n=== RUNNING TARGETED CONTRACT GOVERNANCE & 8-CLAUSE AUDIT ===\n');

  // STEP 1: Load actual CloudPulse SLA PDF fixture
  const pdfPath = path.join(process.cwd(), 'tests', 'fixtures', 'CloudPulse_Service_Level_Agreement.pdf');
  assert(fs.existsSync(pdfPath), `Source CloudPulse PDF fixture exists at ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);

  const extracted = await extractContractFromPdfBuffer(pdfBuffer, 'CloudPulse Technologies');

  // VERIFY EXACT 8 EXTRACTED CLAUSES
  assert(extracted.clauses.length === 8, `CloudPulse contains exactly 8 extracted clauses (got ${extracted.clauses.length})`);

  const expectedClauseTitles = [
    'Service Availability Commitment',
    'Downtime Allowance And Measurement',
    'Scheduled And Emergency Maintenance',
    'Service Credit Remedy Schedule',
    'Claim Submission',
    'Monthly Service Fee',
    'Non-Cash Remedy Restriction',
    'Contractual Monetary Ceiling'
  ];

  for (const expectedTitle of expectedClauseTitles) {
    const found = extracted.clauses.some(c => c.title.toLowerCase().includes(expectedTitle.toLowerCase()));
    assert(found, `Expected contractual clause "${expectedTitle}" is present in extracted CloudPulse clauses`);
  }

  // Create contract in store
  const contractId = `contract-cloudpulse-audit-${Date.now()}`;
  const testContract: Contract = {
    id: contractId,
    contractNumber: extracted.contractNumber || 'SLA-2026-CP001',
    customerId: 'cust-cloudpulse-gov',
    customerName: 'CloudPulse Technologies',
    slaName: extracted.slaName,
    uptimeTarget: extracted.uptimeTarget,
    measurementPeriod: extracted.measurementPeriod,
    claimDeadlineDays: extracted.claimDeadlineDays,
    compensationTiers: extracted.compensationTiers,
    maintenanceExclusions: extracted.maintenanceExclusions,
    maxCompensationPercent: extracted.maxCompensationPercent,
    explicitPercentageCap: extracted.explicitPercentageCap,
    contractualMonetaryCeiling: extracted.contractualMonetaryCeiling,
    contractualMonetaryCeilingText: extracted.contractualMonetaryCeilingText,
    maxServiceCreditTier: extracted.maxServiceCreditTier,
    isCashRefundAllowed: extracted.isCashRefundAllowed,
    disbursementMethodText: extracted.disbursementMethodText,
    monthlyServiceFee: extracted.monthlyServiceFee,
    effectiveStartDate: extracted.effectiveStartDate || '1 October 2026',
    effectiveEndDate: extracted.effectiveEndDate || '30 September 2027',
    status: 'requires_review', // Initially strictly requires human compliance review
    extractedConfidence: extracted.extractedConfidence,
    uploadedAt: new Date().toISOString(),
    fileName: 'CloudPulse_Service_Level_Agreement.pdf',
    fileSize: '1.4 MB',
    clauses: extracted.clauses,
    isDemo: false
  };

  store.addContract(testContract, 'Governance Test Initializer');

  const mockCustomer: Customer = {
    id: 'cust-cloudpulse-gov',
    name: 'CloudPulse Technologies',
    domain: 'cloudpulse.io',
    plan: 'Enterprise Tier 1',
    monthlySpend: 14500,
    billingEmail: 'billing@cloudpulse.io',
    paypalEmail: 'finance@cloudpulse.io',
    slaContractId: contractId,
    contractNumber: 'SLA-2026-CP001',
    region: 'US-East',
    paymentMethod: 'PayPal Refund'
  };

  const breachedIncident: Incident = {
    id: `inc-cloudpulse-${Date.now()}`,
    incidentNumber: 'INC-2026-CP01',
    service: 'Core Managed Cloud Infrastructure',
    severity: 'P1 - Critical',
    status: 'resolved',
    summary: 'Core gateway outage exceeding monthly allowance of 21.6 minutes',
    rootCause: 'Storage subsystem degraded performance',
    startedAt: '2026-10-15T10:00:00Z',
    detectedAt: '2026-10-15T10:02:00Z',
    mitigatedAt: '2026-10-15T10:48:00Z',
    resolvedAt: '2026-10-15T10:50:00Z', // 50 mins outage -> 99.884% availability (< 99.90% -> 10% credit)
    durationMinutes: 50,
    affectedRegions: ['US-East'],
    affectedCustomerIds: ['cust-cloudpulse-gov'],
    affectedCustomersCount: 1,
    telemetry: [],
    timeline: [],
    slaBreached: true,
    slaImpactAnalysis: 'Availability 99.884% breached 99.95% target'
  };

  // =========================================================================
  // TEST 1: VERIFY 1 OF 8 CLAUSES
  // =========================================================================
  console.log('[TEST 1] Single Clause Verification (1 of 8)');
  const clause1 = testContract.clauses[0];

  const updated1 = store.updateClauseVerification(
    contractId,
    clause1.id,
    'human_verified',
    'Elena Rostova (Compliance Lead)',
    'Verified Section 2 against PDF text'
  );

  assert(!!updated1, 'updateClauseVerification returned updated contract');
  const v1 = updated1?.clauses.find(c => c.id === clause1.id);
  assert(v1?.status === 'human_verified', 'Clause 1 status is human_verified');
  assert(v1?.verifiedBy === 'Elena Rostova (Compliance Lead)', 'Reviewer recorded');
  assert(!!v1?.verifiedAt, 'Timestamp recorded');

  const count1 = updated1?.clauses.filter(c => c.status === 'human_verified').length;
  assert(count1 === 1, `Verified count is 1 of 8 (got ${count1})`);
  const pct1 = Math.round((count1! / updated1!.clauses.length) * 100);
  assert(pct1 === 13, `Verification percentage is 13% (1/8) (got ${pct1}%)`);
  assert(updated1?.status === 'requires_review', 'Contract status remains requires_review with 1/8 clauses verified');

  // =========================================================================
  // TEST 2: VERIFYING ONLY 4 OF 8 CLAUSES MUST NOT MAKE CONTRACT ACTIVE
  // =========================================================================
  console.log('\n[TEST 2] Verifying Only 4 of 8 Clauses Must NOT Make Contract Active');

  // Verify clauses 2, 3, 4 (leaving clauses 5, 6, 7, 8 unverified)
  store.updateClauseVerification(contractId, testContract.clauses[1].id, 'human_verified', 'Elena Rostova');
  store.updateClauseVerification(contractId, testContract.clauses[2].id, 'human_verified', 'Elena Rostova');
  const updated4 = store.updateClauseVerification(contractId, testContract.clauses[3].id, 'human_verified', 'Elena Rostova');

  const count4 = updated4?.clauses.filter(c => c.status === 'human_verified').length;
  assert(count4 === 4, `Verified count is exactly 4 of 8 (got ${count4})`);
  const pct4 = Math.round((count4! / updated4!.clauses.length) * 100);
  assert(pct4 === 50, `Verification percentage is 50% (4/8) (got ${pct4}%)`);

  // MUST NOT MAKE CONTRACT ACTIVE
  assert(updated4?.status === 'requires_review', `Contract status MUST remain 'requires_review' when only 4/8 clauses verified (got '${updated4?.status}')`);
  assert(updated4?.status !== 'active', 'Contract is NOT active when only 4 of 8 clauses are verified');

  // Automated financial recovery MUST be blocked when only 4/8 clauses are verified
  const blockedEntitlement = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: updated4!,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });

  assert(blockedEntitlement.status === 'requires_review', `Financial recovery blocked: entitlement status is 'requires_review' with 4/8 clauses verified (got '${blockedEntitlement.status}')`);
  assert(blockedEntitlement.status !== 'pending_approval', 'Entitlement CANNOT enter pending_approval when required clauses remain unverified');

  // =========================================================================
  // TEST 3: ANY FLAGGED CLAUSE MUST KEEP CONTRACT IN requires_review
  // =========================================================================
  console.log('\n[TEST 3] Flagged Clause Keeps Contract in requires_review');

  const flagged = store.updateClauseVerification(
    contractId,
    testContract.clauses[4].id, // Section 7 Claim Submission
    'requires_review',
    'Marcus Vance (Legal Auditor)',
    'Flagged: Verify claim submission timeline with legal team'
  );

  const flaggedClause = flagged?.clauses.find(c => c.id === testContract.clauses[4].id);
  assert(flaggedClause?.status === 'requires_review', 'Clause successfully flagged as requires_review');
  assert(flagged?.status === 'requires_review', 'Contract lifecycle strictly remains requires_review when a clause is flagged');

  // Ensure flagged clause does NOT count toward human verified count
  const countAfterFlag = flagged?.clauses.filter(c => c.status === 'human_verified').length;
  assert(countAfterFlag === 4, `Verified count remains 4 after flagging (got ${countAfterFlag})`);

  // =========================================================================
  // TEST 4: ONLY AFTER ALL 8 REQUIRED CLAUSES ARE VERIFIED MAY CONTRACT BECOME ACTIVE
  // =========================================================================
  console.log('\n[TEST 4] All 8 Clauses Verified Transitions Contract to Active');

  // Verify remaining clauses: 5, 6, 7, 8 (including Section 10 Fee, Non-Cash, Monetary Ceiling)
  store.updateClauseVerification(contractId, testContract.clauses[4].id, 'human_verified', 'Elena Rostova');
  store.updateClauseVerification(contractId, testContract.clauses[5].id, 'human_verified', 'Elena Rostova'); // Section 10 Fee
  store.updateClauseVerification(contractId, testContract.clauses[6].id, 'human_verified', 'Elena Rostova'); // Section 10 Non-Cash
  const fullyVerified = store.updateClauseVerification(contractId, testContract.clauses[7].id, 'human_verified', 'Elena Rostova'); // Section 10 Monetary Ceiling

  const finalCount = fullyVerified?.clauses.filter(c => c.status === 'human_verified').length;
  assert(finalCount === 8, `All 8 clauses are now human_verified (got ${finalCount})`);
  const finalPct = Math.round((finalCount! / fullyVerified!.clauses.length) * 100);
  assert(finalPct === 100, `Final verification percentage is 100% (got ${finalPct}%)`);
  assert(fullyVerified?.status === 'active', `Contract lifecycle transitioned to 'active' after all 8 clauses verified (got '${fullyVerified?.status}')`);

  // Now entitlement calculation CAN proceed to pending_approval
  const validEntitlement = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: fullyVerified!,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });

  assert(validEntitlement.status === 'pending_approval', `With 8/8 clauses verified, entitlement enters 'pending_approval' (got '${validEntitlement.status}')`);
  assert(validEntitlement.eligibleCredit === 1450, `10% tier credit calculated on USD 14,500 monthly fee = USD 1,450 (got USD ${validEntitlement.eligibleCredit})`);
  assert(validEntitlement.payoutMethod === 'Service Credit', `Section 10 non-cash restriction strictly enforced: payoutMethod is 'Service Credit' (got '${validEntitlement.payoutMethod}')`);

  // =========================================================================
  // TEST 5: AUTHENTICATED REVIEWER IDENTITY (SERVER-SIDE EXCLUSIVITY)
  // =========================================================================
  console.log('\n[TEST 5] Authenticated Reviewer Identity (No Spoofing / No Hardcoding)');

  // Create an authentic session token for a real compliance officer
  const realOperatorUsername = 'sarah.connor@promiseback.internal';
  const authenticatedToken = createSessionToken({
    username: realOperatorUsername,
    role: 'compliance_officer'
  });

  // 5a. Attempt to spoof reviewer identity by passing a fake name in the request body
  const spoofAttemptBody = {
    clauseId: testContract.clauses[0].id,
    status: 'human_verified',
    verifiedBy: 'MALICIOUS_INJECTED_NAME_ATTACKER', // Must be ignored by server!
    notes: 'Testing identity tampering'
  };

  const patchReq = new Request(`http://localhost:3000/api/contracts/${contractId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'cookie': `promiseback_session=${authenticatedToken}`
    },
    body: JSON.stringify(spoofAttemptBody)
  });

  const patchRes = await contractPatchRoute(patchReq, { params: { id: contractId } });
  assert(patchRes.status === 200, `Authenticated PATCH returned HTTP 200 (got ${patchRes.status})`);
  const patchData = await patchRes.json();
  assert(patchData.success === true, 'Patch succeeded for authenticated operator');

  // Verify that the clause reviewer identity is EXCLUSIVELY the server session user, NOT the spoofed body
  const clauseAfterPatch = patchData.contract.clauses.find((c: any) => c.id === testContract.clauses[0].id);
  assert(clauseAfterPatch.verifiedBy === realOperatorUsername, `Reviewer name is strictly the session user "${realOperatorUsername}" (got "${clauseAfterPatch.verifiedBy}")`);
  assert(clauseAfterPatch.verifiedBy !== 'MALICIOUS_INJECTED_NAME_ATTACKER', 'Frontend-supplied verifiedBy was strictly prohibited from overriding session user');
  assert(clauseAfterPatch.verifiedBy !== 'Elena Rostova (Compliance Lead)', 'Hardcoded fallback identity was NOT used');

  // 5b. Verify audit trail records authentic session username and cryptographic SHA-256 hash
  const auditEvents = store.getAuditEvents();
  const latestClauseAudit = auditEvents.find(e => e.eventType === 'CLAUSE_VERIFICATION_UPDATED' && e.entityId === contractId);
  assert(!!latestClauseAudit, 'Audit event CLAUSE_VERIFICATION_UPDATED was logged');
  assert(latestClauseAudit?.actor?.name === realOperatorUsername, `Audit event actor is session user "${realOperatorUsername}" (got "${latestClauseAudit?.actor?.name}")`);
  assert(latestClauseAudit?.actor?.name !== 'MALICIOUS_INJECTED_NAME_ATTACKER', 'Audit event actor was not compromised by spoofed body');
  assert(!!latestClauseAudit?.hash && latestClauseAudit.hash.length === 64, 'Audit event has genuine SHA-256 hash');

  // 5c. Unauthorized users cannot verify or flag clauses (returns 401)
  const unauthReq = new Request(`http://localhost:3000/api/contracts/${contractId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clauseId: testContract.clauses[0].id,
      status: 'human_verified'
    })
  });
  const unauthRes = await contractPatchRoute(unauthReq, { params: { id: contractId } });
  assert(unauthRes.status === 401, `Unauthorized request returned HTTP 401 (got ${unauthRes.status})`);

  // =========================================================================
  // TEST 6: PERSISTENCE ARCHITECTURE VERIFICATION
  // =========================================================================
  console.log('\n[TEST 6] Persistence Architecture Verification');

  // 6a. Local file persistence: store.json exists and contains updated contract
  const dataFilePath = path.join(process.cwd(), 'data', 'store.json');
  assert(fs.existsSync(dataFilePath), `Local data file exists at ${dataFilePath}`);
  const storeRaw = fs.readFileSync(dataFilePath, 'utf-8');
  assert(storeRaw.includes(contractId), 'Updated contract ID is present in local store.json file');
  assert(storeRaw.includes(realOperatorUsername), 'Authenticated reviewer identity is persisted in store.json');

  // 6b. Verification of architectural boundaries
  console.log('  -> Local development: In-memory store + atomic write to data/store.json.');
  console.log('  -> Local server restart: Persisted via data/store.json initialization.');
  console.log('  -> Vercel serverless: Ephemeral lambda instances with read-only root filesystems;');
  console.log('     JSON writes do not persist across lambdas/deployments without an external database.');

  console.log('\n✅ ALL TARGETED CONTRACT GOVERNANCE & 8-CLAUSE AUDIT TESTS PASSED!\n');
}

runGovernanceAuditTests().catch(err => {
  console.error('Governance audit test failed:', err);
  process.exit(1);
});
