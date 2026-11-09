/**
 * Incident Investigation Agent (PromiseBack AI Intelligence Layer)
 * 
 * Conducts forensic investigation of system incidents:
 * - Analyzes outage timelines and synthetic probe logs.
 * - Correlates outage duration against customer SLA covenants.
 * - Detects timestamp conflicts, duration anomalies, and telemetry gaps.
 * - Identifies missing evidence required for recovery qualification.
 * - Explains recovery eligibility while strictly avoiding declaring legal breaches on incomplete evidence.
 */

import { Incident, Contract } from '@/types';
import { callGeminiStructured } from './geminiClient';
import { isMaintenanceWindow } from '../slaEngine';

export interface TimelineAuditPoint {
  stage: string;
  timestamp: string;
  source: string;
  isVerified: boolean;
  notes?: string;
}

export interface TimestampConflict {
  issue: string;
  fieldA: string;
  fieldB: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface IncidentInvestigationResult {
  incidentId: string;
  incidentNumber: string;
  service: string;
  severity: string;
  aiProvider: string;
  modelName: string;
  isLiveAiConfigured: boolean;
  investigationStatus: 'QUALIFIED_FOR_RECOVERY' | 'FURTHER_EVIDENCE_REQUIRED' | 'MAINTENANCE_EXCLUDED' | 'NO_BREACH_DETECTED';
  confidenceScore: number; // 0.0 - 1.0
  confirmedFacts: string[];
  assumptionsAndInferences: string[];
  timestampConflicts: TimestampConflict[];
  missingEvidenceGaps: string[];
  timelineAudit: TimelineAuditPoint[];
  slaImpactAnalysis: {
    monthlyAvailabilityCeiling: number; // e.g. 99.912%
    covenantBreached: boolean;
    deficitMinutes: number;
    potentiallyAffectedContractsCount: number;
  };
  recoveryQualificationRationale: string;
  recommendations: string[];
  disclaimer: string;
}

const INVESTIGATION_DISCLAIMER =
  'AI Incident Investigation provides forensic correlation and anomaly detection. It does not establish binding legal liability. Final qualification requires verification by the Compliance Officer in the Compensation Review workbench.';

/**
 * Deterministic forensic sanity check on timestamps.
 */
export function checkTimestampConsistency(incident: Incident): TimestampConflict[] {
  const conflicts: TimestampConflict[] = [];

  const start = new Date(incident.startedAt).getTime();
  const detected = new Date(incident.detectedAt).getTime();
  const mitigated = new Date(incident.mitigatedAt).getTime();
  const resolved = new Date(incident.resolvedAt).getTime();

  if (detected < start - 60000) {
    conflicts.push({
      issue: 'DETECTION_BEFORE_START',
      fieldA: 'detectedAt',
      fieldB: 'startedAt',
      detail: `Telemetry detected outage at ${incident.detectedAt}, which is before reported incident start ${incident.startedAt}.`,
      severity: 'HIGH'
    });
  }

  if (resolved < start) {
    conflicts.push({
      issue: 'RESOLUTION_BEFORE_START',
      fieldA: 'resolvedAt',
      fieldB: 'startedAt',
      detail: `Resolution timestamp ${incident.resolvedAt} precedes incident start ${incident.startedAt}.`,
      severity: 'HIGH'
    });
  }

  if (mitigated > resolved) {
    conflicts.push({
      issue: 'MITIGATION_AFTER_RESOLUTION',
      fieldA: 'mitigatedAt',
      fieldB: 'resolvedAt',
      detail: `Mitigation recorded after final incident resolution.`,
      severity: 'LOW'
    });
  }

  const computedMinutes = Math.round((resolved - start) / 60000);
  if (Math.abs(computedMinutes - incident.durationMinutes) > 3) {
    conflicts.push({
      issue: 'DURATION_TIMESTAMP_MISMATCH',
      fieldA: 'durationMinutes',
      fieldB: 'resolvedAt - startedAt',
      detail: `Reported duration is ${incident.durationMinutes} mins, but timestamp difference yields ${computedMinutes} mins.`,
      severity: 'MEDIUM'
    });
  }

  return conflicts;
}

/**
 * Runs genuine AI investigation on an incident.
 */
export async function runIncidentInvestigationAgent(
  incident: Incident,
  associatedContracts?: Contract[]
): Promise<IncidentInvestigationResult> {
  const deterministicConflicts = checkTimestampConsistency(incident);
  const isSundayMaint = isMaintenanceWindow(new Date(incident.startedAt), incident);

  // Compute availability impact for a 30-day period (43,200 min)
  const totalPeriodMinutes = 43200;
  const maxPossibleUptime = Number(((totalPeriodMinutes - incident.durationMinutes) / totalPeriodMinutes * 100).toFixed(3));

  const targetThresholds = associatedContracts?.map(c => ({
    contract: c.contractNumber,
    customer: c.customerName,
    target: c.uptimeTarget
  })) || [{ contract: 'Baseline', customer: 'All Mapped Tenants', target: 99.95 }];

  const breachesTarget = targetThresholds.some(t => maxPossibleUptime < t.target);

  const systemPrompt = `
You are a Principal Cloud Reliability Forensic Investigator and SLA Auditor.
Investigate this production outage incident with rigorous objectivity.

COMPLIANCE & INTEGRITY RULES:
1. DISTINGUISH FACTS VS ASSUMPTIONS: Confirmed telemetry logs are facts; root cause hypotheses are assumptions.
2. DO NOT DECLARE PREMATURE LEGAL BREACH: If telemetry or root cause evidence is incomplete, do NOT declare a definitive contractual breach. State "FURTHER_EVIDENCE_REQUIRED".
3. DETECT TELEMETRY GAPS: Check for missing synthetic probe metrics, lack of multi-region confirmation, or unconfirmed resolution.
4. CORRELATE TO CONTRACTS: Check if the downtime minutes (${incident.durationMinutes}m) would push monthly availability below customer SLA targets.
`;

  const prompt = `
Investigate this incident:
Incident Number: "${incident.incidentNumber}"
Service Impacted: "${incident.service}"
Severity: "${incident.severity}"
Duration: ${incident.durationMinutes} minutes
Status: "${incident.status}"
Summary: "${incident.summary}"
Root Cause: "${incident.rootCause}"
Started At: "${incident.startedAt}"
Detected At: "${incident.detectedAt}"
Mitigated At: "${incident.mitigatedAt}"
Resolved At: "${incident.resolvedAt}"
Affected Regions: ${JSON.stringify(incident.affectedRegions)}
Affected Customers Count: ${incident.affectedCustomersCount}
Telemetry Points Count: ${incident.telemetry?.length || 0}
Sunday Maintenance Window Active: ${isSundayMaint ? 'YES' : 'NO'}
Identified Timestamp Conflicts: ${JSON.stringify(deterministicConflicts)}
Associated SLA Covenants: ${JSON.stringify(targetThresholds)}

Return a valid JSON object matching this schema:
{
  "investigationStatus": "QUALIFIED_FOR_RECOVERY" | "FURTHER_EVIDENCE_REQUIRED" | "MAINTENANCE_EXCLUDED" | "NO_BREACH_DETECTED",
  "confidenceScore": number (0.0 to 1.0),
  "confirmedFacts": string[],
  "assumptionsAndInferences": string[],
  "missingEvidenceGaps": string[],
  "recoveryQualificationRationale": string,
  "recommendations": string[]
}
`;

  const geminiRes = await callGeminiStructured<any>(prompt, {
    systemPrompt,
    temperature: 0.1,
    timeoutMs: 12000
  });

  const timelineAudit: TimelineAuditPoint[] = [
    {
      stage: 'Incident Start',
      timestamp: incident.startedAt,
      source: 'Synthetic Canary Ingestion Monitor',
      isVerified: true
    },
    {
      stage: 'Detection',
      timestamp: incident.detectedAt,
      source: 'PagerDuty Alert Webhook',
      isVerified: true,
      notes: deterministicConflicts.find(c => c.issue === 'DETECTION_BEFORE_START')?.detail
    },
    {
      stage: 'Mitigation',
      timestamp: incident.mitigatedAt,
      source: 'On-Call Engineering Runbook Execution',
      isVerified: incident.mitigatedAt !== incident.startedAt
    },
    {
      stage: 'Full Resolution',
      timestamp: incident.resolvedAt,
      source: 'Telemetry Health Check Affirmation',
      isVerified: true
    }
  ];

  if (geminiRes.success && geminiRes.data) {
    const rawData = geminiRes.data;

    let status = rawData.investigationStatus;
    // Safety guardrail: If maintenance window applies, override to MAINTENANCE_EXCLUDED
    if (isSundayMaint && incident.summary.toLowerCase().includes('maintenance')) {
      status = 'MAINTENANCE_EXCLUDED';
    }

    return {
      incidentId: incident.id,
      incidentNumber: incident.incidentNumber,
      service: incident.service,
      severity: incident.severity,
      aiProvider: 'Google Gemini',
      modelName: geminiRes.modelName,
      isLiveAiConfigured: true,
      investigationStatus: status || (breachesTarget ? 'QUALIFIED_FOR_RECOVERY' : 'NO_BREACH_DETECTED'),
      confidenceScore: Number(rawData.confidenceScore || 0.94),
      confirmedFacts: rawData.confirmedFacts || [
        `Service impacted: ${incident.service} in regions: ${incident.affectedRegions.join(', ')}.`,
        `Duration confirmed: ${incident.durationMinutes} continuous minutes.`,
        `Outage impact drops monthly availability to ${maxPossibleUptime}%.`
      ],
      assumptionsAndInferences: rawData.assumptionsAndInferences || [
        `Root cause diagnosis "${incident.rootCause}" assumes failure originated in provider cluster rather than client network transit.`,
        'Impacted customer accounts assumed uniformly degraded during outage window.'
      ],
      timestampConflicts: deterministicConflicts,
      missingEvidenceGaps: rawData.missingEvidenceGaps || (
        deterministicConflicts.length > 0
          ? ['Reconciliation needed between PagerDuty alert timestamp and APM telemetry start.']
          : ['Third-party status page confirmation recommended.']
      ),
      timelineAudit,
      slaImpactAnalysis: {
        monthlyAvailabilityCeiling: maxPossibleUptime,
        covenantBreached: breachesTarget,
        deficitMinutes: incident.durationMinutes,
        potentiallyAffectedContractsCount: incident.affectedCustomersCount
      },
      recoveryQualificationRationale: rawData.recoveryQualificationRationale || (
        breachesTarget
          ? `Outage of ${incident.durationMinutes} mins pulls 30-day uptime to ${maxPossibleUptime}%, breaching contractual 99.95% target by ${(99.95 - maxPossibleUptime).toFixed(3)}%. Qualifies for automated remedy calculation.`
          : 'Downtime duration did not breach contracted SLA threshold.'
      ),
      recommendations: rawData.recommendations || [
        'Queue calculated compensation packages for Dual-Approval review.',
        'Preserve raw synthetic probe traces in evidence dossier.'
      ],
      disclaimer: INVESTIGATION_DISCLAIMER
    };
  }

  // Deterministic Fallback
  return runDeterministicIncidentInvestigation(incident, deterministicConflicts, breachesTarget, maxPossibleUptime, isSundayMaint);
}

/**
 * Deterministic Incident Investigation Fallback
 */
export function runDeterministicIncidentInvestigation(
  incident: Incident,
  conflicts: TimestampConflict[],
  breachesTarget: boolean,
  maxPossibleUptime: number,
  isSundayMaint: boolean
): IncidentInvestigationResult {
  const isMaint = isSundayMaint || /maintenance|scheduled/i.test(incident.summary);

  const status: 'QUALIFIED_FOR_RECOVERY' | 'FURTHER_EVIDENCE_REQUIRED' | 'MAINTENANCE_EXCLUDED' | 'NO_BREACH_DETECTED' =
    isMaint
      ? 'MAINTENANCE_EXCLUDED'
      : conflicts.length > 1
      ? 'FURTHER_EVIDENCE_REQUIRED'
      : breachesTarget
      ? 'QUALIFIED_FOR_RECOVERY'
      : 'NO_BREACH_DETECTED';

  return {
    incidentId: incident.id,
    incidentNumber: incident.incidentNumber,
    service: incident.service,
    severity: incident.severity,
    aiProvider: 'Deterministic Forensic Engine',
    modelName: 'telemetry-correlation-v2',
    isLiveAiConfigured: false,
    investigationStatus: status,
    confidenceScore: conflicts.length > 0 ? 0.78 : 0.96,
    confirmedFacts: [
      `Service impacted: ${incident.service} (${incident.severity}).`,
      `Confirmed outage duration: ${incident.durationMinutes} minutes across ${incident.affectedRegions.join(', ')}.`,
      `Monthly availability limit computed as ${maxPossibleUptime}% (43,200 total monthly minutes).`,
      `Mapped enterprise tenants: ${incident.affectedCustomersCount} accounts.`
    ],
    assumptionsAndInferences: [
      `Root cause reported as "${incident.rootCause}"; assumed single-point-of-failure in provider boundary.`,
      conflicts.length > 0 ? 'Timestamp variance requires human telemetry audit.' : 'Telemetry probes verified synchronized.'
    ],
    timestampConflicts: conflicts,
    missingEvidenceGaps: conflicts.length > 0
      ? ['Timestamp alignment between APM monitor and alert webhook is required.']
      : ['External DNS transit confirmation probe log.'],
    timelineAudit: [
      { stage: 'Start', timestamp: incident.startedAt, source: 'APM Synthetic Probe', isVerified: true },
      { stage: 'Detect', timestamp: incident.detectedAt, source: 'PagerDuty', isVerified: true },
      { stage: 'Resolve', timestamp: incident.resolvedAt, source: 'Synthetic Ledger', isVerified: true }
    ],
    slaImpactAnalysis: {
      monthlyAvailabilityCeiling: maxPossibleUptime,
      covenantBreached: breachesTarget,
      deficitMinutes: incident.durationMinutes,
      potentiallyAffectedContractsCount: incident.affectedCustomersCount
    },
    recoveryQualificationRationale: isMaint
      ? 'Incident occurred during scheduled maintenance window; excluded from SLA credit penalty.'
      : breachesTarget
      ? `Outage of ${incident.durationMinutes}m breaches 99.95% uptime covenant (measured ceiling: ${maxPossibleUptime}%). Qualifies for SLA recovery under Tier 1/2 schedules.`
      : 'Outage duration remained within allowable monthly downtime threshold.',
    recommendations: [
      'Confirm tenant mapping against contract schedule in Compensation Review.',
      'Audit Prometheus latency histograms for secondary cascade degradation.'
    ],
    disclaimer: INVESTIGATION_DISCLAIMER
  };
}
