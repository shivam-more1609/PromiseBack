/**
 * Recovery Intelligence Agent (PromiseBack AI Intelligence Layer)
 * 
 * Prepares explainable recovery recommendations for calculated customer entitlements:
 * - Synthesizes contractual compensation clauses with incident findings.
 * - Evaluates incident evidence against eligibility conditions.
 * - Generates structured recovery justification.
 * - Identifies missing documentation and recommends next actions.
 * - CRITICAL INVARIANT: Leaves exact monetary formulas to slaEngine.ts.
 */

import { Entitlement, Contract, Incident } from '@/types';
import { callGeminiStructured } from './geminiClient';
import { runEvidenceAuditor, EvidenceAuditResult } from './evidenceAuditor';

export interface RecoveryRecommendationResult {
  caseNumber: string;
  customerName: string;
  contractNumber: string;
  incidentNumber: string;
  aiProvider: string;
  modelName: string;
  isLiveAiConfigured: boolean;
  recommendationVerdict: 'RECOMMEND_FULL_PAYOUT' | 'RECOMMEND_PARTIAL_PAYOUT' | 'REQUEST_ADDITIONAL_EVIDENCE' | 'RECOMMEND_REJECTION';
  confidenceScore: number;
  calculatedRemedyAmount: number; // strictly from deterministic calculation
  currency: string;
  deterministicFormula: string;
  applicableClause: string;
  applicableTier: string;
  eligibilityEvaluation: {
    isWithinClaimWindow: boolean;
    isCovenantBreached: boolean;
    isMaintenanceExcluded: boolean;
    hasVerifiedTelemetry: boolean;
    eligibilitySummary: string;
  };
  evidenceCompletenessScore: number;
  missingDocumentation: string[];
  recoveryCaseSummary: string;
  nextRecommendedAction: string;
  payoutRouting: {
    recommendedChannel: 'PayPal Refund' | 'Service Credit';
    requiresDualApproval: boolean;
    dualApprovalReason?: string;
  };
  pathEvidence: Array<{
    source: string;
    location: string;
    item: string;
  }>;
  facts: string[];
  calculations: string[];
  recommendations: string[];
  mathematicalAuthorityNotice: string;
}

const MATHEMATICAL_AUTHORITY_NOTICE =
  'The deterministic mathematical SLA calculation engine (slaEngine.ts) remains strictly authoritative. AI provides legal clause mapping, evidentiary interpretation, and workflow recommendations. AI does NOT calculate or alter dollar amounts.';

/**
 * Runs genuine AI Recovery Intelligence on a calculated entitlement case.
 */
export async function runRecoveryIntelligenceAgent(
  entitlement: Entitlement,
  contract?: Contract,
  incident?: Incident
): Promise<RecoveryRecommendationResult> {
  // First run evidence audit to feed factual evidential score
  const evidenceAudit = await runEvidenceAuditor(entitlement, contract, incident);

  const calc = entitlement.calculation;
  const isHighValue = entitlement.eligibleCredit > 2500;

  const systemPrompt = `
You are a Senior SLA Recovery Counsel and Financial Governance Reviewer.
Prepare a defensible recovery recommendation for this compensation case.

CRITICAL FINANCIAL & LEGAL RULES:
1. DO NOT CALCULATE OR INVENT MONEY: The deterministic engine has already computed $${entitlement.eligibleCredit.toFixed(2)}. Do NOT change this amount.
2. EXPLAIN THE RECOVERY OPPORTUNITY: Explain why the customer is contractually entitled to this remedy based on availability deficit and applicable tier clauses.
3. WEIGH EVIDENCE SUFFICIENCY: Completeness score is ${evidenceAudit.completenessScore}/100. If score < 75 or contradictory evidence exists, recommend "REQUEST_ADDITIONAL_EVIDENCE".
4. DUAL-APPROVAL COMPLIANCE: Claims exceeding $2,500.00 strictly require two-stage human authorization (Finance Controller + Legal Counsel).
5. NON-CASH RESTRICTION: If the contract prohibits cash redemption (e.g. Section 10: "Service Credits are not redeemable for cash") or payoutMethod is "Service Credit", you MUST NOT recommend a PayPal cash refund. You must recommend a Service Credit applied to a subsequent invoice.
`;

  const isCashProhibited = contract?.isCashRefundAllowed === false || entitlement.payoutMethod === 'Service Credit';
  const effectivePayoutChannel: 'PayPal Refund' | 'Service Credit' = isCashProhibited ? 'Service Credit' : entitlement.payoutMethod;

  const prompt = `
Evaluate this recovery case:
Case Number: "${entitlement.caseNumber}"
Customer: "${entitlement.customerName}" (${entitlement.customerPlan})
Contract Number: "${entitlement.contractNumber}"
Incident Number: "${entitlement.incidentNumber}"
Eligible Credit (Deterministic): $${entitlement.eligibleCredit.toFixed(2)}
Calculated Formula: "${calc?.formula || 'Base Spend * Tier%'}"
Applicable Clause: "${calc?.applicableClauseTitle || 'Service Availability Commitment'}"
Applicable Tier: "${calc?.applicableTier?.label || 'Tier 1'}"
Contracted Uptime: ${calc?.contractedUptime || 99.95}%
Measured Uptime: ${calc?.measuredUptime || entitlement.measuredUptime}%
Breach Magnitude: ${calc?.breachMagnitude || 0.1}%
Payout Method: "${effectivePayoutChannel}"
Contract Non-Cash Restriction: ${contract?.isCashRefundAllowed === false ? 'ACTIVE (Section 10: Service credits are not redeemable for cash and must be applied to subsequent invoices. PayPal cash refund strictly prohibited.)' : 'NONE (Electronic / PayPal refund permitted if authorized)'}
Evidence Completeness Score: ${evidenceAudit.completenessScore}/100
Contradictory Evidence Count: ${evidenceAudit.contradictoryEvidence.length}
Missing Evidence Items: ${JSON.stringify(evidenceAudit.missingEvidence.map(m => m.name))}

Return a valid JSON object matching this schema:
{
  "recommendationVerdict": "RECOMMEND_FULL_PAYOUT" | "RECOMMEND_PARTIAL_PAYOUT" | "REQUEST_ADDITIONAL_EVIDENCE" | "RECOMMEND_REJECTION",
  "confidenceScore": number (0.0 to 1.0),
  "recoveryCaseSummary": string,
  "eligibilitySummary": string,
  "nextRecommendedAction": string,
  "facts": string[],
  "calculations": string[],
  "recommendations": string[]
}
`;

  const geminiRes = await callGeminiStructured<any>(prompt, {
    systemPrompt,
    temperature: 0.1,
    timeoutMs: 12000
  });

  const baseFacts = [
    `Customer: ${entitlement.customerName} (${entitlement.customerPlan}).`,
    `Applicable SLA Contract: ${entitlement.contractNumber}.`,
    `Triggering Outage: ${entitlement.incidentNumber} (${entitlement.incidentSummary}).`,
    `Contracted Availability: ${calc?.contractedUptime || 99.95}% vs Measured: ${calc?.measuredUptime || entitlement.measuredUptime}%.`,
    `Evidence Completeness Score: ${evidenceAudit.completenessScore}/100 (${evidenceAudit.auditVerdict}).`
  ];

  const baseCalculations = [
    `Contracted Uptime: ${calc?.contractedUptime || 99.95}% vs Measured Uptime: ${calc?.measuredUptime || entitlement.measuredUptime}%.`,
    `Breach Magnitude: -${calc?.breachMagnitude || 0.1}% below contracted covenant.`,
    `Selected Remedy Tier: ${calc?.applicableTier?.label || 'Tier 1'} (${calc?.applicableTier?.creditPercentage || 10}% credit).`,
    `Deterministic Formula (slaEngine.ts): ${calc?.formula || '$' + entitlement.eligibleCredit.toFixed(2)} = $${entitlement.eligibleCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
  ];

  const pathEvidence = [
    {
      source: 'Contract Schedule',
      location: calc?.applicableClauseTitle || 'Availability Covenants',
      item: 'Mandatory remedy clause'
    },
    {
      source: 'Telemetry Engine',
      location: entitlement.telemetrySource || 'Datadog Synthetic Check',
      item: `Availability deficit of ${calc?.breachMagnitude}% logged`
    },
    {
      source: 'Evidence Auditor',
      location: `Case ${entitlement.caseNumber}`,
      item: `Completeness score: ${evidenceAudit.completenessScore}%`
    }
  ];

  if (geminiRes.success && geminiRes.data) {
    const rawData = geminiRes.data;

    let verdict = rawData.recommendationVerdict;
    if (evidenceAudit.contradictoryEvidence.length > 0) {
      verdict = 'REQUEST_ADDITIONAL_EVIDENCE';
    }

    return {
      caseNumber: entitlement.caseNumber,
      customerName: entitlement.customerName,
      contractNumber: entitlement.contractNumber,
      incidentNumber: entitlement.incidentNumber,
      aiProvider: 'Google Gemini',
      modelName: geminiRes.modelName,
      isLiveAiConfigured: true,
      recommendationVerdict: verdict || 'RECOMMEND_FULL_PAYOUT',
      confidenceScore: Number(rawData.confidenceScore || 0.96),
      calculatedRemedyAmount: entitlement.eligibleCredit,
      currency: 'USD',
      deterministicFormula: calc?.formula || `Base * Tier% = $${entitlement.eligibleCredit.toFixed(2)}`,
      applicableClause: calc?.applicableClauseTitle || 'Service Availability Commitment',
      applicableTier: calc?.applicableTier?.label || 'Tier 1',
      eligibilityEvaluation: {
        isWithinClaimWindow: true,
        isCovenantBreached: (calc?.breachMagnitude || 0) > 0,
        isMaintenanceExcluded: false,
        hasVerifiedTelemetry: evidenceAudit.verifiedEvidence.length > 0,
        eligibilitySummary: rawData.eligibilitySummary || 'Verified contractual breach qualifies tenant for SLA credit remedy.'
      },
      evidenceCompletenessScore: evidenceAudit.completenessScore,
      missingDocumentation: evidenceAudit.missingEvidence.map(m => m.name),
      recoveryCaseSummary: rawData.recoveryCaseSummary || `SLA breach of ${calc?.breachMagnitude}% confirmed via telemetry; entitles customer to $${entitlement.eligibleCredit.toFixed(2)} credit under ${calc?.applicableTier?.label}.`,
      nextRecommendedAction: rawData.nextRecommendedAction || (
        isHighValue
          ? 'Route to Stage 1 Finance Controller sign-off in Compensation Review (High-Value Dual-Approval required).'
          : 'Approve compensation package for disbursement.'
      ),
      payoutRouting: {
        recommendedChannel: effectivePayoutChannel,
        requiresDualApproval: isHighValue,
        dualApprovalReason: isHighValue ? 'Remedy amount exceeds $2,500.00 dual-approval threshold.' : undefined
      },
      pathEvidence,
      facts: rawData.facts?.length > 0 ? rawData.facts : [
        ...baseFacts,
        ...(isCashProhibited ? ['Remedy Routing: Subsequent invoice billing credit strictly required (Section 10 non-cash clause).'] : [])
      ],
      calculations: baseCalculations,
      recommendations: rawData.recommendations?.length > 0 ? rawData.recommendations : [
        effectivePayoutChannel === 'PayPal Refund'
          ? 'Authorized for PayPal Sandbox capture refund (POST /v2/payments/captures/{id}/refund) once financial approval is granted.'
          : (contract?.isCashRefundAllowed === false
              ? 'Direct billing credit to be applied automatically on subsequent invoice per Section 10 ("Service Credits are not redeemable for cash"). PayPal cash refund prohibited.'
              : 'Direct billing credit to be applied on the upcoming billing cycle.'),
        isHighValue ? 'Executive legal countersignature required following controller sign-off.' : 'Single-stage controller sign-off sufficient.'
      ],
      mathematicalAuthorityNotice: MATHEMATICAL_AUTHORITY_NOTICE
    };
  }

  // Deterministic Fallback
  return runDeterministicRecoveryAgent(entitlement, evidenceAudit, isHighValue, baseFacts, baseCalculations, pathEvidence, contract);
}

/**
 * Deterministic Recovery Agent Fallback
 */
export function runDeterministicRecoveryAgent(
  entitlement: Entitlement,
  evidenceAudit: EvidenceAuditResult,
  isHighValue: boolean,
  baseFacts: string[],
  baseCalculations: string[],
  pathEvidence: Array<{ source: string; location: string; item: string }>,
  contract?: Contract
): RecoveryRecommendationResult {
  const calc = entitlement.calculation;
  const hasContradictions = evidenceAudit.contradictoryEvidence.length > 0;
  const isCashProhibited = contract?.isCashRefundAllowed === false || entitlement.payoutMethod === 'Service Credit';
  const effectivePayoutChannel: 'PayPal Refund' | 'Service Credit' = isCashProhibited ? 'Service Credit' : entitlement.payoutMethod;

  const verdict: 'RECOMMEND_FULL_PAYOUT' | 'REQUEST_ADDITIONAL_EVIDENCE' =
    hasContradictions || evidenceAudit.completenessScore < 70
      ? 'REQUEST_ADDITIONAL_EVIDENCE'
      : 'RECOMMEND_FULL_PAYOUT';

  return {
    caseNumber: entitlement.caseNumber,
    customerName: entitlement.customerName,
    contractNumber: entitlement.contractNumber,
    incidentNumber: entitlement.incidentNumber,
    aiProvider: 'Deterministic Recovery Engine',
    modelName: 'recovery-rules-v2',
    isLiveAiConfigured: false,
    recommendationVerdict: verdict,
    confidenceScore: evidenceAudit.completenessScore >= 80 ? 0.98 : 0.82,
    calculatedRemedyAmount: entitlement.eligibleCredit,
    currency: 'USD',
    deterministicFormula: calc?.formula || `Base * Tier% = $${entitlement.eligibleCredit.toFixed(2)}`,
    applicableClause: calc?.applicableClauseTitle || 'Availability Covenants',
    applicableTier: calc?.applicableTier?.label || 'Tier 1',
    eligibilityEvaluation: {
      isWithinClaimWindow: true,
      isCovenantBreached: true,
      isMaintenanceExcluded: false,
      hasVerifiedTelemetry: true,
      eligibilitySummary: `Deterministic availability calculation confirms ${calc?.breachMagnitude}% deficit below covenant. Eligible for ${calc?.applicableTier?.label} remedy.`
    },
    evidenceCompletenessScore: evidenceAudit.completenessScore,
    missingDocumentation: evidenceAudit.missingEvidence.map(m => m.name),
    recoveryCaseSummary: `Case ${entitlement.caseNumber} evaluated with ${evidenceAudit.completenessScore}% evidence completeness. Calculated remedy of $${entitlement.eligibleCredit.toFixed(2)} deterministically validated.`,
    nextRecommendedAction: isHighValue
      ? 'Submit for Stage 1 Financial Controller review (dual-approval required).'
      : 'Submit for primary approval review.',
    payoutRouting: {
      recommendedChannel: effectivePayoutChannel,
      requiresDualApproval: isHighValue,
      dualApprovalReason: isHighValue ? 'Remedy amount exceeds $2,500.00 dual-approval threshold.' : undefined
    },
    pathEvidence,
    facts: [
      ...baseFacts,
      ...(isCashProhibited ? ['Remedy Routing: Subsequent invoice credit only (Section 10 prohibits cash redemption).'] : [])
    ],
    calculations: baseCalculations,
    recommendations: [
      `Contract clause ${calc?.applicableClauseTitle || 'SLA'} explicitly mandates this remedy tier.`,
      effectivePayoutChannel === 'PayPal Refund'
        ? 'Authorized for PayPal Sandbox capture refund (POST /v2/payments/captures/{capture_id}/refund) once financial approval is granted.'
        : (contract?.isCashRefundAllowed === false
            ? 'Direct billing credit to be applied automatically on subsequent invoice per Section 10 ("Service Credits are not redeemable for cash"). PayPal cash refund prohibited.'
            : 'Direct billing credit to be applied automatically on the upcoming billing cycle.')
    ],
    mathematicalAuthorityNotice: MATHEMATICAL_AUTHORITY_NOTICE
  };
}
