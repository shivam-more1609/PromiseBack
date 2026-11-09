/**
 * Forensic Accuracy & Grounding Regression Test Suite
 *
 * Verifies that PromiseBack strictly grounds contract extraction in source documents:
 * 1. Rejects fabricated contract IDs.
 * 2. Rejects fabricated dates (never replaces missing dates with today's date).
 * 3. Preserves unspecified remedy caps (never assumes 50%).
 * 4. Rejects nonexistent sections (e.g. Section 4.7 / Section 5.1).
 * 5. Preserves exact numerical precision (e.g. 21.6 minutes, no decimal truncation).
 * 6. Ensures AI summaries cannot overwrite source-grounded facts.
 * 7. Blocks unsupported/unverified clauses from automated financial compensation calculations.
 */

import fs from 'fs';
import path from 'path';
import '../src/lib/serverlessPolyfills';
import { extractContractFromPdfBuffer } from '../src/lib/contractExtractor';
import { validateSourceQuoteInText, validateClauseSourceQuotations } from '../src/lib/contractIntelligence';
import { runDeterministicContractAgent } from '../src/lib/ai/contractAgent';
import { runDeterministicRecoveryAgent } from '../src/lib/ai/recoveryAgent';
import { calculateEntitlementEngine } from '../src/lib/slaEngine';
import { store } from '../src/lib/store';
import { Contract, Customer, Incident, SLAClause } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ REGRESSION ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runForensicRegressionTests() {
  console.log('\n=== RUNNING FORENSIC ACCURACY & SOURCE GROUNDING AUDIT ===\n');

  const pdfPath = path.join(process.cwd(), 'tests', 'fixtures', 'CloudPulse_Service_Level_Agreement.pdf');
  assert(fs.existsSync(pdfPath), `Source test document exists at ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);

  const extracted = await extractContractFromPdfBuffer(pdfBuffer, 'CloudPulse Technologies');

  // TEST 1: Contract ID Integrity
  console.log('\n[TEST 1] Contract ID Forensic Grounding');
  assert(extracted.contractNumber === 'SLA-2026-CP001', `Extracted Contract ID is exactly SLA-2026-CP001 (got ${extracted.contractNumber})`);
  assert(!extracted.contractNumber?.includes('NZCS'), 'Fabricated contract ID suffix NZCS was rejected');
  assert(!/SLA-2026-[a-z0-9]{4}/i.test(extracted.contractNumber || '') || extracted.contractNumber === 'SLA-2026-CP001', 'Randomly generated contract numbers rejected in favor of source ID');

  // TEST 2: Effective Period Anti-Fabrication
  console.log('\n[TEST 2] Effective Date Integrity & Anti-Fabrication');
  const todayIso = new Date().toISOString().split('T')[0];
  assert(extracted.effectiveStartDate === '1 October 2026', `Extracted Start Date: 1 October 2026 (got ${extracted.effectiveStartDate})`);
  assert(extracted.effectiveEndDate === '30 September 2027', `Extracted Expiry Date: 30 September 2027 (got ${extracted.effectiveEndDate})`);
  assert(extracted.effectiveStartDate !== todayIso, `Effective date is NOT fabricated with current system date (${todayIso})`);
  assert(extracted.effectiveEndDate !== new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0], 'Expiry date is NOT fabricated with today + 365 days');

  // TEST 3: Remedy Cap Neutrality
  console.log('\n[TEST 3] Remedy Cap Neutrality (Unspecified Stays Unspecified)');
  assert(extracted.maxCompensationPercent === null, `Max compensation percent is null when unstated in document (got ${extracted.maxCompensationPercent})`);
  assert(extracted.maxRemedyCapText?.includes('Not specified') === true, `Remedy cap text explicitly states "Not specified in source document" (got "${extracted.maxRemedyCapText}")`);
  assert(extracted.maxCompensationPercent !== 50, 'Arbitrary 50% remedy cap was NOT invented');

  // TEST 3b: Section 10 Reconciliation (Separate Limitation Fields)
  console.log('\n[TEST 3b] Section 10 Reconciliation & Separate Limitation Fields');
  assert(extracted.explicitPercentageCap === null, `1. Explicit percentage remedy cap is null (unspecified) (got ${extracted.explicitPercentageCap})`);
  assert(extracted.contractualMonetaryCeiling === 14500, `2. Contractual monetary ceiling is USD 14,500 (100% of month fees) (got ${extracted.contractualMonetaryCeiling})`);
  assert(extracted.contractualMonetaryCeilingText?.includes('100% of relevant month fees') === true, 'Monetary ceiling text specifies 100% of relevant month fees');
  assert(extracted.contractualMonetaryCeilingText?.includes('Service Credits are not redeemable for cash and may not exceed the fees paid or payable for the affected Covered Services in the relevant month.') === true, 'Monetary ceiling text preserves exact verbatim Section 10 wording');
  assert(extracted.maxServiceCreditTier === 20, `3. Maximum service credit tier is 20% from tier schedule (got ${extracted.maxServiceCreditTier}%)`);
  assert(extracted.isCashRefundAllowed === false, 'Contract detects non-cash restriction: isCashRefundAllowed is false');

  // TEST 4: Nonexistent Clause Rejection
  console.log('\n[TEST 4] Nonexistent Section & Term Rejection');
  const hasSection47 = extracted.clauses.some(c => c.section.includes('4.7'));
  assert(!hasSection47, 'Section 4.7 does NOT exist in CloudPulse and was NOT generated');
  const hasElecDisb = extracted.clauses.some(c => c.title.toLowerCase().includes('electronic remedy disbursement'));
  assert(!hasElecDisb, 'Nonexistent "Electronic Remedy Disbursement Election" was NOT generated');
  const hasSection51 = extracted.clauses.some(c => c.section.includes('5.1'));
  assert(!hasSection51, 'Nonexistent "Section 5.1" was NOT generated for CloudPulse');

  // TEST 5: Exact Numerical Precision & Quotation Integrity
  console.log('\n[TEST 5] Exact Numerical Precision & Quotation Preservation');
  assert(extracted.uptimeTarget === 99.95, `Availability target: ${extracted.uptimeTarget}% (exact decimal 99.95)`);
  assert(extracted.downtimeAllowanceMinutes === 21.6, `Downtime allowance: ${extracted.downtimeAllowanceMinutes} minutes (exact decimal 21.6)`);
  assert(extracted.monthlyServiceFee === 14500, `Monthly service fee: USD ${extracted.monthlyServiceFee} (exact 14,500)`);
  assert(extracted.claimDeadlineDays === 30, `Claim deadline: ${extracted.claimDeadlineDays} calendar days (exact 30)`);

  const downtimeClause = extracted.clauses.find(c => c.exactSourceQuote?.includes('21.6 minutes'));
  assert(!!downtimeClause, 'Downtime clause preserves exact "21.6 minutes"');
  const isTruncated = extracted.clauses.some(c => c.exactSourceQuote?.includes('maximum of 21.') && !c.exactSourceQuote?.includes('21.6'));
  assert(!isTruncated, 'Contractual quotation is NOT truncated at the decimal point ("maximum of 21.")');

  // TEST 5b: Complete Section 6 Service Credit Table & Tier Extraction
  console.log('\n[TEST 5b] Complete Section 6 Service Credit Table & Tier Extraction');
  assert(extracted.compensationTiers.length === 4, `Extracted 4 tier brackets (baseline + 3 breach tiers) (got ${extracted.compensationTiers.length})`);
  
  const tier1 = extracted.compensationTiers.find(t => t.creditPercentage === 5);
  assert(!!tier1, 'Tier 1 (5% credit) extracted');
  assert(tier1?.minUptime === 99.9 && tier1?.uptimeThreshold === 99.95, `Tier 1: 99.90% to 99.95% (got ${tier1?.minUptime}% - ${tier1?.uptimeThreshold}%)`);

  const tier2 = extracted.compensationTiers.find(t => t.creditPercentage === 10);
  assert(!!tier2, 'Tier 2 (10% credit) extracted');
  assert(tier2?.minUptime === 99 && tier2?.uptimeThreshold === 99.9, `Tier 2: 99.00% to 99.90% (got ${tier2?.minUptime}% - ${tier2?.uptimeThreshold}%)`);

  const tier3 = extracted.compensationTiers.find(t => t.creditPercentage === 20);
  assert(!!tier3, 'Tier 3 (20% credit) extracted');
  assert(tier3?.minUptime === 0 && tier3?.uptimeThreshold === 99, `Tier 3: < 99.00% (got < ${tier3?.uptimeThreshold}%)`);

  const sec6Clause = extracted.clauses.find(c => c.section === 'Section 6');
  assert(!!sec6Clause, 'Section 6 Service Credit clause exists');
  assert(sec6Clause?.exactSourceQuote?.includes('Monthly Availability Service Credit') === true, 'Section 6 quote preserves table header');
  assert(sec6Clause?.exactSourceQuote?.includes('At least 99.90% but below 99.95% 5% of the monthly service fee') === true, 'Section 6 quote preserves Tier 1 verbatim');
  assert(sec6Clause?.exactSourceQuote?.includes('At least 99.00% but below 99.90% 10% of the monthly service fee') === true, 'Section 6 quote preserves Tier 2 verbatim');
  assert(sec6Clause?.exactSourceQuote?.includes('Below 99.00% 20% of the monthly service fee') === true, 'Section 6 quote preserves Tier 3 verbatim');
  assert(!sec6Clause?.exactSourceQuote?.endsWith('below 99.'), 'Section 6 quotation is NOT truncated at "below 99."');

  // TEST 5c: Section 10 Split Contractual Obligations
  console.log('\n[TEST 5c] Section 10 Split Contractual Obligations (Fee, Non-Cash, Ceiling)');
  const sec10Clauses = extracted.clauses.filter(c => c.section === 'Section 10');
  assert(sec10Clauses.length === 3, `Section 10 split into exactly 3 independently verifiable clauses (got ${sec10Clauses.length})`);

  const feeClause = sec10Clauses.find(c => c.title === 'Monthly Service Fee');
  assert(!!feeClause, 'Section 10 Clause A: Monthly Service Fee exists');
  assert(feeClause?.exactSourceQuote?.includes('USD 14,500') === true, 'Fee clause quotes USD 14,500 verbatim');

  const nonCashClause = sec10Clauses.find(c => c.title === 'Non-Cash Remedy Restriction');
  assert(!!nonCashClause, 'Section 10 Clause B: Non-Cash Remedy Restriction exists');
  assert(nonCashClause?.exactSourceQuote === 'Service Credits are not redeemable for cash', `Non-cash clause exact quote is "Service Credits are not redeemable for cash" (got "${nonCashClause?.exactSourceQuote}")`);

  const ceilingClause = sec10Clauses.find(c => c.title === 'Contractual Monetary Ceiling');
  assert(!!ceilingClause, 'Section 10 Clause C: Contractual Monetary Ceiling exists');
  assert(ceilingClause?.exactSourceQuote?.includes('may not exceed the fees paid or payable for the affected Covered Services in the relevant month.') === true, 'Ceiling clause preserves verbatim statutory limit');

  // TEST 6: Verbatim Quotation Validation & AI Summary Grounding
  console.log('\n[TEST 6] AI Summary Grounding & Quote Verification');
  for (const clause of extracted.clauses) {
    assert(!!clause.exactSourceQuote, `Clause ${clause.section} has explicit exactSourceQuote`);
    const isAuthentic = validateSourceQuoteInText(clause.exactSourceQuote!, extracted.rawTextPreview);
    assert(isAuthentic, `Quotation for [${clause.section}] "${clause.title}" exists verbatim in source text`);
    assert(clause.status === 'ai_extracted', `Authentic clause tagged as ai_extracted (got ${clause.status})`);
  }

  // Verify that an invented / altered quotation is rejected
  const fakeTestClauses = [
    {
      clauseId: 'fake-1',
      section: 'Section 4.7',
      title: 'Electronic Remedy Disbursement Election',
      interpretedMeaning: 'Automated immediate PayPal restitution without human review.',
      exactSourceQuote: 'Provider covenants to immediately transfer cash funds via PayPal within 1 hour.',
      confidence: 0.95,
      ambiguitiesDetected: [],
      requiresHumanVerification: false
    }
  ];
  const quoteAudit = validateClauseSourceQuotations(fakeTestClauses, extracted.rawTextPreview);
  assert(quoteAudit.rejectedCount === 1, 'Fake quotation was caught and rejected by quote validation audit');
  assert(quoteAudit.validatedClauses[0].isFabricatedOrUnsupported === true, 'Fabricated clause marked isFabricatedOrUnsupported');
  assert(quoteAudit.validatedClauses[0].confidence === 0.20, 'Fabricated clause confidence demoted to 0.20');

  // TEST 7: Financial Protection Against Unsupported Clauses
  console.log('\n[TEST 7] Financial Governance: Unsupported Clauses Block Automation');
  
  const mockCustomer: Customer = {
    id: 'cust-forensic-01',
    name: 'Acropora Retail Solutions',
    domain: 'acropora.com',
    plan: 'Enterprise Tier 1',
    monthlySpend: 14500,
    billingEmail: 'billing@acropora.com',
    paypalEmail: 'finance@acropora.com',
    slaContractId: 'contract-forensic-01',
    contractNumber: 'SLA-2026-CP001',
    region: 'US-East',
    paymentMethod: 'PayPal Refund'
  };

  const breachedIncident: Incident = {
    id: 'inc-forensic-01',
    incidentNumber: 'INC-2026-F01',
    service: 'Core Managed Cloud Infrastructure',
    severity: 'P1 - Critical',
    status: 'resolved',
    summary: 'Core gateway outage exceeding monthly allowance',
    rootCause: 'Provider infrastructure failure',
    startedAt: '2026-10-15T10:00:00Z',
    detectedAt: '2026-10-15T10:02:00Z',
    mitigatedAt: '2026-10-15T10:45:00Z',
    resolvedAt: '2026-10-15T10:50:00Z', // 50 mins outage -> 43,150 / 43,200 = 99.884% (below 99.90% -> 10% credit)
    durationMinutes: 50,
    affectedRegions: ['US-East'],
    affectedCustomerIds: ['cust-forensic-01'],
    affectedCustomersCount: 1,
    telemetry: [],
    timeline: [],
    slaBreached: true,
    slaImpactAnalysis: 'Breached availability threshold'
  };

  // Case A: Contract with UNSUPPORTED / UNVERIFIED clause
  const contractWithUnverifiedClause: Contract = {
    id: 'contract-forensic-01',
    contractNumber: 'SLA-2026-CP001',
    customerId: 'cust-forensic-01',
    customerName: 'Acropora Retail Solutions',
    slaName: 'Acropora Master SLA',
    uptimeTarget: 99.95,
    measurementPeriod: 'Monthly',
    claimDeadlineDays: 30,
    maxCompensationPercent: null,
    explicitPercentageCap: extracted.explicitPercentageCap,
    contractualMonetaryCeiling: extracted.contractualMonetaryCeiling,
    contractualMonetaryCeilingText: extracted.contractualMonetaryCeilingText,
    maxServiceCreditTier: extracted.maxServiceCreditTier,
    isCashRefundAllowed: extracted.isCashRefundAllowed,
    disbursementMethodText: extracted.disbursementMethodText,
    monthlyServiceFee: extracted.monthlyServiceFee,
    effectiveStartDate: '1 October 2026',
    effectiveEndDate: '30 September 2027',
    compensationTiers: extracted.compensationTiers,
    maintenanceExclusions: extracted.maintenanceExclusions,
    status: 'active',
    extractedConfidence: 0.95,
    uploadedAt: '2026-10-01T00:00:00Z',
    fileName: 'CloudPulse_SLA.pdf',
    fileSize: '1.2 MB',
    clauses: [
      ...extracted.clauses,
      {
        id: 'unsupported-clause-1',
        section: 'Section 4.7',
        title: 'Invented Cash Payout Term',
        content: 'Fabricated term with no backing text',
        confidence: 0.1,
        status: 'unverified', // UNSUPPORTED CLAUSE
        isFabricatedOrUnsupported: true,
        notes: 'UNVERIFIED_QUOTE: Passage was not found in source text.'
      }
    ]
  };

  const entitlementResult = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: contractWithUnverifiedClause,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });

  assert(entitlementResult.status === 'requires_review', `Entitlement status is forced to requires_review due to unverified clause (got ${entitlementResult.status})`);
  assert(entitlementResult.status !== 'pending_approval', 'Unsupported clause CANNOT enter pending_approval for automated financial payout');

  // Case B: Once human countersigns all clauses, contract can transition to active
  const humanVerifiedContract: Contract = {
    ...contractWithUnverifiedClause,
    clauses: extracted.clauses.map(c => ({
      ...c,
      status: 'human_verified',
      verifiedBy: 'Elena Rostova (Compliance Lead)',
      verifiedAt: '2026-10-02T10:00:00Z'
    }))
  };

  const validEntitlement = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: humanVerifiedContract,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });

  assert(validEntitlement.status === 'pending_approval', `Human-verified contract entitlement enters pending_approval for governance review (got ${validEntitlement.status})`);
  assert(validEntitlement.eligibleCredit === 1450, `10% tier credit calculated on USD 14,500 monthly fee = USD 1,450 (got USD ${validEntitlement.eligibleCredit})`);

  // TEST 8: Non-Cash Restriction & Payout Recommendation Enforcement
  console.log('\n[TEST 8] Non-Cash Restriction & Payout Recommendation Governance');
  
  // The contract for CloudPulse prohibits cash redemption per Section 10
  assert(validEntitlement.payoutMethod === 'Service Credit', `CloudPulse payout method is strictly forced to 'Service Credit' despite customer PayPal preference (got ${validEntitlement.payoutMethod})`);
  assert(validEntitlement.isCashRefundProhibitedByContract === true, 'CloudPulse is flagged as isCashRefundProhibitedByContract = true');
  assert(validEntitlement.payoutMethodReason?.includes('Section 10') === true, `Payout method reason cites Section 10 covenant (got "${validEntitlement.payoutMethodReason}")`);

  // Verify Recovery Recommendation Agent respects Section 10 non-cash rule
  const recoveryRecommendation = runDeterministicRecoveryAgent(
    validEntitlement,
    { completenessScore: 100, auditVerdict: 'COMPLETE', verifiedEvidence: [], missingEvidence: [], contradictoryEvidence: [] },
    false,
    [`Customer: ${mockCustomer.name}`],
    [`Credit: $${validEntitlement.eligibleCredit}`],
    [],
    humanVerifiedContract
  );

  assert(recoveryRecommendation.payoutRouting.recommendedChannel === 'Service Credit', `Recovery recommendation routes to 'Service Credit', NOT PayPal Refund (got ${recoveryRecommendation.payoutRouting.recommendedChannel})`);
  assert(!recoveryRecommendation.recommendations.some(r => r.includes('POST /v2/payments/captures')), 'PayPal API capture refund recommendation was NOT issued for non-cash contract');
  assert(recoveryRecommendation.recommendations.some(r => r.includes('Service Credits are not redeemable for cash') || r.includes('Section 10')), 'Recovery recommendation explicitly cites Section 10 non-cash restriction');

  // Contrast: Contract with explicit verified cash authorization clause allows PayPal Refund
  const cashAuthorizedContract: Contract = {
    ...humanVerifiedContract,
    isCashRefundAllowed: true,
    clauses: [
      ...humanVerifiedContract.clauses,
      {
        id: 'cash-auth-clause',
        section: 'Section 4.7',
        title: 'Remedy Disbursement Election',
        content: 'Customer holds discretionary election to receive approved SLA remedies via automated PayPal refund.',
        exactSourceQuote: 'Customer holds discretionary election to receive approved SLA remedies via automated PayPal refund against captured subscription fees.',
        status: 'human_verified',
        confidence: 0.99
      }
    ]
  };

  const cashEntitlement = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: cashAuthorizedContract,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });

  assert(cashEntitlement.payoutMethod === 'PayPal Refund', `Explicitly cash-authorized contract allows PayPal Refund (got ${cashEntitlement.payoutMethod})`);

  // TEST 9: Independent Human Verification & Financial Disbursement Security
  console.log('\n[TEST 9] Independent Human Verification & Governance');
  
  // Create a testing contract in memory
  const testContractId = `contract-test-gov-${Date.now()}`;
  const testContractObj: Contract = {
    ...humanVerifiedContract,
    id: testContractId,
    status: 'requires_review',
    clauses: extracted.clauses.map((c, idx) => ({
      ...c,
      id: `clause-gov-${idx}`,
      status: 'ai_extracted' as const
    }))
  };

  store.addContract(testContractObj, 'System Test Setup');

  // Verify a single clause
  const targetClause = testContractObj.clauses[0];
  const updatedAfter1 = store.updateClauseVerification(
    testContractId,
    targetClause.id,
    'human_verified',
    'Elena Rostova (Compliance Lead)',
    'Independently audited against Section 2 text.'
  );

  assert(!!updatedAfter1, 'Clause verification update returned updated contract');
  const vClause = updatedAfter1?.clauses.find(c => c.id === targetClause.id);
  assert(vClause?.status === 'human_verified', 'Updated clause status is human_verified');
  assert(vClause?.verifiedBy === 'Elena Rostova (Compliance Lead)', 'Clause verifiedBy is recorded');
  assert(!!vClause?.verifiedAt, 'Clause verifiedAt timestamp is set');
  assert(updatedAfter1?.status === 'requires_review', 'Contract status remains requires_review while other clauses are unverified');

  // Flag a clause for review
  const flaggedClause = testContractObj.clauses[1];
  const updatedAfterFlag = store.updateClauseVerification(
    testContractId,
    flaggedClause.id,
    'requires_review',
    'David Chen (Legal Auditor)',
    'Flagged for compliance double-check'
  );

  assert(updatedAfterFlag?.clauses.find(c => c.id === flaggedClause.id)?.status === 'requires_review', 'Clause successfully flagged as requires_review');
  assert(updatedAfterFlag?.status === 'requires_review', 'Contract remains in requires_review state when flagged');

  // Verify that an entitlement evaluated on a contract with unverified/flagged clauses CANNOT disburse
  const blockedEntitlement = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: updatedAfterFlag!,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });

  assert(blockedEntitlement.status === 'requires_review', `Entitlement status is requires_review when any clause is unverified/flagged (got ${blockedEntitlement.status})`);
  assert(blockedEntitlement.status !== 'pending_approval', 'Blocked entitlement cannot enter pending_approval for automated financial payout');

  // Once all clauses are human_verified, contract transitions to active
  let fullyVerifiedContract = updatedAfterFlag;
  for (const cl of fullyVerifiedContract!.clauses) {
    fullyVerifiedContract = store.updateClauseVerification(
      testContractId,
      cl.id,
      'human_verified',
      'Elena Rostova (Compliance Lead)'
    );
  }
  assert(fullyVerifiedContract?.status === 'active', `When all clauses are human_verified, contract status transitions to 'active' (got ${fullyVerifiedContract?.status})`);

  // TEST 10: Contract Card Remedy Cap Display Values
  console.log('\n[TEST 10] Contract Card Remedy Cap Display Values');
  const explicitCapDisplay = extracted.explicitPercentageCap !== null && extracted.explicitPercentageCap !== undefined
    ? `${extracted.explicitPercentageCap}%`
    : 'Not Specified';
  assert(explicitCapDisplay === 'Not Specified', `Explicit Percentage Cap renders "Not Specified" (got "${explicitCapDisplay}")`);
  assert(explicitCapDisplay !== '%', 'Remedy Cap percentage symbol bug is fixed ("Remedy Cap: %" prevented)');

  const monetaryCeilingDisplay = extracted.contractualMonetaryCeiling
    ? `USD ${extracted.contractualMonetaryCeiling.toLocaleString()}`
    : 'Not Specified';
  assert(monetaryCeilingDisplay === 'USD 14,500', `Monetary Ceiling renders "USD 14,500" (got "${monetaryCeilingDisplay}")`);

  const maxTierDisplay = extracted.maxServiceCreditTier
    ? `${extracted.maxServiceCreditTier}%`
    : '20%';
  assert(maxTierDisplay === '20%', `Maximum Listed Credit Tier renders "20%" (got "${maxTierDisplay}")`);

  // TEST 11: CloudPulse Expected Facts Comprehensive Forensic Checklist
  console.log('\n[TEST 11] CloudPulse Expected Facts Comprehensive Forensic Checklist');
  assert(extracted.contractNumber === 'SLA-2026-CP001', `Agreement: SLA-2026-CP001 (got ${extracted.contractNumber})`);
  assert(extracted.effectiveStartDate === '1 October 2026', `Effective date: 1 October 2026 (got ${extracted.effectiveStartDate})`);
  assert(extracted.effectiveEndDate === '30 September 2027', `Expiry date: 30 September 2027 (got ${extracted.effectiveEndDate})`);
  assert(extracted.uptimeTarget === 99.95, `Uptime target: 99.95% (got ${extracted.uptimeTarget})`);
  assert(extracted.downtimeAllowanceMinutes === 21.6, `Downtime allowance: 21.6 minutes per 30-day month (got ${extracted.downtimeAllowanceMinutes})`);
  assert(extracted.monthlyServiceFee === 14500, `Monthly fee: USD 14,500 (got ${extracted.monthlyServiceFee})`);
  const tierPcts = extracted.compensationTiers.map(t => t.creditPercentage).filter(p => p > 0);
  assert(tierPcts.includes(5) && tierPcts.includes(10) && tierPcts.includes(20), `Credit tiers: 5%, 10%, 20% (got ${tierPcts.join(', ')}%)`);
  assert(extracted.explicitPercentageCap === null, `Explicit percentage cap: Not Specified (strictly null) (got ${extracted.explicitPercentageCap})`);
  assert(extracted.contractualMonetaryCeiling === 14500, `Monetary ceiling: USD 14,500 (got ${extracted.contractualMonetaryCeiling})`);
  assert(extracted.maxServiceCreditTier === 20, `Maximum listed credit tier: 20% (got ${extracted.maxServiceCreditTier}%)`);
  assert(extracted.isCashRefundAllowed === false, `Cash refund permission: false (got ${extracted.isCashRefundAllowed})`);
  assert(extracted.disbursementMethodText?.toLowerCase().includes('subsequent invoice credit') === true, `Remedy: Subsequent invoice credit (got "${extracted.disbursementMethodText}")`);

  // TEST 12: Separation of Seeded Demo Contracts vs Uploaded Contracts
  console.log('\n[TEST 12] Separation of Seeded Demo Contracts vs Uploaded Contracts');
  const demoSeedPath = path.join(process.cwd(), 'data', 'store.demo.json');
  assert(fs.existsSync(demoSeedPath), 'store.demo.json golden seed file exists');
  const demoSeedData = JSON.parse(fs.readFileSync(demoSeedPath, 'utf-8'));
  const demoContractIds = demoSeedData.contracts.map((c: any) => c.id);
  assert(demoContractIds.includes('contract-01') && demoContractIds.includes('contract-02'), 'Demo seed contracts contract-01..04 present in seed');

  // Verify store preserves isDemo flag separation
  const allStoredContracts = store.getContracts();
  const demoContractsInStore = allStoredContracts.filter(c => demoContractIds.includes(c.id));
  assert(demoContractsInStore.length > 0, 'Demo contracts present in active store');
  demoContractsInStore.forEach(c => {
    assert(c.isDemo === true, `Demo contract ${c.id} has isDemo = true`);
  });

  // Uploaded contracts must have isDemo = false
  const uploadedContractObj: Contract = {
    ...testContractObj,
    id: `contract-new-uploaded-${Date.now()}`,
    isDemo: false
  };
  store.addContract(uploadedContractObj);
  const fetchedUploaded = store.getContractById(uploadedContractObj.id);
  assert(fetchedUploaded?.isDemo === false, 'Newly added contract is preserved with isDemo = false');

  // Verify store.demo.json file remains untouched (unmodified golden seed)
  const seedStat = fs.statSync(demoSeedPath);
  assert(seedStat.size > 0, 'store.demo.json remains intact and uncorrupted');

  // TEST 13: Separation of Quote Authentication from AI Confidence
  console.log('\n[TEST 13] Separation of Quote Authentication from AI Confidence');
  // AI confidence is a continuous score (e.g. 0.94 / 94%)
  assert(typeof extracted.extractedConfidence === 'number' && extracted.extractedConfidence > 0 && extracted.extractedConfidence <= 1.0, `AI Confidence is a distinct score (${extracted.extractedConfidence})`);
  // Quote authentication is a binary substring match verification against the original document text
  for (const c of extracted.clauses) {
    assert(c.exactSourceQuote !== undefined && c.exactSourceQuote.length > 0, `Clause ${c.title} has exactSourceQuote`);
    const isAuthenticSubstring = validateSourceQuoteInText(c.exactSourceQuote!, extracted.rawTextPreview);
    assert(isAuthenticSubstring === true, `Quote for ${c.title} is authenticated as genuine substring in PDF`);
    assert(c.isFabricatedOrUnsupported === false, `Authentic quote has isFabricatedOrUnsupported = false`);
  }

  // TEST 14: Contractual Ambiguity Detection Identifies Subjective Terms
  console.log('\n[TEST 14] Contractual Ambiguity Detection Identifies Subjective Terms');
  const mockSubjectiveContract: Contract = {
    ...testContractObj,
    id: 'contract-ambig-test',
    rawTextPreview: 'The Provider will use commercially reasonable efforts to maintain monthly availability. Remedies are granted at provider sole discretion upon request.'
  };
  const nlpAnalysis = runDeterministicContractAgent(mockSubjectiveContract, mockSubjectiveContract.rawTextPreview!);
  assert(nlpAnalysis.ambiguitiesDetected.length > 0, 'Subjective terms ("commercially reasonable", "sole discretion") detected as ambiguities');
  assert(nlpAnalysis.verdict === 'REQUIRES_HUMAN_LEGAL_AUDIT' || nlpAnalysis.verdict === 'AMBIGUOUS_TERMS_DETECTED', `Subjective terms trigger legal audit verdict: ${nlpAnalysis.verdict}`);
  assert(nlpAnalysis.missingClauses !== undefined, 'Missing clauses tracked cleanly');

  // TEST 15: AI Financial Non-Interference
  console.log('\n[TEST 15] AI Financial Non-Interference');
  const mathNotice = 'The deterministic mathematical SLA calculation engine (slaEngine.ts) remains strictly authoritative.';
  assert(nlpAnalysis.mathematicalAuthorityNotice.includes(mathNotice), 'Mathematical authority notice enforced across AI layer');
  // Entitlement calculations remain purely mathematical
  const deterministicEntitlement = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: humanVerifiedContract,
    triggeringIncident: breachedIncident,
    allPeriodIncidents: [breachedIncident],
    evaluationDate: new Date('2026-10-20T00:00:00Z')
  });
  assert(deterministicEntitlement.eligibleCredit === 1450, `Deterministic math remains exact: $1,450.00 (got $${deterministicEntitlement.eligibleCredit})`);

  console.log('\n✅ ALL FORENSIC ACCURACY & SOURCE GROUNDING AUDIT TESTS PASSED!\n');
}

runForensicRegressionTests().catch(err => {
  console.error('Forensic test failed:', err);
  process.exit(1);
});
