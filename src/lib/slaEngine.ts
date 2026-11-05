import {
  Contract,
  Incident,
  Customer,
  Entitlement,
  SLATier,
  CalculationDetail,
  EntitlementStatus
} from '../types';

export interface OutageInterval {
  start: number; // epoch ms
  end: number;   // epoch ms
  incidentId: string;
  isExcluded: boolean;
  exclusionReason?: string;
}

/**
 * Returns total minutes in a given measurement period.
 * Accurately accounts for calendar days (28, 29, 30, 31 days) or quarterly/annual cycles.
 */
export function getMeasurementPeriodMinutes(
  periodType: 'Monthly' | 'Quarterly' | 'Annual',
  year: number,
  monthOrQuarter: number // 0-indexed month (0=Jan..11=Dec) or 1-4 quarter
): { totalMinutes: number; startDate: Date; endDate: Date; periodKey: string } {
  let startDate: Date;
  let endDate: Date;
  let periodKey: string;

  if (periodType === 'Monthly') {
    const month = monthOrQuarter;
    startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    // Last day of month: next month day 0
    endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const totalMinutes = daysInMonth * 24 * 60;
    periodKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    return { totalMinutes, startDate, endDate, periodKey };
  } else if (periodType === 'Quarterly') {
    const quarter = monthOrQuarter; // 1, 2, 3, 4
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 2;
    startDate = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(year, endMonth + 1, 0, 23, 59, 59, 999));
    const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalMinutes = totalDays * 24 * 60;
    periodKey = `${year}-Q${quarter}`;
    return { totalMinutes, startDate, endDate, periodKey };
  } else {
    startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const totalDays = isLeap ? 366 : 365;
    const totalMinutes = totalDays * 24 * 60;
    periodKey = `${year}`;
    return { totalMinutes, startDate, endDate, periodKey };
  }
}

/**
 * Merges overlapping intervals to prevent double-counting outage time.
 */
export function mergeOutageIntervals(intervals: OutageInterval[]): { start: number; end: number; durationMinutes: number }[] {
  // Filter out planned maintenance / excluded intervals
  const billable = intervals.filter(i => !i.isExcluded && i.end > i.start);
  if (billable.length === 0) return [];

  const sorted = [...billable].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; durationMinutes: number }[] = [];

  let currentStart = sorted[0].start;
  let currentEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start <= currentEnd) {
      // Overlapping or contiguous interval -> extend
      currentEnd = Math.max(currentEnd, next.end);
    } else {
      // Gap detected -> commit previous interval
      const durationMinutes = Number(((currentEnd - currentStart) / (1000 * 60)).toFixed(2));
      merged.push({ start: currentStart, end: currentEnd, durationMinutes });
      currentStart = next.start;
      currentEnd = next.end;
    }
  }

  const durationMinutes = Number(((currentEnd - currentStart) / (1000 * 60)).toFixed(2));
  merged.push({ start: currentStart, end: currentEnd, durationMinutes });

  return merged;
}

/**
 * Checks if a timestamp falls within a scheduled maintenance exclusion.
 * Standard rule: Sunday 02:00 - 04:00 UTC, or explicit incident flags.
 */
export function isMaintenanceWindow(timestamp: Date, incident: Incident): boolean {
  if (incident.isPlannedMaintenance) return true;
  if (incident.summary.toLowerCase().includes('scheduled maintenance')) return true;

  // Check Sunday 02:00 - 04:00 UTC
  const dayOfWeek = timestamp.getUTCDay(); // 0 = Sunday
  const hour = timestamp.getUTCHours();
  if (dayOfWeek === 0 && hour >= 2 && hour < 4) {
    return true;
  }

  return false;
}

/**
 * Evaluates contractual compensation tier based on measured availability.
 * Ascending threshold evaluation: checks brackets from most severe outage to least.
 */
export function evaluateCompensationTier(
  measuredUptime: number,
  uptimeTarget: number,
  tiers: SLATier[]
): { tier: SLATier; creditPercentage: number; isBreached: boolean } {
  // If uptime meets or exceeds target -> no breach
  if (measuredUptime >= uptimeTarget) {
    const defaultMetTier = tiers.find(t => t.uptimeThreshold >= uptimeTarget && t.creditPercentage === 0) || {
      uptimeThreshold: uptimeTarget,
      creditPercentage: 0,
      label: `≥ ${uptimeTarget}% Target Satisfied`
    };
    return { tier: defaultMetTier, creditPercentage: 0, isBreached: false };
  }

  // Filter breach tiers and sort ascending by threshold (most severe outage first)
  const breachTiers = tiers
    .filter(t => t.creditPercentage > 0)
    .sort((a, b) => a.uptimeThreshold - b.uptimeThreshold);

  let selectedTier: SLATier | null = null;

  for (const tier of breachTiers) {
    // If measured uptime falls below this tier's threshold bracket
    if (measuredUptime < tier.uptimeThreshold) {
      selectedTier = tier;
      break;
    }
  }

  // If measured uptime is below target but above lowest breach threshold, assign the nearest breach tier
  if (!selectedTier && breachTiers.length > 0) {
    selectedTier = breachTiers[breachTiers.length - 1];
  }

  if (selectedTier) {
    return {
      tier: selectedTier,
      creditPercentage: selectedTier.creditPercentage,
      isBreached: true
    };
  }

  return {
    tier: { uptimeThreshold: uptimeTarget, creditPercentage: 0, label: 'Target Satisfied' },
    creditPercentage: 0,
    isBreached: false
  };
}

/**
 * Validates claim deadline:
 * E.g., if claim window is 30 days and the evaluation date is past deadline -> claim expired.
 */
export function isClaimExpired(periodEndDate: Date, claimDeadlineDays: number, evaluationDate = new Date()): boolean {
  const deadlineMs = periodEndDate.getTime() + (claimDeadlineDays * 24 * 60 * 60 * 1000);
  return evaluationDate.getTime() > deadlineMs;
}

/**
 * Calculates contractual availability and financial entitlement for an incident and tenant.
 * Aggregates cumulative outage minutes across the billing period and checks contractual limits.
 */
export function calculateEntitlementEngine(params: {
  customer: Customer;
  contract: Contract;
  triggeringIncident: Incident;
  allPeriodIncidents: Incident[]; // All incidents within the customer's billing cycle
  evaluationDate?: Date;
  cumulativePeriodCreditsAlreadyGranted?: number; // Total credits already awarded this period
}): Entitlement {
  const { customer, contract, triggeringIncident, allPeriodIncidents, evaluationDate = new Date(), cumulativePeriodCreditsAlreadyGranted = 0 } = params;

  // 1. Determine Measurement Period Calendar Window
  const incidentStart = new Date(triggeringIncident.startedAt);
  const year = incidentStart.getUTCFullYear();
  const month = incidentStart.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;

  const period = getMeasurementPeriodMinutes(contract.measurementPeriod, year, contract.measurementPeriod === 'Quarterly' ? quarter : month);

  // 2. Collect and Merge Outage Intervals within this Period and Customer Scope
  const intervals: OutageInterval[] = [];

  for (const inc of allPeriodIncidents) {
    // Only include if tenant was affected and service is within SLA scope
    if (inc.affectedCustomerIds.includes(customer.id)) {
      const incStart = new Date(inc.startedAt).getTime();
      const incEnd = new Date(inc.resolvedAt || inc.startedAt).getTime();

      // Clip to period bounds
      const clampedStart = Math.max(incStart, period.startDate.getTime());
      const clampedEnd = Math.min(incEnd, period.endDate.getTime());

      if (clampedEnd > clampedStart) {
        const isExcluded = isMaintenanceWindow(new Date(incStart), inc);
        intervals.push({
          start: clampedStart,
          end: clampedEnd,
          incidentId: inc.id,
          isExcluded,
          exclusionReason: isExcluded ? 'Scheduled maintenance window or explicit exclusion clause' : undefined
        });
      }
    }
  }

  const mergedIntervals = mergeOutageIntervals(intervals);
  const cumulativeDowntimeMinutes = mergedIntervals.reduce((sum, int) => sum + int.durationMinutes, 0);

  // 3. Exact Mathematical Availability Calculation
  // Mathematical Truth: ((totalMinutes - downtimeMinutes) / totalMinutes) * 100
  const totalMinutes = period.totalMinutes;
  const rawAvailability = ((totalMinutes - cumulativeDowntimeMinutes) / totalMinutes) * 100;
  // Round to 3 decimal places (e.g. 38 mins in 43,200 is 99.912%)
  const measuredUptime = Number(rawAvailability.toFixed(3));
  const isBreached = measuredUptime < contract.uptimeTarget;
  const breachMagnitude = isBreached ? Number((contract.uptimeTarget - measuredUptime).toFixed(3)) : 0;

  // 4. Claim Deadline Check
  const claimExpired = isClaimExpired(period.endDate, contract.claimDeadlineDays, evaluationDate);

  // 5. Tier Evaluation & Credit Calculation
  let { tier: applicableTier, creditPercentage } = evaluateCompensationTier(
    measuredUptime,
    contract.uptimeTarget,
    contract.compensationTiers
  );

  // Apply Single Incident / Single Calculation Cap
  if (creditPercentage > contract.maxCompensationPercent) {
    creditPercentage = contract.maxCompensationPercent;
  }

  // Monetary base fee
  const baseMonthlyAmount = customer.monthlySpend;
  let rawCreditAmount = Number(((baseMonthlyAmount * creditPercentage) / 100).toFixed(2));

  // Apply Cumulative Period Cap and Incremental Credit Logic
  const maxAllowablePeriodCredit = Number(((baseMonthlyAmount * contract.maxCompensationPercent) / 100).toFixed(2));
  const remainingAllowableCredit = Math.max(0, maxAllowablePeriodCredit - cumulativePeriodCreditsAlreadyGranted);

  // Incremental credit owed for this incident given cumulative tier entitlement
  const incrementalCredit = Math.max(0, rawCreditAmount - cumulativePeriodCreditsAlreadyGranted);
  rawCreditAmount = Math.min(incrementalCredit, remainingAllowableCredit);

  // Determine Status
  let status: EntitlementStatus;
  if (triggeringIncident.isPlannedMaintenance) {
    status = 'not_eligible';
  } else if (!isBreached) {
    status = 'not_eligible';
  } else if (claimExpired) {
    status = 'not_eligible';
  } else if (rawCreditAmount <= 0) {
    status = 'not_eligible';
  } else if (contract.status === 'requires_review') {
    status = 'requires_review';
  } else {
    status = 'pending_approval';
  }

  const idempotencyKey = `${customer.id}:${period.periodKey}:${triggeringIncident.id}`;
  const caseNumber = `ENT-${period.periodKey.replace('-', '')}-${Math.abs(hashString(idempotencyKey)) % 9000 + 1000}`;

  return {
    id: `ent-${hashString(idempotencyKey)}`,
    caseNumber,
    customerId: customer.id,
    customerName: customer.name,
    customerPlan: customer.plan,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    incidentId: triggeringIncident.id,
    incidentNumber: triggeringIncident.incidentNumber,
    incidentSummary: triggeringIncident.summary,
    measuredUptime,
    eligibleCredit: !triggeringIncident.isPlannedMaintenance && isBreached && !claimExpired ? rawCreditAmount : 0,
    status,
    billingPeriodKey: period.periodKey,
    idempotencyKey,
    isClaimDeadlineExpired: claimExpired,
    payoutMethod: customer.paymentMethod === 'Direct Invoicing Credit' ? 'Service Credit' : 'PayPal Refund',
    evidenceSummary: triggeringIncident.isPlannedMaintenance
      ? `Incident ${triggeringIncident.incidentNumber} is designated as pre-scheduled planned maintenance and is excluded from contractual SLA compensation.`
      : claimExpired
      ? `Contractual breach detected (${measuredUptime}% vs ${contract.uptimeTarget}%), but claim deadline (${contract.claimDeadlineDays} days post-period) expired.`
      : !isBreached
      ? `Measured availability (${measuredUptime}%) satisfied contractual commitment (${contract.uptimeTarget}%). Zero compensation liability.`
      : rawCreditAmount <= 0
      ? `Cumulative compensation of $${cumulativePeriodCreditsAlreadyGranted.toFixed(2)} already satisfies contractual tier liability (${creditPercentage}%) for period ${period.periodKey}.`
      : `Cumulative period downtime: ${cumulativeDowntimeMinutes} min over ${totalMinutes} period minutes yields ${measuredUptime}% availability (covenant: ${contract.uptimeTarget}%). Tier applied: ${applicableTier.label}. Incremental compensation: $${rawCreditAmount.toFixed(2)} capped at contractual limits.`,
    telemetrySource: `Synthetic Telemetry Probe & Ingestion Logs for ${triggeringIncident.service}`,
    calculation: {
      contractedUptime: contract.uptimeTarget,
      measuredUptime,
      outageMinutes: cumulativeDowntimeMinutes,
      totalPeriodMinutes: totalMinutes,
      breachMagnitude,
      applicableTier,
      formula: `Monthly Base Fee ($${baseMonthlyAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}) × ${creditPercentage}% Tier Compensation`,
      baseAmount: baseMonthlyAmount,
      creditAmount: isBreached && !claimExpired ? rawCreditAmount : 0,
      calculatedAt: evaluationDate.toISOString(),
      applicableClauseId: contract.clauses[1]?.id || contract.clauses[0]?.id || 'clause-gen',
      applicableClauseTitle: contract.clauses[1]?.title || 'Service Credit Tier Escalation',
      cumulativePeriodDowntimeMinutes: cumulativeDowntimeMinutes,
      cumulativePeriodCredits: cumulativePeriodCreditsAlreadyGranted + rawCreditAmount,
      measurementPeriodScope: `${contract.measurementPeriod} (${period.periodKey})`
    },
    approvalHistory: [
      {
        requestedAt: evaluationDate.toISOString(),
        notes: `Automated calculation by PromiseBack SLA Engine v3.0. Period: ${period.periodKey}.`
      }
    ]
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
