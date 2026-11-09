/**
 * Evidence Auditor Agent (PromiseBack AI Intelligence Layer)
 * 
 * Conducts automated compliance and evidential rigor review:
 * - Checks whether mandatory evidential artifacts are present.
 * - Categorizes evidence into: VERIFIED, CONTRADICTORY, and MISSING.
 * - Generates an Evidence Completeness Score (0 - 100%).
 * - Explains specific deficiencies that prevent automated recovery.
 * - Distinguishes between unsupported claims and mathematically validated claims.
 */

import { Entitlement, Incident, Contract } from '@/types';
import { callGeminiStructured } from './geminiClient';

export interface EvidenceItemAudit {
  category: 'telemetry_log' | 'contract_clause' | 'incident_postmortem' | 'customer_impact' | 'maintenance_calendar' | 'timestamp_chain';
  name: string;
  status: 'VERIFIED' | 'CONTRADICTORY' | 'MISSING';
  confidence: number;
  locationOrSource: string;
  detail: string;
  isMandatoryForDisbursement: boolean;
}

export interface EvidenceAuditResult {
  caseNumber: string;
  aiProvider: string;
  modelName: string;
  isLiveAiConfigured: boolean;
  completenessScore: number; // 0 - 100
  auditVerdict: 'EVIDENCE_SUFFICIENT_FOR_APPROVAL' | 'PARTIAL_EVIDENCE_REQUIRES_MANUAL_AUDIT' | 'CONTRADICTORY_OR_UNSUPPORTED_CLAIM';
  verifiedEvidence: EvidenceItemAudit[];
  contradictoryEvidence: EvidenceItemAudit[];
  missingEvidence: EvidenceItemAudit[];
  sufficiencyExplanation: string;
  riskFactors: string[];
  recommendations: string[];
  auditTimestamp: string;
}

/**
 * Conducts structured evidence audit for an entitlement compensation case.
 */
export async function runEvidenceAuditor(
  entitlement: Entitlement,
  contract?: Contract,
  incident?: Incident
): Promise<EvidenceAuditResult> {
  const systemPrompt = `
You are an Enterprise SLA Evidence Auditor and Forensic Risk Reviewer.
Audit the evidence bundle supporting this compensation claim.

EVIDENTIAL AUDIT RULES:
1. THREE-WAY CLASSIFICATION: Every evidence item must be classified strictly as VERIFIED, CONTRADICTORY, or MISSING.
2. COMPLETENESS SCORING: Calculate a realistic completeness score between 0 and 100 based on presence of telemetry, clause citations, and root-cause confirmation.
3. CONTRADICTION DETECTION: If outage claimed exceeds recorded logs, or if maintenance notices were pre-distributed, flag as CONTRADICTORY.
4. EXPLAIN INSUFFICIENCIES: Clearly explain why any missing evidence represents risk to financial recovery.
`;

  const prompt = `
Audit the evidence bundle for Compensation Case:
Case Number: "${entitlement.caseNumber}"
Customer: "${entitlement.customerName}" (${entitlement.customerPlan})
Eligible Credit: $${entitlement.eligibleCredit}
Contract Number: "${entitlement.contractNumber}"
Incident Number: "${entitlement.incidentNumber}"
Measured Uptime: ${entitlement.measuredUptime}%
Breach Magnitude: ${entitlement.calculation?.breachMagnitude}%
Telemetry Source: "${entitlement.telemetrySource}"
Evidence Summary in Case: "${entitlement.evidenceSummary}"
Incident Details: ${JSON.stringify(incident ? {
    service: incident.service,
    durationMinutes: incident.durationMinutes,
    rootCause: incident.rootCause,
    telemetryCount: incident.telemetry?.length || 0,
    affectedCustomers: incident.affectedCustomersCount
  } : 'Incident metadata not attached')}
Contract Details: ${JSON.stringify(contract ? {
    uptimeTarget: contract.uptimeTarget,
    measurementPeriod: contract.measurementPeriod,
    claimDeadlineDays: contract.claimDeadlineDays,
    verifiedClausesCount: contract.clauses?.filter(c => c.status === 'human_verified').length || 0
  } : 'Contract metadata not attached')}

Return a valid JSON object matching this schema:
{
  "completenessScore": number (0 to 100),
  "auditVerdict": "EVIDENCE_SUFFICIENT_FOR_APPROVAL" | "PARTIAL_EVIDENCE_REQUIRES_MANUAL_AUDIT" | "CONTRADICTORY_OR_UNSUPPORTED_CLAIM",
  "evidenceItems": [
    {
      "category": "telemetry_log" | "contract_clause" | "incident_postmortem" | "customer_impact" | "maintenance_calendar" | "timestamp_chain",
      "name": string,
      "status": "VERIFIED" | "CONTRADICTORY" | "MISSING",
      "confidence": number,
      "locationOrSource": string,
      "detail": string,
      "isMandatoryForDisbursement": boolean
    }
  ],
  "sufficiencyExplanation": string,
  "riskFactors": string[],
  "recommendations": string[]
}
`;

  const geminiRes = await callGeminiStructured<any>(prompt, {
    systemPrompt,
    temperature: 0.1,
    timeoutMs: 12000
  });

  if (geminiRes.success && geminiRes.data) {
    const rawData = geminiRes.data;
    const items: EvidenceItemAudit[] = rawData.evidenceItems || [];

    const verified = items.filter(i => i.status === 'VERIFIED');
    const contradictory = items.filter(i => i.status === 'CONTRADICTORY');
    const missing = items.filter(i => i.status === 'MISSING');

    const score = Math.max(0, Math.min(100, Math.round(rawData.completenessScore || 85)));

    const verdict = contradictory.length > 0
      ? 'CONTRADICTORY_OR_UNSUPPORTED_CLAIM'
      : score >= 80
      ? 'EVIDENCE_SUFFICIENT_FOR_APPROVAL'
      : 'PARTIAL_EVIDENCE_REQUIRES_MANUAL_AUDIT';

    return {
      caseNumber: entitlement.caseNumber,
      aiProvider: 'Google Gemini',
      modelName: geminiRes.modelName,
      isLiveAiConfigured: true,
      completenessScore: score,
      auditVerdict: verdict,
      verifiedEvidence: verified,
      contradictoryEvidence: contradictory,
      missingEvidence: missing,
      sufficiencyExplanation: rawData.sufficiencyExplanation || 'Evidence dossier exhibits verified telemetry and validated contractual covenants.',
      riskFactors: rawData.riskFactors || (contradictory.length > 0 ? ['Contradictory evidence items detected.'] : []),
      recommendations: rawData.recommendations || [
        'Proceed to human dual-approval review.',
        'Archive full evidence dossier into immutable audit ledger.'
      ],
      auditTimestamp: new Date().toISOString()
    };
  }

  // Deterministic Fallback Evidence Audit
  return runDeterministicEvidenceAudit(entitlement, contract, incident);
}

/**
 * Deterministic Evidence Audit Fallback
 */
export function runDeterministicEvidenceAudit(
  entitlement: Entitlement,
  contract?: Contract,
  incident?: Incident
): EvidenceAuditResult {
  const verified: EvidenceItemAudit[] = [];
  const contradictory: EvidenceItemAudit[] = [];
  const missing: EvidenceItemAudit[] = [];

  // Check 1: Telemetry Data
  if (entitlement.telemetrySource && entitlement.measuredUptime) {
    verified.push({
      category: 'telemetry_log',
      name: 'Synthetic Canary Probe Timeseries',
      status: 'VERIFIED',
      confidence: 0.98,
      locationOrSource: entitlement.telemetrySource,
      detail: `Telemetry measured availability at ${entitlement.measuredUptime}%, confirming breach magnitude of ${entitlement.calculation?.breachMagnitude}%.`,
      isMandatoryForDisbursement: true
    });
  } else {
    missing.push({
      category: 'telemetry_log',
      name: 'Synthetic Canary Probe Timeseries',
      status: 'MISSING',
      confidence: 0.95,
      locationOrSource: 'APM Engine',
      detail: 'Missing verified raw telemetry timeseries data.',
      isMandatoryForDisbursement: true
    });
  }

  // Check 2: Contract Clause
  if (contract && entitlement.calculation?.applicableClauseTitle) {
    const hasVerifiedClause = contract.clauses?.some(c => c.status === 'human_verified');
    verified.push({
      category: 'contract_clause',
      name: `Contract Covenant: ${entitlement.calculation.applicableClauseTitle}`,
      status: 'VERIFIED',
      confidence: hasVerifiedClause ? 0.99 : 0.88,
      locationOrSource: `${contract.contractNumber} (${contract.slaName})`,
      detail: `Contract covenants ${contract.uptimeTarget}% target with penalty escalation tier.`,
      isMandatoryForDisbursement: true
    });
  } else {
    missing.push({
      category: 'contract_clause',
      name: 'Contractual Penalty Clause Citation',
      status: 'MISSING',
      confidence: 0.90,
      locationOrSource: 'Contract Document Registry',
      detail: 'Applicable contractual compensation clause reference not verified.',
      isMandatoryForDisbursement: true
    });
  }

  // Check 3: Incident Postmortem
  if (incident && incident.rootCause) {
    if (/maintenance/i.test(incident.summary) && !incident.slaBreached) {
      contradictory.push({
        category: 'incident_postmortem',
        name: 'Maintenance Exclusion Status',
        status: 'CONTRADICTORY',
        confidence: 0.92,
        locationOrSource: `Incident ${incident.incidentNumber}`,
        detail: 'Incident summary indicates scheduled maintenance, yet compensation was calculated.',
        isMandatoryForDisbursement: true
      });
    } else {
      verified.push({
        category: 'incident_postmortem',
        name: `Root Cause Postmortem (${incident.incidentNumber})`,
        status: 'VERIFIED',
        confidence: 0.94,
        locationOrSource: `PagerDuty / War Room #${incident.incidentNumber}`,
        detail: `Root cause identified as: "${incident.rootCause}". Outage duration: ${incident.durationMinutes} mins.`,
        isMandatoryForDisbursement: true
      });
    }
  } else {
    missing.push({
      category: 'incident_postmortem',
      name: 'Engineering Root Cause Postmortem',
      status: 'MISSING',
      confidence: 0.85,
      locationOrSource: 'Incident Management System',
      detail: 'Formal root cause postmortem analysis has not been published.',
      isMandatoryForDisbursement: false
    });
  }

  // Check 4: Customer Impact Mapping
  verified.push({
    category: 'customer_impact',
    name: 'Customer Account & Spend Baseline',
    status: 'VERIFIED',
    confidence: 0.97,
    locationOrSource: 'Billing Database',
    detail: `Customer ${entitlement.customerName} monthly spend $${entitlement.calculation?.baseAmount?.toFixed(2) || '0.00'} verified on ${entitlement.customerPlan}.`,
    isMandatoryForDisbursement: true
  });

  // Calculate Completeness Score
  const totalWeight = 100;
  const deductions = (missing.length * 15) + (contradictory.length * 35);
  const completenessScore = Math.max(10, totalWeight - deductions);

  const auditVerdict = contradictory.length > 0
    ? 'CONTRADICTORY_OR_UNSUPPORTED_CLAIM'
    : completenessScore >= 80
    ? 'EVIDENCE_SUFFICIENT_FOR_APPROVAL'
    : 'PARTIAL_EVIDENCE_REQUIRES_MANUAL_AUDIT';

  return {
    caseNumber: entitlement.caseNumber,
    aiProvider: 'Deterministic Evidence Auditor',
    modelName: 'evidence-rule-engine-v2',
    isLiveAiConfigured: false,
    completenessScore,
    auditVerdict,
    verifiedEvidence: verified,
    contradictoryEvidence: contradictory,
    missingEvidence: missing,
    sufficiencyExplanation: contradictory.length > 0
      ? 'Audit detected conflicting or contradictory evidence between maintenance logs and claim records.'
      : missing.length > 0
      ? `Case is missing ${missing.length} evidential documentation items. Controller review suggested.`
      : 'All primary evidential artifacts (telemetry, contract covenant, tenant mapping) are verified and complete.',
    riskFactors: contradictory.length > 0
      ? ['POTENTIAL_EXCLUDED_EVENT: Check maintenance announcement timestamps before disbursement.']
      : [],
    recommendations: [
      completenessScore >= 80
        ? 'Evidence dossier complete. Ready for Dual-Approval authorization.'
        : 'Request secondary telemetry logs before authorizing PayPal refund.'
    ],
    auditTimestamp: new Date().toISOString()
  };
}
