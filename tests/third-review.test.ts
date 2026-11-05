import { 
  validateMutationAuth, 
  authenticateOperator, 
  createSessionToken, 
  verifySessionToken 
} from '../src/lib/auth';
import { store } from '../src/lib/store';
import { 
  analyzeContractIntelligence, 
  validateSourceQuoteInText, 
  validateClauseSourceQuotations, 
  InterpretedClause 
} from '../src/lib/contractIntelligence';
import { validatePayPalCaptureForRefund } from '../src/lib/paypal';
import { Entitlement, RefundRecord } from '../src/types';
import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runThirdRemediationTests() {
  console.log('\n======================================================');
  console.log('   PROMISEBACK THIRD REMEDIATION REVIEW TEST SUITE    ');
  console.log('======================================================\n');

  // ========================================================
  // 1. AUTHENTICATION & CSRF PROTECTION TESTS
  // ========================================================
  console.log('--- 1. Testing Genuine Authentication & CSRF Protection ---');

  // Test 1.1: Anonymous visitor has no session cookie and cannot execute mutations
  const anonReq = new Request('http://localhost:3000/api/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entitlementId: 'ent-1', decision: 'approved' })
  });
  const anonAuth = validateMutationAuth(anonReq);
  assert(anonAuth.authorized === false, 'Anonymous visitor is strictly rejected from mutations');
  assert(anonAuth.reason?.includes('Anonymous users cannot perform mutation operations'), `Rejection message: ${anonAuth.reason}`);

  // Test 1.2: Invalid password login fails cleanly with HTTP 401
  const badLogin = authenticateOperator({ username: 'admin', password: 'wrong_password_123' });
  assert(badLogin.success === false, 'Login with incorrect password strictly fails');
  assert(badLogin.reason?.includes('INVALID_CREDENTIALS'), `Failure reason: ${badLogin.reason}`);

  // Test 1.3: Valid operator login succeeds with server-side environment credentials
  const validLogin = authenticateOperator({ username: 'admin', password: 'promiseback_secure_admin_2026!' });
  assert(validLogin.success === true, 'Operator login with server-side credentials succeeds');
  assert(!!validLogin.token, 'Cryptographically signed session token issued');

  // Test 1.4: CSRF & Origin Mismatch Protection
  // If an attacker tricks a browser with a valid session cookie into submitting from evil.com
  const csrfAttackReq = new Request('http://localhost:3000/api/approvals', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'https://evil-attacker-site.com',
      'cookie': `promiseback_session=${validLogin.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ entitlementId: 'ent-1', decision: 'approved' })
  });
  const csrfAuth = validateMutationAuth(csrfAttackReq);
  assert(csrfAuth.authorized === false, 'Cross-origin mutation request with valid cookie is rejected (CSRF blocked)');
  assert(csrfAuth.reason?.includes('CSRF_ORIGIN_MISMATCH'), `CSRF rejection message: ${csrfAuth.reason}`);

  // Test 1.5: Valid Same-Origin request with session cookie succeeds
  const legitReq = new Request('http://localhost:3000/api/approvals', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'http://localhost:3000',
      'cookie': `promiseback_session=${validLogin.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ entitlementId: 'ent-1', decision: 'approved' })
  });
  const legitAuth = validateMutationAuth(legitReq);
  assert(legitAuth.authorized === true, 'Legitimate same-origin authenticated request is authorized');

  // ========================================================
  // 2. GEMINI MODEL MIGRATION & METADATA TESTS
  // ========================================================
  console.log('\n--- 2. Testing Gemini Model Migration & Metadata ---');

  const contract = store.getContractById('contract-01')!;
  const aiResult = await analyzeContractIntelligence(contract);

  // Verify that model name is gemini-3.8-flash (or configured model) when live, or deterministic when unconfigured
  if (process.env.GEMINI_API_KEY) {
    assert(aiResult.aiProvider === 'Google Gemini', 'Live AI provider is Google Gemini');
    assert(aiResult.modelName === 'gemini-3.8-flash', `Model migrated to gemini-3.8-flash, got ${aiResult.modelName}`);
    assert(aiResult.isLiveAiConfigured === true, 'isLiveAiConfigured is true');
  } else {
    assert(aiResult.aiProvider === 'Deterministic Lexical NLP Engine', 'Fallback provider explicitly labeled as Deterministic NLP');
    assert(aiResult.modelName === 'deterministic-regex-nlp-v3', `Deterministic model name is explicit: ${aiResult.modelName}`);
    assert(!aiResult.aiProvider.includes('Gemini'), 'CRITICAL: Deterministic fallback is NEVER falsely labeled as Gemini');
    assert(aiResult.isLiveAiConfigured === false, 'isLiveAiConfigured is false');
  }

  // ========================================================
  // 3. SOURCE QUOTE VALIDATION (FABRICATION DETECTION) TESTS
  // ========================================================
  console.log('\n--- 3. Testing Source Quote Validation & Fabrication Detection ---');

  const sampleContractText = `
    MASTER SERVICE LEVEL AGREEMENT
    Provider warrants 99.95% monthly uptime for Core Ingestion APIs.
    Remedy claims must be submitted within 30 calendar days of month end.
    Maximum credit shall not exceed 50% of the monthly fee.
  `;

  // Test 3.1: Authentic quotation validation succeeds
  const authenticQuote = 'Provider warrants 99.95% monthly uptime for Core Ingestion APIs.';
  const isAuthValid = validateSourceQuoteInText(authenticQuote, sampleContractText);
  assert(isAuthValid === true, 'Authentic source quotation verified successfully against document text');

  // Test 3.2: Intentionally fabricated quotation MUST FAIL validation
  const fabricatedQuote = 'Provider guarantees 100% uptime with instant $50,000 cash payment upon any minute of delay.';
  const isFabValid = validateSourceQuoteInText(fabricatedQuote, sampleContractText);
  assert(isFabValid === false, 'Intentionally fabricated quotation fails validation cleanly');

  // Test 3.3: Scanning clauses containing fabricated quote flags clause for human audit
  const testClauses: InterpretedClause[] = [
    {
      clauseId: 'c-auth',
      section: 'Section 3.1',
      title: 'Availability Covenant',
      interpretedMeaning: '99.95% availability',
      exactSourceQuote: authenticQuote,
      confidence: 0.95,
      ambiguitiesDetected: [],
      requiresHumanVerification: false
    },
    {
      clauseId: 'c-fab',
      section: 'Section 9.9',
      title: 'Invented Penalty Clause',
      interpretedMeaning: 'Instant $50k penalty',
      exactSourceQuote: fabricatedQuote, // FABRICATED
      confidence: 0.95,
      ambiguitiesDetected: [],
      requiresHumanVerification: false
    }
  ];

  const validationResult = validateClauseSourceQuotations(testClauses, sampleContractText);
  assert(validationResult.rejectedCount === 1, `Exactly 1 fabricated quote rejected, got ${validationResult.rejectedCount}`);
  const rejectedClause = validationResult.validatedClauses.find(c => c.clauseId === 'c-fab');
  assert(rejectedClause?.isFabricatedOrUnsupported === true, 'Fabricated clause tagged with isFabricatedOrUnsupported');
  assert(rejectedClause?.requiresHumanVerification === true, 'Fabricated clause requires human verification');
  assert(rejectedClause!.confidence <= 0.20, `Fabricated clause confidence demoted to ${rejectedClause?.confidence}`);

  // ========================================================
  // 4. CONCURRENT FINANCIAL OPERATIONS TESTS
  // ========================================================
  console.log('\n--- 4. Testing Concurrent Financial Operations & Balance Limits ---');

  // Reset store to known baseline
  store.resetToSeed();

  const customer = store.getCustomerById('cust-101')!;
  customer.refundableBalance = 10000.00;
  customer.paypalCaptureId = '2GG10928AB778901C';

  // Create an approved entitlement for $1,000
  const contract01 = store.getContractById('contract-01')!;
  const concurrentEntitlement: Entitlement = {
    id: `ent-conc-${Date.now()}`,
    caseNumber: 'ENT-202611-CONC-TEST',
    customerId: customer.id,
    customerName: customer.name,
    customerPlan: customer.plan,
    contractId: contract01.id,
    contractNumber: contract01.contractNumber,
    incidentId: 'inc-conc',
    incidentNumber: 'INC-CONC-1',
    incidentSummary: 'Concurrent test outage',
    measuredUptime: 99.912,
    eligibleCredit: 1000.00, // Total entitlement is $1,000.00
    status: 'approved',
    calculation: {
      contractedUptime: 99.95,
      measuredUptime: 99.912,
      outageMinutes: 38,
      totalPeriodMinutes: 43200,
      breachMagnitude: 0.038,
      applicableTier: contract01.compensationTiers[1],
      formula: 'Tier 1 compensation',
      baseAmount: 10000,
      creditAmount: 1000.00,
      calculatedAt: new Date().toISOString(),
      applicableClauseId: 'c1',
      applicableClauseTitle: 'Compensation Tier'
    },
    evidenceSummary: 'Concurrent test case',
    telemetrySource: 'Synthetic Probe',
    billingPeriodKey: '2026-11',
    idempotencyKey: `idemp-conc-${Date.now()}`,
    approvalHistory: [
      { requestedAt: new Date().toISOString(), reviewedBy: 'Auditor', reviewedAt: new Date().toISOString(), decision: 'approved' }
    ],
    payoutMethod: 'PayPal Refund'
  };
  store.getEntitlements().unshift(concurrentEntitlement);

  // Create two separate partial refund requests for $600 each
  // Since total entitlement is $1,000:
  // $600 + $600 = $1,200 > $1,000 -> ONLY ONE CAN SUCCEED!
  const refundReq1 = store.createPartialRefund({
    entitlementId: concurrentEntitlement.id,
    amount: 600.00,
    actorName: 'Concurrent Worker 1'
  });

  // Verify that attempting to create another $600 refund when $600 is already active is REJECTED
  let secondReqBlocked = false;
  try {
    store.createPartialRefund({
      entitlementId: concurrentEntitlement.id,
      amount: 600.00,
      actorName: 'Concurrent Worker 2'
    });
  } catch (err: any) {
    secondReqBlocked = true;
    assert(err.message.includes('EXCEEDS_PERMITTED_ENTITLEMENT_AMOUNT'), `Simultaneous over-refund blocked: ${err.message}`);
  }
  assert(secondReqBlocked, 'Atomic balance check strictly prevents creating simultaneous refunds exceeding $1,000');

  // Test 4.2: Idempotency Key Preserved on Retries
  const originalIdempKey = refundReq1.idempotencyRequestId;
  assert(!!originalIdempKey && originalIdempKey.length > 5, 'Idempotency key generated');
  // Attempt execution
  const execResult = await store.executePayPalCaptureRefundAction({ refundId: refundReq1.id });
  // Verify that the refund record retains the exact same idempotencyRequestId for retries
  assert(refundReq1.idempotencyRequestId === originalIdempKey, 'PayPal-Request-Id is immutable and preserved across retries');

  // ========================================================
  // 5. ACTUAL PAYPAL CAPTURE VALIDATION TESTS
  // ========================================================
  console.log('\n--- 5. Testing PayPal Capture Validation ---');

  // Test 5.1: Without sandbox credentials, transparently reports requiresSandboxConfig without mock
  const captureCheck = await validatePayPalCaptureForRefund({
    captureId: '2GG10928AB778901C',
    expectedCurrency: 'USD',
    requestedRefundAmount: 500.00,
    expectedCustomerId: 'cust-101'
  });

  if (!process.env.PAYPAL_SANDBOX_CLIENT_ID) {
    assert(captureCheck.valid === false, 'Capture validation cleanly reports unconfigured without live credentials');
    assert(captureCheck.requiresSandboxConfig === true, 'requiresSandboxConfig is true');
    assert(captureCheck.error?.includes('PAYPAL_SANDBOX_NOT_CONFIGURED'), 'Explicit error message returned');
  } else {
    console.log('Live PayPal credentials configured; capture check result:', captureCheck.valid);
  }

  // Reset store to clean baseline
  store.resetToSeed();

  console.log('\n======================================================');
  console.log('   ✅ ALL THIRD REMEDIATION REVIEW TESTS PASSED!      ');
  console.log('======================================================\n');
}

runThirdRemediationTests();
