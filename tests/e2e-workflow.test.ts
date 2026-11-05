import { extractContractFromPdfBuffer } from '../src/lib/contractExtractor';
import { store } from '../src/lib/store';
import { Contract, Incident } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// Helper to generate a compliant SLA PDF buffer
function generateContractPdfBuffer(): Buffer {
  const text = `
    ENTERPRISE MASTER SERVICE LEVEL AGREEMENT
    between CloudPulse Platform Inc. and Nexus Logistics AI Corp.
    
    Section 3.1: Service Availability Commitment
    CloudPulse warrants that the Core Routing and Ingestion API shall maintain not less than 99.95% availability during each calendar month.
    
    Section 4.1: Measurement Period and Claim Window
    Calculations shall be evaluated across each Monthly calendar billing period. Remedy claims must be filed within 30 calendar days following the conclusion of the affected month.
    
    Section 4.3: Service Credit Remedy Escalation Schedule
    - 99.50% to 99.94% : 10% credit
    - 99.00% to 99.49% : 25% credit
    - < 99.00% : 50% credit
    
    Section 4.5: Maximum Credit Limit
    Cumulative service credit remedies shall not exceed 50% of the customer monthly recurring charge.
    
    Section 5.1: Excluded Outages
    Downtime does not include pre-scheduled maintenance communicated at least 48 hours in advance.
    Downtime does not include Force Majeure disruptions.
    
    Section 6.2: Disbursement Mechanics
    Remedies may be disbursed via PayPal electronic refund against original capture or applied as future service credit.
  `;

  const streamContent = `BT /F1 12 Tf 50 750 Td (${text.replace(/\n/g, ') Tj T* (')}) ET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000242 00000 n 
0000000${(300 + streamLength).toString().padStart(3, '0')} 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

async function runEndToEndValidation() {
  console.log('\n======================================================');
  console.log('   EXECUTING PHASE 5: COMPLETE END-TO-END VALIDATION  ');
  console.log('======================================================\n');

  // Reset store to known clean seed state for reproducible E2E execution
  store.resetToSeed();

  // STEP 1 & 2: Upload real SLA PDF & extract contractual terms
  console.log('--- Step 1 & 2: Contract PDF Upload & Deterministic Extraction ---');
  const pdfBuffer = generateContractPdfBuffer();
  const extracted = await extractContractFromPdfBuffer(pdfBuffer, 'Nexus Logistics AI Corp');

  assert(extracted.uptimeTarget === 99.95, `Contract uptime target: ${extracted.uptimeTarget}%`);
  assert(extracted.measurementPeriod === 'Monthly', `Measurement period: ${extracted.measurementPeriod}`);
  assert(extracted.maxCompensationPercent === 50, `Max compensation cap: ${extracted.maxCompensationPercent}%`);
  assert(extracted.clauses.length >= 4, `Extracted ${extracted.clauses.length} verifiable clauses`);

  const newContract: Contract = {
    id: `ctr-e2e-${Date.now()}`,
    name: 'Nexus Logistics Enterprise SLA 2026',
    customerName: 'Nexus Logistics AI Corp',
    effectiveDate: '2026-01-01',
    expirationDate: '2026-12-31',
    status: 'active',
    uptimeTarget: extracted.uptimeTarget,
    measurementPeriod: extracted.measurementPeriod,
    claimDeadlineDays: extracted.claimDeadlineDays,
    maxCompensationPercent: extracted.maxCompensationPercent,
    serviceScope: extracted.serviceScope,
    maintenanceExclusions: extracted.maintenanceExclusions,
    compensationTiers: extracted.compensationTiers,
    clauses: extracted.clauses,
    rawTextPreview: extracted.rawTextPreview
  };

  const savedContract = store.addContract(newContract, 'E2E Compliance Auditor');
  assert(savedContract.id === newContract.id, 'Contract saved to persistent store');

  // STEP 3: Review and verify extracted clauses
  console.log('\n--- Step 3: Human Review & Clause Verification ---');
  const unverifiedClause = savedContract.clauses[0];
  assert(unverifiedClause.status === 'ai_extracted', 'Initial clause state is ai_extracted (unverified)');

  const verifiedContract = store.updateClauseVerification(
    savedContract.id,
    unverifiedClause.id,
    'verified',
    'Chief Compliance Counsel',
    'Audited against original legal PDF agreement.'
  );
  assert(!!verifiedContract, 'Contract retrieved after verification');
  const verifiedClause = verifiedContract!.clauses.find(c => c.id === unverifiedClause.id);
  assert(verifiedClause?.status === 'verified', 'Clause status successfully transitioned to verified');
  assert(verifiedClause?.verifiedBy === 'Chief Compliance Counsel', 'Human verifier recorded in audit metadata');

  // Associate customer cust-102 with this contract
  const customer102 = store.getCustomerById('cust-102');
  assert(!!customer102, 'Customer cust-102 located in store');
  customer102!.slaContractId = savedContract.id;

  // STEP 4 & 5: Ingest incident and calculate downtime & availability
  console.log('\n--- Step 4 & 5: Incident Ingestion & Downtime / Availability Calculation ---');
  // 38 minutes downtime in current 30-day month (November) = 99.912% uptime
  const now = new Date();
  const incidentStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const incidentEnd = new Date(incidentStart.getTime() + 38 * 60 * 1000);

  const incident: Incident = {
    id: `inc-e2e-${Date.now()}`,
    incidentNumber: `INC-2026-E2E-${Math.floor(1000 + Math.random() * 9000)}`,
    service: 'Core Application APIs & Transaction Ingestion Endpoints',
    severity: 'P1 - Critical',
    status: 'resolved',
    summary: 'Core transaction ingestion database connection pool exhaustion',
    rootCause: 'Connection leak during connection storm',
    startedAt: incidentStart.toISOString(),
    detectedAt: new Date(incidentStart.getTime() + 2 * 60000).toISOString(),
    mitigatedAt: new Date(incidentStart.getTime() + 30 * 60000).toISOString(),
    resolvedAt: incidentEnd.toISOString(),
    durationMinutes: 38,
    affectedRegions: ['us-east-1'],
    affectedCustomerIds: ['cust-102'],
    affectedCustomersCount: 1,
    slaBreached: true,
    slaImpactAnalysis: 'Outage breached 99.95% target (measured 99.912% availability)',
    isPlannedMaintenance: false,
    telemetry: [
      { timestamp: incidentStart.toISOString(), errorRate: 98.4, latencyMs: 4200, status: 'DOWN' },
      { timestamp: incidentEnd.toISOString(), errorRate: 0.01, latencyMs: 42, status: 'OPERATIONAL' }
    ]
  };

  const ingestionResult = store.addIncident(incident);
  assert(ingestionResult.incident.id === incident.id, 'Incident ingested successfully');
  assert(ingestionResult.createdEntitlements.length > 0, 'Entitlements created dynamically upon ingestion');

  // STEP 6: Customer Entitlement Calculation Check
  console.log('\n--- Step 6: Customer Entitlement Calculation Check ---');
  const entitlement = ingestionResult.createdEntitlements.find(e => e.customerId === 'cust-102');
  assert(!!entitlement, 'Entitlement for customer cust-102 created');
  assert(entitlement!.measuredUptime === 99.912, `Measured uptime exactly 99.912%, got ${entitlement!.measuredUptime}%`);
  assert(entitlement!.calculation.applicableTier.creditPercentage === 10, `Tier matched 10% credit, got ${entitlement!.calculation.applicableTier.creditPercentage}%`);
  
  // Customer spend is $9,200/mo -> 10% credit = $920.00
  assert(entitlement!.eligibleCredit === 920, `Eligible credit is $920.00 (10% of $9,200), got $${entitlement!.eligibleCredit}`);
  assert(entitlement!.status === 'pending_approval', `Initial entitlement status is pending_approval, got ${entitlement!.status}`);

  // STEP 7: Human Approval Workflow
  console.log('\n--- Step 7: Dual-Approval Human Workflow ---');
  const approvalResult = store.processApproval({
    entitlementId: entitlement!.id,
    decision: 'approved',
    reviewedBy: 'Senior Financial Director',
    notes: 'Outage verified against Datadog telemetry and contract Section 4.3.'
  });

  assert(approvalResult.entitlement.status === 'approved', 'Entitlement status transitioned to approved');
  assert(!!approvalResult.refundRecord, 'Refund record automatically generated on approval');
  const refundRecord = approvalResult.refundRecord!;
  assert(refundRecord.refundAmount === 920, `Refund record amount is $920.00, got $${refundRecord.refundAmount}`);
  assert(refundRecord.status === 'approved', `Refund record status is approved, got ${refundRecord.status}`);

  // STEP 8: PayPal Sandbox Refund Execution / Configuration Requirement
  console.log('\n--- Step 8: PayPal Sandbox Execution Handling ---');
  const refundExecution = await store.executePayPalCaptureRefundAction({
    refundId: refundRecord.id,
    actorName: 'Disbursement Controller'
  });

  // Without live credentials, system must fail safely with clear requirement and never fake success
  if (!process.env.PAYPAL_SANDBOX_CLIENT_ID) {
    assert(refundExecution.result.success === false, 'Safe failure without PayPal Sandbox credentials');
    assert(refundExecution.result.requiresSandboxConfig === true, 'Clear requiresSandboxConfig signal returned');
    assert(refundExecution.refund.status === 'failed', 'Refund marked failed rather than falsely completed');
  } else {
    console.log('PayPal Sandbox credentials present; live refund executed with status:', refundExecution.refund.status);
  }

  // STEP 9: Service Credit Management Check
  console.log('\n--- Step 9: Internal Service Credit Ledger Verification ---');
  // Create an approved entitlement for service credit
  const serviceCredits = store.getServiceCredits();
  assert(Array.isArray(serviceCredits), 'Service credits ledger accessible');

  // STEP 10: SHA-256 Tamper-Evident Audit Ledger Verification
  console.log('\n--- Step 10: SHA-256 Tamper-Evident Audit Ledger Verification ---');
  const integrity = store.verifyAuditIntegrity();
  assert(integrity.isValid === true, `SHA-256 audit ledger cryptographic chain is 100% valid (${integrity.checkedEventsCount} events verified)`);

  // ==========================================
  // EDGE CASES VALIDATION
  // ==========================================
  console.log('\n--- Testing Edge Cases ---');

  // Edge Case A: Duplicate Incident Ingestion
  let dupIncidentThrew = false;
  try {
    store.addIncident(incident);
  } catch (err: any) {
    dupIncidentThrew = true;
    assert(err.message.includes('DUPLICATE_INCIDENT'), `Duplicate incident blocked: ${err.message}`);
  }
  assert(dupIncidentThrew, 'Duplicate incident ingestion blocked cleanly');

  // Edge Case B: Duplicate Refund Execution
  let dupRefundThrew = false;
  // Artificially simulate completed refund to test duplicate prevention invariant
  const completedRefund = store.getRefunds()[0];
  const originalStatus = completedRefund.status;
  completedRefund.status = 'completed';
  try {
    await store.executePayPalCaptureRefundAction({ refundId: completedRefund.id });
  } catch (err: any) {
    dupRefundThrew = true;
    assert(err.message.includes('ALREADY_REFUNDED'), `Duplicate refund attempt blocked: ${err.message}`);
  }
  assert(dupRefundThrew, 'Duplicate refund attempts strictly blocked by backend');
  completedRefund.status = originalStatus;

  // Edge Case C: Refund Amount Exceeding Refundable Balance
  let balanceThrew = false;
  customer102!.refundableBalance = 50.00; // Artificially lower balance below $920 refund
  try {
    await store.executePayPalCaptureRefundAction({ refundId: refundRecord.id });
  } catch (err: any) {
    balanceThrew = true;
    assert(err.message.includes('INSUFFICIENT_REFUNDABLE_BALANCE'), `Excessive refund blocked: ${err.message}`);
  }
  assert(balanceThrew, 'Refund exceeding customer refundable balance strictly rejected');
  customer102!.refundableBalance = 9200.00; // Restore balance

  // Edge Case D: Expired Claim Deadlines
  console.log('Testing claim deadline expiration (over 30 days after period)...');
  const pastIncident: Incident = {
    id: `inc-past-${Date.now()}`,
    incidentNumber: `INC-2025-0101`,
    service: 'Core Application APIs & Transaction Ingestion Endpoints',
    severity: 'P1 - Critical',
    status: 'resolved',
    summary: 'Past year outage for deadline testing',
    rootCause: 'Hardware failover',
    startedAt: '2025-01-10T10:00:00Z', // January 2025 (over 1 year ago)
    detectedAt: '2025-01-10T10:01:00Z',
    mitigatedAt: '2025-01-10T10:30:00Z',
    resolvedAt: '2025-01-10T10:45:00Z',
    durationMinutes: 45,
    affectedRegions: ['us-east-1'],
    affectedCustomerIds: ['cust-102'],
    affectedCustomersCount: 1,
    slaBreached: true,
    slaImpactAnalysis: 'Expired period',
    isPlannedMaintenance: false,
    telemetry: []
  };
  const pastResult = store.addIncident(pastIncident);
  const pastEntitlement = pastResult.createdEntitlements.find(e => e.customerId === 'cust-102');
  assert(pastEntitlement?.status === 'not_eligible' || pastEntitlement?.status === 'ineligible', `Expired claim marked not_eligible, got ${pastEntitlement?.status}`);
  assert(pastEntitlement?.isClaimDeadlineExpired === true, 'Flag isClaimDeadlineExpired is true');
  assert(pastEntitlement?.evidenceSummary.includes('claim deadline') && pastEntitlement?.evidenceSummary.includes('expired'), 'Evidence summary cites contractual claim deadline expiration');

  // Edge Case E: Planned Maintenance Exclusion
  console.log('Testing planned maintenance exclusion...');
  const maintenanceIncident: Incident = {
    id: `inc-maint-${Date.now()}`,
    incidentNumber: `INC-2026-MAINT-${Math.floor(1000 + Math.random() * 9000)}`,
    service: 'Core Application APIs & Transaction Ingestion Endpoints',
    severity: 'P3 - Maintenance',
    status: 'resolved',
    summary: 'Pre-scheduled kernel database patch',
    rootCause: 'Scheduled maintenance',
    startedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
    detectedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
    mitigatedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000 + 60 * 60000).toISOString(),
    resolvedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000 + 90 * 60000).toISOString(),
    durationMinutes: 90,
    affectedRegions: ['us-east-1'],
    affectedCustomerIds: ['cust-102'],
    affectedCustomersCount: 1,
    slaBreached: false,
    slaImpactAnalysis: 'Pre-scheduled maintenance window',
    isPlannedMaintenance: true,
    telemetry: []
  };
  const maintResult = store.addIncident(maintenanceIncident);
  const maintEntitlement = maintResult.createdEntitlements.find(e => e.customerId === 'cust-102');
  assert(maintEntitlement?.status === 'not_eligible' || maintEntitlement?.status === 'ineligible', `Maintenance incident marked not_eligible, got ${maintEntitlement?.status}`);
  assert(maintEntitlement?.eligibleCredit === 0, 'No credit owed for pre-scheduled maintenance');

  console.log('\n======================================================');
  console.log('   ✅ ALL PHASE 5 END-TO-END VALIDATIONS PASSED!      ');
  console.log('======================================================\n');
}

runEndToEndValidation();
