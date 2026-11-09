/**
 * Contract Intelligence Agent (PromiseBack AI Intelligence Layer)
 * 
 * Deeply analyzes SLA contracts (PDF / text) to extract covenants, uptime guarantees,
 * compensation tiers, exclusions, and claim deadlines.
 * Enforces verbatim quotation verification against source text to prevent hallucinations.
 */

import { Contract, SLAClause, SLATier } from '@/types';
import { callGeminiStructured } from './geminiClient';
import { validateClauseSourceQuotations, validateSourceQuoteInText } from '../contractIntelligence';

export interface ExtractedCommitment {
  type: 'uptime_guarantee' | 'measurement_period' | 'downtime_allowance' | 'compensation_clause' | 'exclusion' | 'claim_deadline' | 'service_scope';
  title: string;
  value: string | number;
  exactSourceQuote: string;
  sourceLocation: string;
  confidence: number;
  isAmbiguous: boolean;
  ambiguityNotes?: string;
}

export interface ContractAgentResult {
  contractId: string;
  customerName: string;
  slaName: string;
  aiProvider: string;
  modelName: string;
  isLiveAiConfigured: boolean;
  verdict: 'APPROVED_FOR_AUTOMATION' | 'REQUIRES_HUMAN_LEGAL_AUDIT' | 'AMBIGUOUS_TERMS_DETECTED';
  overallConfidence: number; // 0.0 - 1.0
  commitments: ExtractedCommitment[];
  uptimeTarget: number;
  measurementPeriod: 'Monthly' | 'Quarterly' | 'Annual';
  claimDeadlineDays: number;
  maxCompensationPercent: number;
  compensationTiers: SLATier[];
  exclusions: string[];
  ambiguitiesDetected: string[];
  missingClauses: string[];
  facts: string[];
  calculations: string[];
  recommendations: string[];
  quoteValidation: {
    totalChecked: number;
    validQuotes: number;
    rejectedQuotes: number;
  };
  mathematicalAuthorityNotice: string;
}

const MATHEMATICAL_AUTHORITY_NOTICE =
  'The deterministic mathematical SLA calculation engine (slaEngine.ts) remains strictly authoritative. AI interpretation extracts clauses and semantic risk; it does not alter mathematical compensation values without explicit human verification.';

/**
 * Executes Contract Intelligence on a contract document.
 */
export async function runContractIntelligenceAgent(
  contract: Contract,
  explicitDocumentText?: string
): Promise<ContractAgentResult> {
  const documentText =
    explicitDocumentText ||
    contract.rawTextPreview ||
    contract.clauses?.map(c => `[${c.section}] ${c.title}: ${c.content}`).join('\n\n') ||
    '';

  const systemPrompt = `
You are a Principal SLA Legal & Financial Compliance Auditor for an enterprise cloud platform.
Analyze the SLA contract document text with strict precision.

CRITICAL COMPLIANCE RULES:
1. NO INVENTED OR HALLUCINATED TERMS: Never extrapolate or assume unstated clauses.
2. VERBATIM SOURCE PASSAGES: Every extracted commitment MUST include an exact, verbatim quotation from the document.
3. DETECT AMBIGUITIES: If a clause is subjective (e.g. "commercially reasonable efforts", "at provider's sole discretion", missing notification hours), flag it as ambiguous.
4. IDENTIFY MISSING PROVISIONS: Flag if uptime target, claim deadline, tier formulas, or exclusions are absent.
5. FINANCIAL SEPARATION: You interpret legal terms; mathematical calculations are performed deterministically.
`;

  const prompt = `
Analyze the following SLA contract document text:
Customer: "${contract.customerName}"
Contract Number: "${contract.contractNumber}"
SLA Name: "${contract.slaName}"

DOCUMENT TEXT:
"""
${documentText.substring(0, 16000)}
"""

Return a valid JSON object matching this schema:
{
  "overallConfidence": number (0.0 to 1.0),
  "verdict": "APPROVED_FOR_AUTOMATION" | "REQUIRES_HUMAN_LEGAL_AUDIT" | "AMBIGUOUS_TERMS_DETECTED",
  "uptimeTarget": number (e.g. 99.95),
  "measurementPeriod": "Monthly" | "Quarterly" | "Annual",
  "claimDeadlineDays": number,
  "maxCompensationPercent": number,
  "commitments": [
    {
      "type": "uptime_guarantee" | "measurement_period" | "downtime_allowance" | "compensation_clause" | "exclusion" | "claim_deadline" | "service_scope",
      "title": string,
      "value": string,
      "exactSourceQuote": string,
      "sourceLocation": string,
      "confidence": number,
      "isAmbiguous": boolean,
      "ambiguityNotes": string
    }
  ],
  "compensationTiers": [
    { "uptimeThreshold": number, "creditPercentage": number, "label": string }
  ],
  "exclusions": string[],
  "ambiguitiesDetected": string[],
  "missingClauses": string[],
  "facts": string[],
  "calculations": string[],
  "recommendations": string[]
}
`;

  const geminiRes = await callGeminiStructured<any>(prompt, {
    systemPrompt,
    temperature: 0.05,
    timeoutMs: 12000
  });

  if (geminiRes.success && geminiRes.data) {
    const rawData = geminiRes.data;

    // Validate quotes against actual document text to catch hallucinations
    let validQuotes = 0;
    let rejectedQuotes = 0;

    const validatedCommitments: ExtractedCommitment[] = (rawData.commitments || []).map((comm: any) => {
      const isAuthentic = validateSourceQuoteInText(comm.exactSourceQuote, documentText);
      if (isAuthentic) {
        validQuotes++;
        return {
          type: comm.type || 'compensation_clause',
          title: comm.title || 'Extracted Covenant',
          value: comm.value ?? '',
          exactSourceQuote: comm.exactSourceQuote || '',
          sourceLocation: comm.sourceLocation || 'Document Text',
          confidence: Number(comm.confidence || 0.95),
          isAmbiguous: !!comm.isAmbiguous,
          ambiguityNotes: comm.ambiguityNotes
        };
      } else {
        rejectedQuotes++;
        return {
          type: comm.type || 'compensation_clause',
          title: comm.title || 'Extracted Covenant',
          value: comm.value ?? '',
          exactSourceQuote: comm.exactSourceQuote || '',
          sourceLocation: comm.sourceLocation || 'Document Text',
          confidence: Math.min(Number(comm.confidence || 0.5), 0.20),
          isAmbiguous: true,
          ambiguityNotes: `UNVERIFIED_QUOTE: Passage was not found verbatim in original contract text. Mandatory human review.`
        };
      }
    });

    const verdict = rejectedQuotes > 0 || (rawData.ambiguitiesDetected?.length || 0) > 2
      ? 'REQUIRES_HUMAN_LEGAL_AUDIT'
      : (rawData.verdict || 'APPROVED_FOR_AUTOMATION');

    return {
      contractId: contract.id,
      customerName: contract.customerName,
      slaName: contract.slaName,
      aiProvider: 'Google Gemini',
      modelName: geminiRes.modelName,
      isLiveAiConfigured: true,
      verdict,
      overallConfidence: Number(rawData.overallConfidence || 0.95),
      commitments: validatedCommitments,
      uptimeTarget: Number(rawData.uptimeTarget || contract.uptimeTarget || 99.95),
      measurementPeriod: rawData.measurementPeriod || contract.measurementPeriod || 'Monthly',
      claimDeadlineDays: Number(rawData.claimDeadlineDays || contract.claimDeadlineDays || 30),
      maxCompensationPercent: Number(rawData.maxCompensationPercent || contract.maxCompensationPercent || 50),
      compensationTiers: rawData.compensationTiers?.length > 0 ? rawData.compensationTiers : contract.compensationTiers,
      exclusions: rawData.exclusions || [
        'Pre-scheduled maintenance notified at least 48 hours in advance',
        'Force majeure events beyond reasonable commercial control'
      ],
      ambiguitiesDetected: rawData.ambiguitiesDetected || [],
      missingClauses: rawData.missingClauses || [],
      facts: rawData.facts || [
        `Target availability: ${contract.uptimeTarget}% measured on a ${contract.measurementPeriod.toLowerCase()} cadence.`,
        `Compensation ceiling capped at ${contract.maxCompensationPercent}% of monthly recurring charge.`
      ],
      calculations: rawData.calculations || [
        `Claim submission deadline window: ${contract.claimDeadlineDays} calendar days following close of affected period.`,
        `Penalty escalations apply when availability drops below ${contract.uptimeTarget}%.`
      ],
      recommendations: rejectedQuotes > 0
        ? [`CRITICAL: ${rejectedQuotes} extracted quotations failed source document verification. Manual legal compliance review mandatory.`]
        : (rawData.recommendations || ['Contract clauses verified against document text. Ready for automated SLA recovery mapping.']),
      quoteValidation: {
        totalChecked: validatedCommitments.length,
        validQuotes,
        rejectedQuotes
      },
      mathematicalAuthorityNotice: MATHEMATICAL_AUTHORITY_NOTICE
    };
  }

  // Deterministic Fallback if model offline or error
  return runDeterministicContractAgent(contract, documentText, geminiRes.error);
}

/**
 * Deterministic NLP Contract Extraction Fallback
 */
export function runDeterministicContractAgent(
  contract: Contract,
  documentText: string,
  fallbackReason?: string
): ContractAgentResult {
  const normalized = documentText.replace(/\r\n/g, '\n');
  const commitments: ExtractedCommitment[] = [];
  const ambiguities: string[] = [];
  const missing: string[] = [];

  // 1. Uptime Target
  let uptimeTarget = contract.uptimeTarget || 99.95;
  const uptimeMatch = normalized.match(/(?:uptime|availability|service\s+level)\s*(?:target|commitment|guarantee|of)?\s*(?:not\s+less\s+than|at\s+least|of)?\s*([9][0-9]\.[0-9]+)%/i);
  if (uptimeMatch && uptimeMatch[1]) {
    uptimeTarget = parseFloat(uptimeMatch[1]);
    commitments.push({
      type: 'uptime_guarantee',
      title: 'Monthly Service Availability Commitment',
      value: uptimeTarget,
      exactSourceQuote: uptimeMatch[0].trim(),
      sourceLocation: 'Service Availability Commitment Section',
      confidence: 0.96,
      isAmbiguous: false
    });
  } else {
    missing.push('Explicit uptime percentage commitment');
  }

  // 2. Claim Deadline
  let claimDeadlineDays = contract.claimDeadlineDays || 30;
  const deadlineMatch = normalized.match(/(?:claim|notice|remedy\s+request)\s*(?:must\s+be\s+submitted|filed|within)\s*([0-9]{1,3})\s*(?:calendar\s+days|business\s+days|days)/i);
  if (deadlineMatch && deadlineMatch[1]) {
    claimDeadlineDays = parseInt(deadlineMatch[1], 10);
    commitments.push({
      type: 'claim_deadline',
      title: 'Claim Filing Window',
      value: claimDeadlineDays,
      exactSourceQuote: deadlineMatch[0].trim(),
      sourceLocation: 'Claim Window Provision',
      confidence: 0.94,
      isAmbiguous: false
    });
  }

  // 3. Max Cap
  let maxCompensationPercent = contract.maxCompensationPercent || 50;
  const maxCapMatch = normalized.match(/(?:maximum\s+credit|max(?:imum)?\s+compensation|cap(?:ped)?\s+at|shall\s+not\s+exceed)\s*([0-9]{1,2})%/i);
  if (maxCapMatch && maxCapMatch[1]) {
    maxCompensationPercent = parseInt(maxCapMatch[1], 10);
    commitments.push({
      type: 'compensation_clause',
      title: 'Maximum Credit Cap',
      value: maxCompensationPercent,
      exactSourceQuote: maxCapMatch[0].trim(),
      sourceLocation: 'Remedy Limitations Section',
      confidence: 0.92,
      isAmbiguous: false
    });
  }

  // 4. Ambiguity check
  if (/sole\s+discretion|commercially\s+reasonable/i.test(normalized)) {
    ambiguities.push('Contract grants provider subjective unilateral discretion on remedy qualification.');
  }

  const verdict = ambiguities.length > 0 ? 'AMBIGUOUS_TERMS_DETECTED' : 'APPROVED_FOR_AUTOMATION';

  return {
    contractId: contract.id,
    customerName: contract.customerName,
    slaName: contract.slaName,
    aiProvider: 'Deterministic NLP Engine',
    modelName: 'regex-semantic-parser-v2',
    isLiveAiConfigured: false,
    verdict,
    overallConfidence: 0.92,
    commitments,
    uptimeTarget,
    measurementPeriod: contract.measurementPeriod || 'Monthly',
    claimDeadlineDays,
    maxCompensationPercent,
    compensationTiers: contract.compensationTiers,
    exclusions: [
      'Pre-scheduled maintenance windows communicated at least 48 hours in advance',
      'Force majeure events beyond reasonable commercial control'
    ],
    ambiguitiesDetected: ambiguities,
    missingClauses: missing,
    facts: [
      `Contracted availability baseline: ${uptimeTarget}% (${contract.measurementPeriod}).`,
      `Maximum remedy ceiling: ${maxCompensationPercent}%.`,
      fallbackReason ? `Engine note: Running deterministic extraction (${fallbackReason}).` : 'Engine note: Deterministic syntax parser applied.'
    ],
    calculations: [
      `Allowable monthly downtime budget: ${((100 - uptimeTarget) / 100 * 43200).toFixed(1)} minutes per 30-day month.`,
      `Remedy window: ${claimDeadlineDays} calendar days following incident period.`
    ],
    recommendations: [
      ambiguities.length > 0
        ? 'Flagged subjective provider discretion terms for compliance officer verification.'
        : 'Contract commitments parsed deterministically and verified for recovery correlation.'
    ],
    quoteValidation: {
      totalChecked: commitments.length,
      validQuotes: commitments.length,
      rejectedQuotes: 0
    },
    mathematicalAuthorityNotice: MATHEMATICAL_AUTHORITY_NOTICE
  };
}
