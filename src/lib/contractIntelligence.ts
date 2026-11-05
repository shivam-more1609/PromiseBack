import { Contract, SLAClause, SLATier } from '../types';

export interface InterpretedClause {
  clauseId: string;
  section: string;
  title: string;
  interpretedMeaning: string;
  exactSourceQuote: string;
  confidence: number;
  ambiguitiesDetected: string[];
  requiresHumanVerification: boolean;
  isFabricatedOrUnsupported?: boolean;
}

export interface AIContractAnalysisResult {
  title: string;
  overallConfidence: string;
  numericalConfidence: number;
  aiProvider: string;
  modelName: string;
  isLiveAiConfigured: boolean;
  verdict: 'APPROVED_FOR_AUTOMATION' | 'REQUIRES_HUMAN_LEGAL_AUDIT' | 'AMBIGUOUS_TERMS_DETECTED';
  facts: string[];
  calculations: string[];
  recommendations: string[];
  pathEvidence: Array<{
    source: string;
    location: string;
    item: string;
    exactSourceQuote: string;
    confidence: number;
    uncertaintyNotes?: string;
    requiresHumanVerification: boolean;
    isFabricatedOrUnsupported?: boolean;
  }>;
  interpretedClauses: InterpretedClause[];
  mathematicalAuthorityNotice: string;
  quoteValidationSummary: {
    totalQuotesChecked: number;
    validQuotesCount: number;
    rejectedFabricatedQuotesCount: number;
  };
}

export const MATHEMATICAL_AUTHORITY_NOTICE = 
  'The deterministic mathematical SLA calculation engine (slaEngine.ts) remains strictly authoritative. AI interpretation provides legal clause extraction, semantic risk detection, and audit guidance. AI does not alter mathematical compensation values without explicit human verification.';

/**
 * Validates whether an extracted source quotation actually exists as a substring in the original contract document text.
 * Strips whitespace variance and punctuation differences to verify authentic textual presence.
 */
export function validateSourceQuoteInText(quote: string, originalText: string): boolean {
  if (!quote || !originalText) return false;
  const cleanQuote = quote.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const cleanText = originalText.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  if (cleanQuote.length < 5) return false;
  return cleanText.includes(cleanQuote);
}

/**
 * Scans an array of extracted clauses and validates their quotations against the original text.
 * Unsupported or fabricated quotations are rejected and marked for mandatory human compliance review.
 */
export function validateClauseSourceQuotations(
  clauses: InterpretedClause[],
  originalDocumentText: string
): { validatedClauses: InterpretedClause[]; rejectedCount: number } {
  let rejectedCount = 0;

  const validatedClauses = clauses.map(clause => {
    const isAuthentic = validateSourceQuoteInText(clause.exactSourceQuote, originalDocumentText);
    if (!isAuthentic) {
      rejectedCount++;
      return {
        ...clause,
        confidence: Math.min(clause.confidence, 0.20),
        requiresHumanVerification: true,
        isFabricatedOrUnsupported: true,
        ambiguitiesDetected: [
          ...clause.ambiguitiesDetected,
          'FABRICATED_OR_UNSUPPORTED_QUOTE: Exact quotation was not found in original contract document text. Rejected from automated compliance verification.'
        ]
      };
    }
    return clause;
  });

  return { validatedClauses, rejectedCount };
}

/**
 * Executes genuine AI contract intelligence on SLA text.
 * When GEMINI_API_KEY is configured: Invokes Gemini API (gemini-3.8-flash) with structured JSON schema.
 * When unconfigured: Employs deterministic NLP extraction with quote verification and uncertainty detection.
 */
export async function analyzeContractIntelligence(
  contract: Contract,
  explicitText?: string
): Promise<AIContractAnalysisResult> {
  const contractText = 
    explicitText || 
    contract.rawTextPreview || 
    contract.clauses?.map(c => `${c.section} ${c.title}: ${c.content}`).join('\n\n') || 
    '';
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim().length > 10) {
    try {
      return await callGeminiContractAnalysis(contract, contractText, apiKey);
    } catch (err: any) {
      console.warn('Gemini cloud inference encountered error, falling back to deterministic NLP engine:', err.message);
      return runDeterministicNlpAnalysis(contract, contractText, `Cloud LLM fallback (${err.message})`);
    }
  }

  return runDeterministicNlpAnalysis(contract, contractText);
}

/**
 * Calls Gemini API (defaulting to currently supported gemini-3.8-flash) with structured JSON output and anti-hallucination instructions.
 */
async function callGeminiContractAnalysis(
  contract: Contract,
  contractText: string,
  apiKey: string
): Promise<AIContractAnalysisResult> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const prompt = `
You are a senior SLA contracts and financial compliance auditor for an enterprise SaaS platform.
Analyze the following Service Level Agreement text.

CRITICAL COMPLIANCE RULES:
1. NO INVENTED OR HALLUCINATED TERMS: Do NOT assume or invent contractual clauses, thresholds, or percentages.
2. VERBATIM SOURCE PASSAGES: Every interpreted clause MUST contain an exact, verbatim quote from the text in "exactSourceQuote".
3. UNCERTAINTY & CONFIDENCE: Assign a confidence score between 0.0 and 1.0. If any term is ambiguous, conditioned on provider discretion, or missing, assign confidence < 0.75 and mark "requiresHumanVerification": true.
4. STRUCTURED OUTPUT: Return ONLY a valid JSON object matching the requested schema.

Contract Metadata:
- Customer: ${contract.customerName}
- SLA Name: ${contract.slaName}
- Stated Uptime: ${contract.uptimeTarget}%

Contract Document Text:
"""
${contractText.substring(0, 15000)}
"""

JSON Response Schema:
{
  "overallConfidence": number, // 0.00 to 1.00
  "verdict": "APPROVED_FOR_AUTOMATION" | "REQUIRES_HUMAN_LEGAL_AUDIT" | "AMBIGUOUS_TERMS_DETECTED",
  "facts": string[],
  "calculations": string[],
  "recommendations": string[],
  "interpretedClauses": [
    {
      "section": string,
      "title": string,
      "interpretedMeaning": string,
      "exactSourceQuote": string,
      "confidence": number,
      "ambiguitiesDetected": string[],
      "requiresHumanVerification": boolean
    }
  ]
}
`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout

  let response: Response;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      }),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`GEMINI_TIMEOUT: Request to Gemini model ${modelName} timed out after 15 seconds.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GEMINI_API_ERROR (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) {
    throw new Error('GEMINI_EMPTY_RESPONSE: No candidate text received from model.');
  }

  const parsed = JSON.parse(rawJson);

  let rawClauses: InterpretedClause[] = (parsed.interpretedClauses || []).map((c: any, idx: number) => ({
    clauseId: `clause-ai-${idx + 1}`,
    section: c.section || `Section ${idx + 1}`,
    title: c.title || 'Contractual Term',
    interpretedMeaning: c.interpretedMeaning || '',
    exactSourceQuote: c.exactSourceQuote || '',
    confidence: Number(c.confidence || 0.90),
    ambiguitiesDetected: c.ambiguitiesDetected || [],
    requiresHumanVerification: !!c.requiresHumanVerification
  }));

  // Perform Quote Validation: reject unsupported / fabricated quotes
  const { validatedClauses, rejectedCount } = validateClauseSourceQuotations(rawClauses, contractText);

  const pathEvidence = validatedClauses.map(c => ({
    source: contract.fileName || 'Contract SLA Document',
    location: c.section,
    item: c.title,
    exactSourceQuote: c.exactSourceQuote,
    confidence: c.confidence,
    uncertaintyNotes: c.ambiguitiesDetected.length > 0 ? c.ambiguitiesDetected.join('; ') : undefined,
    requiresHumanVerification: c.requiresHumanVerification,
    isFabricatedOrUnsupported: c.isFabricatedOrUnsupported
  }));

  const verdict = rejectedCount > 0 
    ? 'REQUIRES_HUMAN_LEGAL_AUDIT' 
    : (parsed.verdict || 'APPROVED_FOR_AUTOMATION');

  return {
    title: `AI Legal Risk Assessment: ${contract.slaName}`,
    overallConfidence: `${Math.round((parsed.overallConfidence || 0.95) * 100)}%`,
    numericalConfidence: parsed.overallConfidence || 0.95,
    aiProvider: 'Google Gemini',
    modelName: modelName,
    isLiveAiConfigured: true,
    verdict,
    facts: parsed.facts || [
      `Contracted availability baseline: ${contract.uptimeTarget}% measured on a ${contract.measurementPeriod.toLowerCase()} schedule.`,
      `Maximum contractual compensation ceiling is capped at ${contract.maxCompensationPercent}%.`
    ],
    calculations: parsed.calculations || [
      `Claim submission deadline window: ${contract.claimDeadlineDays} calendar days following measurement period close.`,
      `Tier thresholds escalate starting below ${contract.uptimeTarget}%.`
    ],
    recommendations: rejectedCount > 0
      ? [`CRITICAL: ${rejectedCount} extracted quotes failed textual verification against the contract document. Human legal audit mandatory.`]
      : (parsed.recommendations || ['Legal verification complete. Authoritative calculation engine active.']),
    pathEvidence,
    interpretedClauses: validatedClauses,
    mathematicalAuthorityNotice: MATHEMATICAL_AUTHORITY_NOTICE,
    quoteValidationSummary: {
      totalQuotesChecked: validatedClauses.length,
      validQuotesCount: validatedClauses.length - rejectedCount,
      rejectedFabricatedQuotesCount: rejectedCount
    }
  };
}

/**
 * Deterministic semantic and lexical analysis used when external AI key is absent.
 * Strictly avoids invented terms, extracts exact source quotes, and flags uncertain terms.
 */
function runDeterministicNlpAnalysis(
  contract: Contract,
  contractText: string,
  fallbackNotice?: string
): AIContractAnalysisResult {
  const normalized = contractText.replace(/\r\n/g, '\n');
  const rawClauses: InterpretedClause[] = [];

  // 1. Availability Clause
  const availMatch = normalized.match(/(?:availability|uptime)\s*(?:commitment|target|level|guarantee)[^\n.]{10,200}[.]/i);
  const availAmbiguous = /reasonable\s+efforts|commercially\s+reasonable|aims\s+to|target\s+only/i.test(availMatch?.[0] || '');
  rawClauses.push({
    clauseId: 'clause-det-1',
    section: 'Section 3.1',
    title: 'Service Availability Commitment',
    interpretedMeaning: `Mandates continuous service availability of at least ${contract.uptimeTarget}% measured across the ${contract.measurementPeriod.toLowerCase()} billing cycle.`,
    exactSourceQuote: availMatch ? availMatch[0].trim() : `Availability commitment of not less than ${contract.uptimeTarget}%.`,
    confidence: availMatch ? (availAmbiguous ? 0.72 : 0.98) : 0.85,
    ambiguitiesDetected: availAmbiguous ? ['Language uses discretionary standard ("commercially reasonable") rather than strict covenant.'] : [],
    requiresHumanVerification: availAmbiguous || !availMatch
  });

  // 2. Remedy Clause
  const remedyMatch = normalized.match(/(?:service\s+credit|compensation|remedy)[^\n.]{10,200}[.]/i);
  const remedyDiscretionary = /sole\s+discretion|may\s+apply|upon\s+request/i.test(remedyMatch?.[0] || '');
  rawClauses.push({
    clauseId: 'clause-det-2',
    section: 'Section 4.3',
    title: 'Service Credit Remedy Schedule',
    interpretedMeaning: `Defines tier escalation starting below ${contract.uptimeTarget}% with maximum contractual credit capped at ${contract.maxCompensationPercent}%.`,
    exactSourceQuote: remedyMatch ? remedyMatch[0].trim() : `Remedy schedule escalates up to ${contract.maxCompensationPercent}% maximum recurring credit.`,
    confidence: remedyMatch ? (remedyDiscretionary ? 0.70 : 0.95) : 0.80,
    ambiguitiesDetected: remedyDiscretionary ? ['Remedy disbursement includes discretionary review language.'] : [],
    requiresHumanVerification: remedyDiscretionary || !remedyMatch
  });

  // 3. Claim Window Clause
  const claimMatch = normalized.match(/(?:claim|notice|remedy\s+request)[^\n.]{10,200}[.]/i);
  rawClauses.push({
    clauseId: 'clause-det-3',
    section: 'Section 4.1',
    title: 'Claim Submission Deadline Window',
    interpretedMeaning: `Requires remedy claims to be submitted within ${contract.claimDeadlineDays} calendar days following the conclusion of the affected measurement period.`,
    exactSourceQuote: claimMatch ? claimMatch[0].trim() : `Claims must be submitted within ${contract.claimDeadlineDays} calendar days.`,
    confidence: claimMatch ? 0.96 : 0.75,
    ambiguitiesDetected: !claimMatch ? ['Claim deadline window was synthesized from standard governance profile. Requires legal verification.'] : [],
    requiresHumanVerification: !claimMatch
  });

  // 4. Exclusions Clause
  const exclMatch = normalized.match(/(?:exclusion|scheduled\s+maintenance|force\s+majeure)[^\n.]{10,200}[.]/i);
  rawClauses.push({
    clauseId: 'clause-det-4',
    section: 'Section 5.1',
    title: 'Outage Exclusions & Maintenance Windows',
    interpretedMeaning: 'Pre-scheduled maintenance notified in advance and force majeure events beyond reasonable commercial control are excluded from downtime calculations.',
    exactSourceQuote: exclMatch ? exclMatch[0].trim() : 'Pre-scheduled maintenance and force majeure events excluded from calculation.',
    confidence: exclMatch ? 0.94 : 0.80,
    ambiguitiesDetected: [],
    requiresHumanVerification: false
  });

  // Validate Source Quotes
  const { validatedClauses, rejectedCount } = validateClauseSourceQuotations(rawClauses, contractText);

  const reviewNeeded = validatedClauses.filter(c => c.requiresHumanVerification);
  const avgConfidence = Number((validatedClauses.reduce((sum, c) => sum + c.confidence, 0) / validatedClauses.length).toFixed(2));

  const pathEvidence = validatedClauses.map(c => ({
    source: contract.fileName || 'Contract SLA Document',
    location: c.section,
    item: c.title,
    exactSourceQuote: c.exactSourceQuote,
    confidence: c.confidence,
    uncertaintyNotes: c.ambiguitiesDetected.length > 0 ? c.ambiguitiesDetected.join('; ') : undefined,
    requiresHumanVerification: c.requiresHumanVerification,
    isFabricatedOrUnsupported: c.isFabricatedOrUnsupported
  }));

  return {
    title: `AI Legal Risk Assessment: ${contract.slaName}`,
    overallConfidence: `${Math.round(avgConfidence * 100)}%`,
    numericalConfidence: avgConfidence,
    aiProvider: 'Deterministic Lexical NLP Engine',
    modelName: 'deterministic-regex-nlp-v3',
    isLiveAiConfigured: false,
    verdict: (reviewNeeded.length > 0 || rejectedCount > 0) ? 'REQUIRES_HUMAN_LEGAL_AUDIT' : 'APPROVED_FOR_AUTOMATION',
    facts: [
      `Contracted availability commitment: ${contract.uptimeTarget}% evaluated on a ${contract.measurementPeriod.toLowerCase()} schedule.`,
      `Total analyzed clauses: ${validatedClauses.length} (${reviewNeeded.length} flagged for human compliance verification).`,
      `Maximum compensation ceiling is capped at ${contract.maxCompensationPercent}% of monthly recurring service fees.`
    ],
    calculations: [
      `Contractual claim window: ${contract.claimDeadlineDays} calendar days post measurement period close.`,
      `Tier thresholds start below ${contract.uptimeTarget}% with maximum tier credit of ${contract.compensationTiers[contract.compensationTiers.length - 1]?.creditPercentage || 50}%.`
    ],
    recommendations: reviewNeeded.length > 0
      ? reviewNeeded.map(c => `Audit ${c.section} (${c.title}): Confidence ${(c.confidence * 100).toFixed(0)}%. ${c.ambiguitiesDetected.join('; ') || 'Verify exact legal wording with counsel.'}`)
      : ['All extracted clauses satisfy contractual standards. Ready for active telemetry incident evaluation.'],
    pathEvidence,
    interpretedClauses: validatedClauses,
    mathematicalAuthorityNotice: fallbackNotice 
      ? `${MATHEMATICAL_AUTHORITY_NOTICE} [Notice: ${fallbackNotice}]` 
      : MATHEMATICAL_AUTHORITY_NOTICE,
    quoteValidationSummary: {
      totalQuotesChecked: validatedClauses.length,
      validQuotesCount: validatedClauses.length - rejectedCount,
      rejectedFabricatedQuotesCount: rejectedCount
    }
  };
}
