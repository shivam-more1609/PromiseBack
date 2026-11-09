/**
 * Financial Intelligence Agent (PromiseBack AI Intelligence Layer / AG Studio)
 * 
 * An autonomous financial reasoning agent with controlled read-only tools:
 * - Queries live application store data (entitlements, incidents, contracts, refunds, audit trail).
 * - Synthesizes answers to complex analytical and executive queries.
 * - Strictly cites real record identifiers (case numbers, contract numbers, incident numbers).
 * - Enforces immutable guardrails preventing autonomous financial disbursements.
 */

import { store } from '@/lib/store';
import { callGeminiText } from './geminiClient';
import { checkTimestampConsistency } from './incidentAgent';

export interface FinancialToolOutput {
  toolName: string;
  data: any;
}

export interface FinancialAgentResponse {
  query: string;
  intent: string;
  aiProvider: string;
  modelName: string;
  isLiveAiConfigured: boolean;
  agentRole: string;
  guardrailNotice: string;
  summary: string;
  detailedAnalysis: string;
  sourceReferences: Array<{
    type: 'case' | 'incident' | 'contract' | 'customer' | 'refund';
    identifier: string;
    description: string;
  }>;
  data: any;
  suggestedQueries: string[];
}

export const FINANCIAL_GUARDRAIL_NOTICE =
  'AI Financial Security Guardrail Enforced: Financial Intelligence Agent provides analytical, forensic, and query intelligence only. Direct financial disbursement, refund creation, and approval bypass are strictly prohibited. All financial disbursements require human dual-approval authorization in the Compensation Review workbench.';

/**
 * Controlled Read-Only Financial & Telemetry Tools
 */
export const financialTools = {
  getFinancialSummary() {
    const entitlements = store.getEntitlements();
    const refunds = store.getRefunds();
    const incidents = store.getIncidents();
    const customers = store.getCustomers();

    const pendingCases = entitlements.filter(e => e.status === 'pending_approval' || e.status === 'pending_executive_approval');
    const approvedCases = entitlements.filter(e => e.status === 'approved');
    const totalExposure = entitlements.reduce((sum, e) => sum + e.eligibleCredit, 0);
    const pendingTotal = pendingCases.reduce((sum, e) => sum + e.eligibleCredit, 0);
    const approvedTotal = approvedCases.reduce((sum, e) => sum + e.eligibleCredit, 0);
    const executedRefunds = refunds.filter(r => r.status === 'completed');
    const executedTotal = executedRefunds.reduce((sum, r) => sum + (r.refundAmount || 0), 0);

    return {
      totalCalculatedExposure: totalExposure,
      outstandingPendingReview: pendingTotal,
      approvedAwaitingDisbursement: approvedTotal,
      totalExecutedRefunds: executedTotal,
      pendingCasesCount: pendingCases.length,
      approvedCasesCount: approvedCases.length,
      executedRefundsCount: executedRefunds.length,
      totalCustomers: customers.length,
      totalIncidents: incidents.length
    };
  },

  getTopExposureCustomers() {
    const entitlements = store.getEntitlements();
    const exposureMap: Record<string, {
      customerId: string;
      customerName: string;
      plan: string;
      totalLiability: number;
      casesCount: number;
      cases: Array<{ caseNumber: string; incidentNumber: string; amount: number; status: string }>;
    }> = {};

    entitlements.forEach(e => {
      if (!exposureMap[e.customerId]) {
        exposureMap[e.customerId] = {
          customerId: e.customerId,
          customerName: e.customerName,
          plan: e.customerPlan || 'Enterprise Tier',
          totalLiability: 0,
          casesCount: 0,
          cases: []
        };
      }
      exposureMap[e.customerId].totalLiability += e.eligibleCredit;
      exposureMap[e.customerId].casesCount += 1;
      exposureMap[e.customerId].cases.push({
        caseNumber: e.caseNumber,
        incidentNumber: e.incidentNumber,
        amount: e.eligibleCredit,
        status: e.status
      });
    });

    return Object.values(exposureMap).sort((a, b) => b.totalLiability - a.totalLiability);
  },

  getApproachingDeadlines() {
    const incidents = store.getIncidents();
    const entitlements = store.getEntitlements();
    const now = Date.now();

    const deadlines = incidents.map(inc => {
      const incidentDate = new Date(inc.startedAt).getTime();
      const deadlineDate = incidentDate + (30 * 24 * 3600000); // 30-day window
      const daysRemaining = Math.round((deadlineDate - now) / (24 * 3600000));
      const relatedCases = entitlements.filter(e => e.incidentNumber === inc.incidentNumber);
      const totalLiability = relatedCases.reduce((sum, e) => sum + e.eligibleCredit, 0);

      return {
        incidentNumber: inc.incidentNumber,
        service: inc.service,
        startedAt: inc.startedAt,
        deadlineDate: new Date(deadlineDate).toISOString(),
        daysRemaining,
        isUrgent: daysRemaining <= 10,
        relatedCasesCount: relatedCases.length,
        totalLiability,
        cases: relatedCases.map(c => ({ caseNumber: c.caseNumber, customerName: c.customerName, amount: c.eligibleCredit, status: c.status }))
      };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);

    return deadlines;
  },

  getConflictingIncidents() {
    const incidents = store.getIncidents();
    const results: Array<{ incidentNumber: string; service: string; durationMinutes: number; conflicts: any[] }> = [];

    incidents.forEach(inc => {
      const conflicts = checkTimestampConsistency(inc);
      if (conflicts.length > 0) {
        results.push({
          incidentNumber: inc.incidentNumber,
          service: inc.service,
          durationMinutes: inc.durationMinutes,
          conflicts
        });
      }
    });

    return results;
  },

  getServiceReliability() {
    const incidents = store.getIncidents();
    const map: Record<string, { service: string; downtimeMinutes: number; incidentsCount: number; breachesCount: number }> = {};

    incidents.forEach(inc => {
      if (!map[inc.service]) {
        map[inc.service] = { service: inc.service, downtimeMinutes: 0, incidentsCount: 0, breachesCount: 0 };
      }
      map[inc.service].downtimeMinutes += inc.durationMinutes;
      map[inc.service].incidentsCount += 1;
      if (inc.slaBreached) map[inc.service].breachesCount += 1;
    });

    return Object.values(map).sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);
  },

  getCaseHistory(queryTerm: string) {
    const clean = queryTerm.trim().toLowerCase();
    const entitlements = store.getEntitlements();
    const refunds = store.getRefunds();

    const matchedEntitlements = entitlements.filter(e =>
      e.caseNumber.toLowerCase().includes(clean) ||
      e.customerName.toLowerCase().includes(clean) ||
      e.incidentNumber.toLowerCase().includes(clean) ||
      e.contractNumber.toLowerCase().includes(clean)
    );

    return matchedEntitlements.map(e => {
      const relatedRefund = refunds.find(r => r.entitlementId === e.id);
      return {
        caseNumber: e.caseNumber,
        customerName: e.customerName,
        contractNumber: e.contractNumber,
        incidentNumber: e.incidentNumber,
        eligibleCredit: e.eligibleCredit,
        status: e.status,
        measuredUptime: e.measuredUptime,
        formula: e.calculation?.formula,
        applicableClause: e.calculation?.applicableClauseTitle,
        payoutMethod: e.payoutMethod,
        approvalHistory: e.approvalHistory,
        refundRecord: relatedRefund ? {
          refundNumber: relatedRefund.refundNumber,
          status: relatedRefund.status,
          paypalCaptureId: relatedRefund.paypalCaptureId,
          paypalRefundId: relatedRefund.paypalRefundId
        } : null
      };
    });
  }
};

/**
 * Executes the Financial Intelligence Agent.
 */
export async function runFinancialIntelligenceAgent(query: string): Promise<FinancialAgentResponse> {
  const q = query.trim();
  const lower = q.toLowerCase();

  // Execute relevant tools based on query semantics
  const summaryData = financialTools.getFinancialSummary();
  const topExposureData = financialTools.getTopExposureCustomers();
  const deadlinesData = financialTools.getApproachingDeadlines();
  const conflictsData = financialTools.getConflictingIncidents();
  const reliabilityData = financialTools.getServiceReliability();
  const caseHistoryData = financialTools.getCaseHistory(q);

  const toolContext = {
    summary: summaryData,
    topExposureCustomers: topExposureData.slice(0, 5),
    approachingDeadlines: deadlinesData.slice(0, 5),
    conflictingIncidents: conflictsData,
    serviceReliability: reliabilityData,
    matchedCases: caseHistoryData.slice(0, 3)
  };

  const systemPrompt = `
You are the PromiseBack Senior Financial Intelligence & Governance Agent for AG Studio.
Answer the user's financial governance, SLA risk, or incident inquiry using the provided application data.

RULES:
1. STRICTLY ACCURATE DATA: Never fabricate amounts, customers, cases, or incidents. Cite only the exact data provided. Always format dollar amounts with standard $ currency signs (e.g. $1,450.00).
2. ALWAYS CITE RECORD IDENTIFIERS: Mention exact case numbers (e.g. CASE-0881), incident IDs (e.g. INC-2026-0314), contract numbers (e.g. SLA-2026-AF88), and customer names.
3. FINANCIAL GUARDRAIL: You cannot disburse money or bypass approval. Remind the user that dual-approval in the Compensation Review workbench is required for execution.
4. STRUCTURED RESPONSE: Provide a concise executive summary followed by analytical insights.
`;

  const prompt = `
User Query: "${q}"

LIVE PROMISEBACK DATABASE CONTEXT:
${JSON.stringify(toolContext, null, 2)}

Provide your response in this JSON format:
{
  "intent": string (e.g. "CUSTOMER_COMPENSATION_EXPOSURE" | "DEADLINE_ALERT" | "INCIDENT_CONFLICT_AUDIT" | "RECOVERY_CASE_HISTORY" | "SERVICE_RELIABILITY" | "OUTSTANDING_LIABILITY"),
  "summary": string (concise 1-2 sentence executive answer citing key numbers and names),
  "detailedAnalysis": string (2-4 paragraphs with detailed breakdown, root-cause correlation, and next actions),
  "sourceReferences": [
    { "type": "case" | "incident" | "contract" | "customer" | "refund", "identifier": string, "description": string }
  ],
  "highlightCustomerId": string or null,
  "highlightCustomerName": string or null
}
`;

  const geminiRes = await callGeminiText(prompt, {
    systemPrompt,
    temperature: 0.1,
    timeoutMs: 12000
  });

  if (geminiRes.isLive && geminiRes.text) {
    try {
      let cleaned = geminiRes.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');

      const parsed = JSON.parse(cleaned);

      return {
        query: q,
        intent: parsed.intent || 'FINANCIAL_ANALYTICS',
        aiProvider: 'Google Gemini',
        modelName: geminiRes.modelName,
        isLiveAiConfigured: true,
        agentRole: 'AG Studio Financial Intelligence Agent',
        guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
        summary: parsed.summary,
        detailedAnalysis: parsed.detailedAnalysis || parsed.summary,
        sourceReferences: parsed.sourceReferences || [],
        data: {
          ...toolContext,
          highlightCustomerId: parsed.highlightCustomerId,
          highlightCustomerName: parsed.highlightCustomerName
        },
        suggestedQueries: [
          'Which service providers have caused the highest financial exposure?',
          'Which recovery opportunities are approaching their claim deadlines?',
          'Which incidents have conflicting downtime records?',
          'What is our outstanding recoverable amount?'
        ]
      };
    } catch (parseErr) {
      // Fall through to deterministic response if JSON format error
    }
  }

  // Deterministic Fallback if model offline or error
  return runDeterministicFinancialAgent(q, toolContext);
}

/**
 * Deterministic Fallback for Financial Intelligence Agent
 */
export function runDeterministicFinancialAgent(
  query: string,
  toolContext: {
    summary: any;
    topExposureCustomers: any[];
    approachingDeadlines: any[];
    conflictingIncidents: any[];
    serviceReliability: any[];
    matchedCases: any[];
  }
): FinancialAgentResponse {
  const lower = query.toLowerCase();
  const summary = toolContext.summary;

  // Intent 1: Highest Exposure / Service Providers
  if (lower.includes('highest') || lower.includes('exposure') || lower.includes('provider') || lower.includes('top customer')) {
    const top = toolContext.topExposureCustomers[0];
    const sourceRefs = toolContext.topExposureCustomers.slice(0, 3).map(c => ({
      type: 'customer' as const,
      identifier: c.customerName,
      description: `Total SLA exposure of $${c.totalLiability.toFixed(2)} across ${c.casesCount} cases`
    }));

    return {
      query,
      intent: 'CUSTOMER_COMPENSATION_EXPOSURE',
      aiProvider: 'Deterministic Financial Engine',
      modelName: 'financial-rules-v2',
      isLiveAiConfigured: false,
      agentRole: 'AG Studio Exposure Analytics Agent',
      guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
      summary: `Identified ${toolContext.topExposureCustomers.length} enterprise tenants with active SLA liability. ${top ? top.customerName : 'N/A'} incurs the highest exposure at $${top ? top.totalLiability.toFixed(2) : '0.00'}. Total portfolio liability is $${summary.totalCalculatedExposure.toFixed(2)}.`,
      detailedAnalysis: `Exposure ranking confirms ${top ? top.customerName : 'enterprise accounts'} represents the primary concentration of SLA remedy claims. Claims originate predominantly from Core Transaction API outages. Review high-value cases in the Compensation Review queue for dual-approval verification.`,
      sourceReferences: sourceRefs,
      data: {
        totalExposure: summary.totalCalculatedExposure,
        rankedCustomers: toolContext.topExposureCustomers,
        highlightCustomerName: top?.customerName || null,
        highlightCustomerId: top?.customerId || null
      },
      suggestedQueries: [
        'Which recovery opportunities are approaching their claim deadlines?',
        'Which incidents have conflicting downtime records?',
        'What is our outstanding recoverable amount?'
      ]
    };
  }

  // Intent 2: Claim Deadlines
  if (lower.includes('deadline') || lower.includes('approaching') || lower.includes('expir')) {
    const urgent = toolContext.approachingDeadlines.filter(d => d.daysRemaining <= 15);
    const sourceRefs = toolContext.approachingDeadlines.slice(0, 3).map(d => ({
      type: 'incident' as const,
      identifier: d.incidentNumber,
      description: `Claim deadline in ${d.daysRemaining} days (${d.service})`
    }));

    return {
      query,
      intent: 'CLAIM_DEADLINE_AUDIT',
      aiProvider: 'Deterministic Financial Engine',
      modelName: 'financial-rules-v2',
      isLiveAiConfigured: false,
      agentRole: 'AG Studio Deadline Audit Agent',
      guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
      summary: `${urgent.length} outage recovery opportunities are within 15 calendar days of contractual claim deadlines. Earliest deadline is for incident ${toolContext.approachingDeadlines[0]?.incidentNumber || 'N/A'} (${toolContext.approachingDeadlines[0]?.daysRemaining || 0} days remaining).`,
      detailedAnalysis: `Contractual SLA covenants enforce strict 30-day filing windows. Unapproved cases associated with these incidents risk claim expiration if not submitted before the window closes. Immediate action in the Compensation Review queue is advised.`,
      sourceReferences: sourceRefs,
      data: {
        deadlines: toolContext.approachingDeadlines
      },
      suggestedQueries: [
        'Which recovery cases should we prioritise?',
        'What is our outstanding recoverable amount?',
        'Which service providers have caused the highest financial exposure?'
      ]
    };
  }

  // Intent 3: Conflicting downtime records
  if (lower.includes('conflict') || lower.includes('inconsistent') || lower.includes('discrepancy')) {
    const conflicts = toolContext.conflictingIncidents;
    const sourceRefs = conflicts.map(c => ({
      type: 'incident' as const,
      identifier: c.incidentNumber,
      description: `${c.conflicts.length} timestamp conflict(s) detected (${c.conflicts[0]?.issue})`
    }));

    return {
      query,
      intent: 'INCIDENT_CONFLICT_AUDIT',
      aiProvider: 'Deterministic Financial Engine',
      modelName: 'financial-rules-v2',
      isLiveAiConfigured: false,
      agentRole: 'AG Studio Forensic Audit Agent',
      guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
      summary: conflicts.length > 0
        ? `Forensic audit detected ${conflicts.length} incident(s) with timestamp discrepancies. Incident ${conflicts[0].incidentNumber} shows: ${conflicts[0].conflicts[0]?.detail}`
        : 'Forensic audit confirmed all incident timestamps and synthetic telemetry intervals are synchronized with zero conflicts.',
      detailedAnalysis: conflicts.length > 0
        ? `Timestamp conflicts undermine evidential integrity during dual-approval review. These discrepancies must be reconciled against raw APM canary logs before approving high-value disbursements.`
        : 'All outage durations match timestamp intervals within allowable tolerance margins.',
      sourceReferences: sourceRefs,
      data: {
        conflicts
      },
      suggestedQueries: [
        'Why was a particular recovery opportunity considered eligible?',
        'Which recovery opportunities are approaching their claim deadlines?'
      ]
    };
  }

  // Intent 4: Outstanding Recoverable Amount / Pending Refund Liability
  if (lower.includes('outstanding') || lower.includes('recoverable') || lower.includes('refund') || lower.includes('pending') || lower.includes('liability')) {
    return {
      query,
      intent: 'OUTSTANDING_LIABILITY_QUERY',
      aiProvider: 'Deterministic Financial Engine',
      modelName: 'financial-rules-v2',
      isLiveAiConfigured: false,
      agentRole: 'AG Studio Treasury & Reconciliation Agent',
      guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
      summary: `Total outstanding recoverable liability is $${summary.outstandingPendingReview.toFixed(2)} across ${summary.pendingCasesCount} pending cases. Executed PayPal Sandbox refunds total $${summary.totalExecutedRefunds.toFixed(2)}.`,
      detailedAnalysis: `Of the outstanding $${summary.outstandingPendingReview.toFixed(2)}, high-value cases exceeding the $2,500.00 threshold require dual-approval sign-off. Approved funds are disbursed directly via PayPal Sandbox captures refunds or credited to upcoming billing cycles.`,
      sourceReferences: [
        { type: 'refund', identifier: 'RECONCILIATION-SUMMARY', description: `$${summary.outstandingPendingReview.toFixed(2)} pending review; $${summary.totalExecutedRefunds.toFixed(2)} executed` }
      ],
      data: summary,
      suggestedQueries: [
        'Which service providers have caused the highest financial exposure?',
        'Which recovery cases should we prioritise?'
      ]
    };
  }

  // Intent 5: Specific Case / Recovery History
  if (toolContext.matchedCases.length > 0 || lower.includes('history') || lower.includes('case')) {
    const matched = toolContext.matchedCases[0];
    const sourceRefs = toolContext.matchedCases.map(c => ({
      type: 'case' as const,
      identifier: c.caseNumber,
      description: `${c.customerName} - $${c.eligibleCredit.toFixed(2)} (${c.status})`
    }));

    return {
      query,
      intent: 'RECOVERY_CASE_HISTORY',
      aiProvider: 'Deterministic Financial Engine',
      modelName: 'financial-rules-v2',
      isLiveAiConfigured: false,
      agentRole: 'AG Studio Case Audit Agent',
      guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
      summary: matched
        ? `Found Case ${matched.caseNumber} for ${matched.customerName}: $${matched.eligibleCredit.toFixed(2)} (${matched.status}). Triggered by ${matched.incidentNumber} under contract ${matched.contractNumber}.`
        : `PromiseBack tracks ${summary.pendingCasesCount} pending recovery cases totaling $${summary.outstandingPendingReview.toFixed(2)}.`,
      detailedAnalysis: matched
        ? `Remedy calculated using formula: ${matched.formula}. Applicable clause: ${matched.applicableClause}. Disbursement channel: ${matched.payoutMethod}. Approval history records ${matched.approvalHistory?.length || 0} event(s).`
        : 'Query against historical recovery cases complete.',
      sourceReferences: sourceRefs,
      data: {
        matchedCases: toolContext.matchedCases
      },
      suggestedQueries: [
        'Which recovery cases should we prioritise?',
        'What is our outstanding recoverable amount?'
      ]
    };
  }

  // Default General Assistant
  return {
    query,
    intent: 'GENERAL_FINANCIAL_INTELLIGENCE',
    aiProvider: 'Deterministic Financial Engine',
    modelName: 'financial-rules-v2',
    isLiveAiConfigured: false,
    agentRole: 'AG Studio Lead Intelligence Coordinator',
    guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
    summary: `PromiseBack Studio monitors ${summary.totalCustomers} enterprise contracts and ${summary.totalIncidents} system outages. Current total calculated compensation liability is $${summary.totalCalculatedExposure.toFixed(2)}.`,
    detailedAnalysis: `The platform enforces real-time contract intelligence, incident telemetry mapping, and automated PayPal remedy disbursement with cryptographic SHA-256 audit chaining.`,
    sourceReferences: [
      { type: 'customer', identifier: `${summary.totalCustomers} Active Contracts`, description: 'Enterprise SLA portfolio' },
      { type: 'incident', identifier: `${summary.totalIncidents} Outage Events`, description: 'Telemetry monitored infrastructure' }
    ],
    data: summary,
    suggestedQueries: [
      'Which service providers have caused the highest financial exposure?',
      'Which recovery opportunities are approaching their claim deadlines?',
      'Which incidents have conflicting downtime records?',
      'What is our outstanding recoverable amount?'
    ]
  };
}
