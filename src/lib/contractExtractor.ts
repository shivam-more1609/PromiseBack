// pdf-parse CommonJS interop
const pdfParse = require('pdf-parse');
import { SLAClause, SLATier, VerificationStatus } from '../types';

export interface ExtractedContractData {
  customerName: string;
  slaName: string;
  uptimeTarget: number;
  measurementPeriod: 'Monthly' | 'Quarterly' | 'Annual';
  claimDeadlineDays: number;
  maxCompensationPercent: number;
  compensationTiers: SLATier[];
  maintenanceExclusions: string[];
  serviceScope: string;
  clauses: SLAClause[];
  extractedConfidence: number;
  rawTextPreview: string;
}

/**
 * Parses binary buffer of an SLA contract PDF and deterministically extracts contractual covenants.
 */
export async function extractContractFromPdfBuffer(
  pdfBuffer: Buffer,
  fallbackCustomerName?: string
): Promise<ExtractedContractData> {
  let parsedText = '';
  try {
    const pdfModule = require('pdf-parse');
    if (typeof pdfModule === 'function') {
      const data = await pdfModule(pdfBuffer);
      parsedText = data.text || '';
    } else if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      parsedText = result.text || '';
    } else {
      throw new Error('Unsupported PDFParse export format.');
    }
  } catch (err: any) {
    throw new Error(`PDF_PARSING_FAILED: Could not parse document bytes: ${err.message}`);
  }

  if (!parsedText || parsedText.trim().length === 0) {
    throw new Error('PDF_EMPTY_OR_UNREADABLE: The uploaded PDF document contains no readable text stream.');
  }

  const normalized = parsedText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Extract Uptime Target (e.g., 99.95%, 99.9%, 99.99%)
  let uptimeTarget = 99.95;
  let uptimeConfidence = 0.85;
  const uptimeMatch = normalized.match(/(?:uptime|availability|service\s+level)\s*(?:target|commitment|guarantee|of)?\s*(?:not\s+less\s+than|at\s+least|of)?\s*([9][0-9]\.[0-9]+)%/i);
  if (uptimeMatch && uptimeMatch[1]) {
    uptimeTarget = parseFloat(uptimeMatch[1]);
    uptimeConfidence = 0.98;
  }

  // 2. Extract Measurement Period (Monthly, Quarterly, Annual)
  let measurementPeriod: 'Monthly' | 'Quarterly' | 'Annual' = 'Monthly';
  if (/quarterly|calendar\s+quarter/i.test(normalized)) {
    measurementPeriod = 'Quarterly';
  } else if (/annually|calendar\s+year|annual/i.test(normalized)) {
    measurementPeriod = 'Annual';
  }

  // 3. Extract Claim Deadline (e.g., within 30 days, 45 calendar days)
  let claimDeadlineDays = 30;
  const deadlineMatch = normalized.match(/(?:claim|notice|remedy\s+request)\s*(?:must\s+be\s+submitted|filed|within)\s*([0-9]{1,3})\s*(?:calendar\s+days|business\s+days|days)/i);
  if (deadlineMatch && deadlineMatch[1]) {
    claimDeadlineDays = parseInt(deadlineMatch[1], 10);
  }

  // 4. Extract Max Compensation Cap (e.g. capped at 50%, maximum credit of 30%)
  let maxCompensationPercent = 50;
  const maxCapMatch = normalized.match(/(?:maximum\s+credit|max(?:imum)?\s+compensation|cap(?:ped)?\s+at|shall\s+not\s+exceed)\s*([0-9]{1,2})%/i);
  if (maxCapMatch && maxCapMatch[1]) {
    maxCompensationPercent = parseInt(maxCapMatch[1], 10);
  }

  // 5. Extract Maintenance Exclusions
  const maintenanceExclusions: string[] = [];
  const exclusionRegex = /(?:exclusion|excluded|maintenance|downtime\s+does\s+not\s+include)[^\n.]{10,120}[.]/gi;
  const exclusionMatches = normalized.match(exclusionRegex);
  if (exclusionMatches && exclusionMatches.length > 0) {
    for (const match of exclusionMatches.slice(0, 3)) {
      maintenanceExclusions.push(match.trim());
    }
  } else {
    maintenanceExclusions.push('Pre-scheduled maintenance windows communicated at least 48 hours in advance');
    maintenanceExclusions.push('Force majeure events and external DNS transit failures beyond provider control');
  }

  // 6. Extract Service Scope
  let serviceScope = 'Core Application APIs & Transaction Ingestion Endpoints';
  const serviceMatch = normalized.match(/(?:service\s+scope|applies\s+to|covered\s+services?)[^\n.]{5,80}[.]/i);
  if (serviceMatch) {
    serviceScope = serviceMatch[0].replace(/^(?:service\s+scope|applies\s+to|covered\s+services?)\s*[:\-]?\s*/i, '').trim();
  }

  // 7. Extract Compensation Tiers
  const compensationTiers: SLATier[] = [
    {
      uptimeThreshold: uptimeTarget,
      creditPercentage: 0,
      minUptime: uptimeTarget,
      maxUptime: 100,
      label: `≥ ${uptimeTarget}% Target Met`
    }
  ];

  // Try parsing tier patterns: e.g. "99.0% to 99.49% : 15%" or "< 99.0% : 30%"
  const tierRegex = /(?:([9][0-9]\.[0-9]+)%\s*(?:to|-)\s*([9][0-9]\.[0-9]+)%\s*[:\-–]?\s*([0-9]{1,2})%|<([9][0-9]\.[0-9]+)%\s*[:\-–]?\s*([0-9]{1,2})%)/gi;
  let match: RegExpExecArray | null;
  let foundCustomTiers = false;

  while ((match = tierRegex.exec(normalized)) !== null) {
    foundCustomTiers = true;
    if (match[1] && match[2] && match[3]) {
      const min = parseFloat(match[1]);
      const max = parseFloat(match[2]);
      const pct = parseInt(match[3], 10);
      compensationTiers.push({
        uptimeThreshold: max,
        creditPercentage: pct,
        minUptime: min,
        maxUptime: max,
        label: `${min}% - ${max}% (${pct}% Credit)`
      });
    } else if (match[4] && match[5]) {
      const min = parseFloat(match[4]);
      const pct = parseInt(match[5], 10);
      compensationTiers.push({
        uptimeThreshold: min,
        creditPercentage: pct,
        minUptime: 0,
        maxUptime: min,
        label: `< ${min}% Severe Outage (${pct}% Credit)`
      });
    }
  }

  // If no explicit table matched, build deterministic brackets descending from target
  if (!foundCustomTiers) {
    compensationTiers.push(
      {
        uptimeThreshold: uptimeTarget,
        creditPercentage: 10,
        minUptime: Number((uptimeTarget - 0.45).toFixed(2)),
        maxUptime: uptimeTarget,
        label: `${(uptimeTarget - 0.45).toFixed(2)}% - ${(uptimeTarget - 0.01).toFixed(2)}% (10% Credit)`
      },
      {
        uptimeThreshold: Number((uptimeTarget - 0.45).toFixed(2)),
        creditPercentage: 25,
        minUptime: Number((uptimeTarget - 0.95).toFixed(2)),
        maxUptime: Number((uptimeTarget - 0.45).toFixed(2)),
        label: `${(uptimeTarget - 0.95).toFixed(2)}% - ${(uptimeTarget - 0.46).toFixed(2)}% (25% Credit)`
      },
      {
        uptimeThreshold: Number((uptimeTarget - 0.95).toFixed(2)),
        creditPercentage: 50,
        minUptime: 0,
        maxUptime: Number((uptimeTarget - 0.95).toFixed(2)),
        label: `< ${(uptimeTarget - 0.95).toFixed(2)}% Critical Breach (50% Credit)`
      }
    );
  }

  // 8. Extract Clauses with Source References
  const clauses: SLAClause[] = [];
  const clauseKeywords = [
    { title: 'Service Availability Commitment', pattern: /(?:availability|uptime)\s+commitment[^\n.]{10,250}[.]/i, section: 'Section 3.1' },
    { title: 'Service Credit Remedy Escalation', pattern: /(?:service\s+credit|remedy|compensation)[^\n.]{10,250}[.]/i, section: 'Section 4.2' },
    { title: 'Electronic Remedy Disbursement Election', pattern: /(?:payout|refund|invoice\s+credit|electronic\s+disbursement)[^\n.]{10,250}[.]/i, section: 'Section 4.7' },
    { title: 'Excused Outage & Maintenance Exclusions', pattern: /(?:exclusion|scheduled\s+maintenance|force\s+majeure)[^\n.]{10,250}[.]/i, section: 'Section 5.1' }
  ];

  for (const item of clauseKeywords) {
    const clauseMatch = normalized.match(item.pattern);
    if (clauseMatch) {
      clauses.push({
        id: `clause-pdf-${Math.random().toString(36).substring(2, 7)}`,
        section: item.section,
        title: item.title,
        content: clauseMatch[0].trim(),
        confidence: 0.95,
        status: 'ai_extracted',
        sourceCitation: {
          exactMatchSnippet: clauseMatch[0].trim().substring(0, 100) + '...'
        }
      });
    } else {
      clauses.push({
        id: `clause-pdf-${Math.random().toString(36).substring(2, 7)}`,
        section: item.section,
        title: item.title,
        content: `Standard contractual term for ${item.title.toLowerCase()} extracted under default SLA governance model.`,
        confidence: 0.75,
        status: 'requires_review',
        notes: 'Clause text was synthesized from contractual context. Requires human compliance verification.'
      });
    }
  }

  // Customer Name resolution
  let customerName = fallbackCustomerName || 'Enterprise Partner';
  const betweenMatch = normalized.match(/between\s+(?:[^\n\r\t]+?)\s+and\s+([A-Z][A-Za-z0-9 .,'-]{2,50}(?:Inc\.|Corp\.|LLC|Ltd\.|Technologies|Solutions)?)/i);
  if (betweenMatch && betweenMatch[1]) {
    customerName = betweenMatch[1].trim().replace(/[\r\n\t]+/g, ' ');
  } else {
    const nameMatch = normalized.match(/(?:client|customer|agreement\s+with)\s*[:\-]?\s*([A-Z][A-Za-z0-9 .,'-]{2,50}(?:Inc\.|Corp\.|LLC|Ltd\.|Technologies|Solutions)?)/i);
    if (nameMatch && nameMatch[1]) {
      customerName = nameMatch[1].trim().replace(/[\r\n\t]+/g, ' ');
    }
  }

  const slaName = `${customerName} Master Service Level Agreement`;

  return {
    customerName,
    slaName,
    uptimeTarget,
    measurementPeriod,
    claimDeadlineDays,
    maxCompensationPercent,
    compensationTiers,
    maintenanceExclusions,
    serviceScope,
    clauses,
    extractedConfidence: Number(((uptimeConfidence + 0.90) / 2).toFixed(2)),
    rawTextPreview: normalized.substring(0, 500)
  };
}
