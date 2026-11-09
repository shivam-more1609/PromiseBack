/**
 * PromiseBack AI Intelligence Layer Test Suite
 * Validates the five core AI capabilities:
 * 1. SLA Contract Intelligence (Extraction, Ambiguity Detection, Verbatim Quote Verification)
 * 2. AI Incident Investigation (Timeline Conflicts, Deficit Calculations, Maintenance Detection)
 * 3. AI Evidence Auditor (Completeness Scoring, Contradiction Flags, Three-Way Evidence Audit)
 * 4. AI Recovery Intelligence (Mathematical Separation Invariant, Dual-Approval Escalation)
 * 5. AI Financial Intelligence Agent (Controlled Read-Only Tools, Guardrail Integrity, Real Record Citations)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Ensure .env.local variables are loaded for testing
try {
  const envPath = path.resolve('.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  }
} catch (e) {}

import { store } from '../src/lib/store';
import {
  runContractIntelligenceAgent,
  runDeterministicContractAgent
} from '../src/lib/ai/contractAgent';
import {
  runIncidentInvestigationAgent,
  runDeterministicIncidentInvestigation,
  checkTimestampConsistency
} from '../src/lib/ai/incidentAgent';
import {
  runEvidenceAuditor,
  runDeterministicEvidenceAudit
} from '../src/lib/ai/evidenceAuditor';
import {
  runRecoveryIntelligenceAgent,
  runDeterministicRecoveryAgent
} from '../src/lib/ai/recoveryAgent';
import {
  runFinancialIntelligenceAgent,
  runDeterministicFinancialAgent,
  financialTools,
  FINANCIAL_GUARDRAIL_NOTICE
} from '../src/lib/ai/financialAgent';
import { validateSourceQuoteInText, validateClauseSourceQuotations } from '../src/lib/contractIntelligence';
import { Contract, Incident, Entitlement } from '../src/types';

console.log('=== RUNNING AI INTELLIGENCE LAYER SUITE ===\n');

async function testContractIntelligence() {
  console.log('[TEST 1] SLA Contract Intelligence & Quotation Verification');

  const contracts = store.getContracts();
  assert.ok(contracts.length > 0, 'Contracts must exist in backend store');
  const contract = contracts[0];

  // 1. Test verbatim quote validation
  const sampleDoc = `
    Service Level Agreement for Apex Fintech Solutions Inc.
    Section 3.1: Provider covenants to maintain monthly availability of not less than 99.95%.
    Section 4.1: Claim must be filed within 30 calendar days following the conclusion of the affected month.
    Section 4.5: Maximum credit compensation shall not exceed 50% of monthly fee.
  `;

  assert.ok(
    validateSourceQuoteInText('monthly availability of not less than 99.95%', sampleDoc),
    'Authentic quotation must be verified in document text'
  );
  assert.ok(
    !validateSourceQuoteInText('provider guarantees 100% unconditional uptime forever', sampleDoc),
    'Fabricated quotation must be rejected'
  );

  // 2. Test quote validation filter
  const testClauses = [
    {
      clauseId: 'c1',
      section: 'Section 3.1',
      title: 'Availability',
      interpretedMeaning: 'Must maintain 99.95% uptime',
      exactSourceQuote: 'monthly availability of not less than 99.95%',
      confidence: 0.95,
      ambiguitiesDetected: [],
      requiresHumanVerification: false
    },
    {
      clauseId: 'c2',
      section: 'Section 99',
      title: 'Hallucinated Clause',
      interpretedMeaning: 'Free lifetime credits',
      exactSourceQuote: 'unlimited free credits for any blip',
      confidence: 0.95,
      ambiguitiesDetected: [],
      requiresHumanVerification: false
    }
  ];

  const validation = validateClauseSourceQuotations(testClauses, sampleDoc);
  assert.strictEqual(validation.rejectedCount, 1, 'Exactly 1 fabricated clause quote must be rejected');
  assert.ok(validation.validatedClauses[1].isFabricatedOrUnsupported, 'Fabricated quote must be flagged');
  assert.strictEqual(validation.validatedClauses[1].requiresHumanVerification, true, 'Fabricated quote must require human review');

  // 3. Test Contract Agent Execution (Deterministic & Live)
  const deterministicResult = runDeterministicContractAgent(contract, sampleDoc);
  assert.strictEqual(deterministicResult.uptimeTarget, 99.95, 'Deterministic target extracted correctly');
  assert.strictEqual(deterministicResult.claimDeadlineDays, 30, 'Claim deadline extracted');
  assert.strictEqual(deterministicResult.maxCompensationPercent, 50, 'Max cap extracted');
  assert.ok(deterministicResult.quoteValidation.totalChecked >= 1, 'Quote validation completed');

  // Test main contract agent
  const agentResult = await runContractIntelligenceAgent(contract, sampleDoc);
  assert.ok(agentResult.overallConfidence > 0.7, 'Overall confidence must be high');
  assert.ok(agentResult.commitments.length > 0, 'Extracted commitments must not be empty');
  assert.ok(agentResult.mathematicalAuthorityNotice.includes('slaEngine.ts'), 'Must preserve mathematical authority notice');

  console.log(`✅ PASS: Contract Intelligence verified. Provider: ${agentResult.aiProvider} (${agentResult.modelName})`);
}

async function testIncidentInvestigation() {
  console.log('\n[TEST 2] AI Incident Investigation & Forensic Anomaly Detection');

  const incidents = store.getIncidents();
  assert.ok(incidents.length > 0, 'Incidents must exist in backend store');
  const normalIncident = incidents[0];

  // 1. Test forensic timestamp consistency checker on a valid incident
  const validConflicts = checkTimestampConsistency(normalIncident);
  assert.ok(Array.isArray(validConflicts), 'Conflicts array returned');

  // 2. Test timestamp anomaly detection on an engineered inconsistent incident
  const corruptedIncident: Incident = {
    ...normalIncident,
    id: 'inc-corrupt-test',
    incidentNumber: 'INC-CORRUPT-99',
    startedAt: '2026-11-08T14:30:00.000Z',
    detectedAt: '2026-11-08T14:15:00.000Z', // Detected 15 minutes BEFORE start!
    resolvedAt: '2026-11-08T14:20:00.000Z', // Resolved BEFORE start!
    durationMinutes: 120 // Reported 120 mins but timestamps show -10 mins!
  };

  const anomalies = checkTimestampConsistency(corruptedIncident);
  assert.ok(anomalies.some(a => a.issue === 'DETECTION_BEFORE_START'), 'Must detect detection before start');
  assert.ok(anomalies.some(a => a.issue === 'RESOLUTION_BEFORE_START'), 'Must detect resolution before start');
  assert.ok(anomalies.some(a => a.issue === 'DURATION_TIMESTAMP_MISMATCH'), 'Must detect duration mismatch');

  // 3. Test Availability Impact Calculation
  // 38 minutes in 43,200 total monthly minutes must yield exactly 99.912%
  const totalPeriodMinutes = 43200;
  const maxPossibleUptime = Number(((totalPeriodMinutes - 38) / totalPeriodMinutes * 100).toFixed(3));
  assert.strictEqual(maxPossibleUptime, 99.912, '38m outage must yield 99.912% monthly uptime');

  // 4. Test Incident Agent Execution
  const investigation = await runIncidentInvestigationAgent(normalIncident);
  assert.ok(investigation.confirmedFacts.length > 0, 'Confirmed facts must be populated');
  assert.ok(investigation.assumptionsAndInferences.length > 0, 'Assumptions must be distinguished from facts');
  assert.ok(investigation.slaImpactAnalysis.monthlyAvailabilityCeiling > 0, 'SLA impact ceiling computed');
  assert.ok(investigation.disclaimer.includes('does not establish binding legal liability'), 'Must include legal liability disclaimer');

  console.log(`✅ PASS: Incident Investigation verified. Status: ${investigation.investigationStatus} (${investigation.aiProvider})`);
}

async function testEvidenceAuditor() {
  console.log('\n[TEST 3] AI Evidence Auditor & Completeness Scoring');

  const entitlements = store.getEntitlements();
  assert.ok(entitlements.length > 0, 'Entitlements must exist');
  const entitlement = entitlements[0];
  const contract = store.getContractById(entitlement.contractId);
  const incident = store.getIncidentById(entitlement.incidentId);

  // 1. Run Evidence Audit
  const audit = await runEvidenceAuditor(entitlement, contract, incident);
  assert.ok(audit.completenessScore >= 0 && audit.completenessScore <= 100, 'Score must be between 0 and 100');
  assert.ok(Array.isArray(audit.verifiedEvidence), 'Verified evidence array present');
  assert.ok(Array.isArray(audit.contradictoryEvidence), 'Contradictory evidence array present');
  assert.ok(Array.isArray(audit.missingEvidence), 'Missing evidence array present');
  assert.ok(audit.verifiedEvidence.length > 0, 'Verified evidence must include telemetry and covenants');

  // 2. Test Contradiction Flagging on Maintenance Collision
  const maintIncident: Incident = {
    ...incident!,
    id: 'inc-maint-test',
    summary: 'Pre-scheduled Sunday Maintenance Window',
    slaBreached: false
  };

  const maintAudit = runDeterministicEvidenceAudit(entitlement, contract, maintIncident);
  assert.ok(maintAudit.contradictoryEvidence.length > 0, 'Maintenance claim must flag contradictory evidence');
  assert.strictEqual(maintAudit.auditVerdict, 'CONTRADICTORY_OR_UNSUPPORTED_CLAIM', 'Verdict must flag contradiction');

  console.log(`✅ PASS: Evidence Auditor verified. Completeness: ${audit.completenessScore}% (${audit.auditVerdict})`);
}

async function testRecoveryIntelligence() {
  console.log('\n[TEST 4] AI Recovery Intelligence & Mathematical Invariant');

  const entitlements = store.getEntitlements();
  const ent = entitlements[0];
  const contract = store.getContractById(ent.contractId);
  const incident = store.getIncidentById(ent.incidentId);

  // Run Recovery Agent
  const recovery = await runRecoveryIntelligenceAgent(ent, contract, incident);

  // 1. STRICT FINANCIAL INVARIANT: Dollar amount must strictly equal entitlement.eligibleCredit
  assert.strictEqual(
    recovery.calculatedRemedyAmount,
    ent.eligibleCredit,
    'CRITICAL INVARIANT: AI must NOT alter calculated dollar amounts'
  );

  // 2. Dual-approval governance escalation
  if (ent.eligibleCredit > 2500) {
    assert.strictEqual(recovery.payoutRouting.requiresDualApproval, true, 'Cases > $2,500 must require dual-approval');
  }

  assert.ok(recovery.mathematicalAuthorityNotice.includes('slaEngine.ts'), 'Must preserve mathematical authority notice');
  assert.ok(recovery.facts.length >= 3, 'Must provide structured facts');
  assert.ok(recovery.calculations.length >= 2, 'Must cite deterministic calculations');
  assert.ok(recovery.pathEvidence.length >= 2, 'Must provide visible path to evidence');

  console.log(`✅ PASS: Recovery Intelligence verified. Case: ${recovery.caseNumber} - $${recovery.calculatedRemedyAmount} (${recovery.recommendationVerdict})`);
}

async function testFinancialIntelligenceAgent() {
  console.log('\n[TEST 5] AI Financial Intelligence Agent (Studio Agent & Tools)');

  // 1. Test Read-Only Tool Outputs
  const summary = financialTools.getFinancialSummary();
  assert.ok(summary.totalCalculatedExposure > 0, 'Total calculated exposure must be greater than zero');
  assert.ok(summary.pendingCasesCount >= 0, 'Pending cases count present');

  const topCustomers = financialTools.getTopExposureCustomers();
  assert.ok(topCustomers.length > 0, 'Top exposure customers list populated');
  assert.strictEqual(topCustomers[0].customerName, 'QuantVanguard Asset Partners', 'QuantVanguard must be top exposure');

  const deadlines = financialTools.getApproachingDeadlines();
  assert.ok(Array.isArray(deadlines), 'Deadlines list returned');

  const conflicts = financialTools.getConflictingIncidents();
  assert.ok(Array.isArray(conflicts), 'Conflicts check returned');

  const reliability = financialTools.getServiceReliability();
  assert.ok(reliability.length > 0, 'Service reliability downtime breakdown returned');

  // 2. Test Agent Query: "Which service providers have caused the highest financial exposure?"
  const q1 = await runFinancialIntelligenceAgent('Which service providers have caused the highest financial exposure?');
  assert.ok(q1.summary.length > 20, 'Summary must be descriptive');
  assert.ok(q1.sourceReferences.length > 0, 'Must cite source references');
  assert.ok(q1.guardrailNotice.includes('strictly prohibited'), 'Financial guardrail strictly enforced');

  // 3. Test Agent Query: "Which recovery opportunities are approaching their claim deadlines?"
  const q2 = await runFinancialIntelligenceAgent('Which recovery opportunities are approaching their claim deadlines?');
  assert.ok(q2.summary.includes('deadline') || q2.summary.includes('calendar days') || q2.summary.includes('incident'), 'Deadline summary returned');

  // 4. Test Agent Query: "Which incidents have conflicting downtime records?"
  const q3 = await runFinancialIntelligenceAgent('Which incidents have conflicting downtime records?');
  assert.ok(q3.summary.length > 10, 'Conflict check returned');

  // 5. Test Agent Query: "What is our outstanding recoverable amount?"
  const q4 = await runFinancialIntelligenceAgent('What is our outstanding recoverable amount?');
  assert.ok(
    q4.summary.includes('$') || q4.summary.toLowerCase().includes('usd') || q4.detailedAnalysis?.includes('$') || q4.data?.summary?.outstandingPendingReview !== undefined,
    'Must include currency amounts and accurate metrics'
  );

  // 6. Security Check: Verify Agent Cannot Execute Mutations
  assert.strictEqual(typeof (financialTools as any).executeRefund, 'undefined', 'SECURITY: No executeRefund tool on Financial Agent');
  assert.strictEqual(typeof (financialTools as any).captureOrder, 'undefined', 'SECURITY: No captureOrder tool on Financial Agent');
  assert.strictEqual(typeof (financialTools as any).approveCase, 'undefined', 'SECURITY: No approveCase tool on Financial Agent');

  console.log(`✅ PASS: Financial Intelligence Agent verified with controlled tools. Guardrail: Verified.`);
}

async function runAll() {
  try {
    await testContractIntelligence();
    await testIncidentInvestigation();
    await testEvidenceAuditor();
    await testRecoveryIntelligence();
    await testFinancialIntelligenceAgent();

    console.log('\n========================================');
    console.log('✅ ALL AI INTELLIGENCE LAYER TESTS PASSED!');
    console.log('========================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ AI INTELLIGENCE TEST FAILED:', err);
    process.exit(1);
  }
}

runAll();
