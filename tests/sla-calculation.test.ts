import {
  getMeasurementPeriodMinutes,
  mergeOutageIntervals,
  isMaintenanceWindow,
  evaluateCompensationTier,
  isClaimExpired,
  calculateEntitlementEngine,
  OutageInterval
} from '../src/lib/slaEngine';
import { Contract, Customer, Incident } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('\n--- EXECUTING PHASE 1: SLA CALCULATION CORRECTNESS TESTS ---\n');

// TEST 1: Mathematical Reference Validation (38 minutes in 30 days)
{
  const totalMinutes = 30 * 24 * 60; // 43,200
  const outageMinutes = 38;
  const rawAvailability = ((totalMinutes - outageMinutes) / totalMinutes) * 100;
  const roundedUptime = Number(rawAvailability.toFixed(3));

  assert(totalMinutes === 43200, '30 days has exactly 43,200 minutes');
  assert(
    roundedUptime === 99.912,
    `38 minutes of downtime in a 30-day month must equal 99.912% uptime, got ${roundedUptime}%`
  );
  assert(
    Math.abs(roundedUptime - 99.912) < 0.0001,
    'Verified 99.912% mathematically matches (43200 - 38) / 43200 * 100'
  );
}

// TEST 2: Calendar-based Measurement Periods
{
  // November (30 days)
  const nov = getMeasurementPeriodMinutes('Monthly', 2026, 10);
  assert(nov.totalMinutes === 43200, 'November 2026 has 43,200 minutes (30 days)');

  // October (31 days)
  const oct = getMeasurementPeriodMinutes('Monthly', 2026, 9);
  assert(oct.totalMinutes === 44640, 'October 2026 has 44,640 minutes (31 days)');

  // February 2026 (non-leap: 28 days)
  const feb = getMeasurementPeriodMinutes('Monthly', 2026, 1);
  assert(feb.totalMinutes === 40320, 'February 2026 has 40,320 minutes (28 days)');

  // Quarterly Q4 (Oct 31 + Nov 30 + Dec 31 = 92 days)
  const q4 = getMeasurementPeriodMinutes('Quarterly', 2026, 4);
  assert(q4.totalMinutes === 92 * 24 * 60, `Q4 has 92 days (${92 * 24 * 60} minutes)`);

  // Annual 2026 (365 days)
  const annual = getMeasurementPeriodMinutes('Annual', 2026, 0);
  assert(annual.totalMinutes === 525600, 'Annual 2026 has 525,600 minutes (365 days)');
}

// TEST 3: Overlapping Outage Intervals Merging
{
  const now = Date.now();
  const intervals: OutageInterval[] = [
    // Incident A: 14:00 to 14:40 (40m)
    { start: now, end: now + 40 * 60000, incidentId: 'inc-1', isExcluded: false },
    // Incident B: 14:20 to 15:00 (40m) - overlaps Incident A by 20m
    { start: now + 20 * 60000, end: now + 60 * 60000, incidentId: 'inc-2', isExcluded: false }
  ];

  const merged = mergeOutageIntervals(intervals);
  assert(merged.length === 1, 'Overlapping intervals merged into 1 continuous interval');
  assert(merged[0].durationMinutes === 60, `Combined downtime is 60m (not double-counted 80m), got ${merged[0].durationMinutes}m`);
}

// TEST 4: Planned Maintenance Exclusions
{
  const sunday0300 = new Date('2026-11-08T03:00:00Z'); // Sunday 03:00 UTC
  const monday1000 = new Date('2026-11-09T10:00:00Z'); // Monday 10:00 UTC

  const mockInc: Incident = {
    id: 'inc-maint',
    incidentNumber: 'INC-M',
    service: 'DB',
    severity: 'P3 - Minor',
    status: 'resolved',
    summary: 'Scheduled Sunday DB Maintenance',
    rootCause: 'Patching',
    startedAt: sunday0300.toISOString(),
    detectedAt: sunday0300.toISOString(),
    mitigatedAt: sunday0300.toISOString(),
    resolvedAt: sunday0300.toISOString(),
    durationMinutes: 30,
    affectedRegions: ['us-east-1'],
    affectedCustomerIds: ['c1'],
    affectedCustomersCount: 1,
    telemetry: [],
    timeline: [],
    slaBreached: false,
    slaImpactAnalysis: '',
    isPlannedMaintenance: true
  };

  assert(isMaintenanceWindow(sunday0300, mockInc) === true, 'Sunday 03:00 maintenance window correctly excluded');
  mockInc.isPlannedMaintenance = false;
  mockInc.summary = 'Emergency outage';
  assert(isMaintenanceWindow(monday1000, mockInc) === false, 'Monday production incident is NOT excluded');
}

// TEST 5: Compensation Tier Matching Logic
{
  const tiers = [
    { uptimeThreshold: 99.95, creditPercentage: 0, label: '≥ 99.95% Target Met' },
    { uptimeThreshold: 99.95, creditPercentage: 10, label: '99.50% - 99.94% (10% Credit)' },
    { uptimeThreshold: 99.50, creditPercentage: 25, label: '99.00% - 99.49% (25% Credit)' },
    { uptimeThreshold: 99.00, creditPercentage: 50, label: '< 99.00% (50% Credit)' }
  ];

  // Case A: 99.96% (Met)
  const resA = evaluateCompensationTier(99.96, 99.95, tiers);
  assert(!resA.isBreached && resA.creditPercentage === 0, '99.96% meets 99.95% target (0% credit)');

  // Case B: 99.912% (38 mins downtime in 30-day month) -> falls in 99.50% - 99.94% tier (10% credit)
  const resB = evaluateCompensationTier(99.912, 99.95, tiers);
  assert(resB.isBreached && resB.creditPercentage === 10, `99.912% breach matches 10% credit tier, got ${resB.creditPercentage}%`);

  // Case C: 99.25% (32 mins in standard tier) -> falls in 99.00% - 99.49% tier (25% credit)
  const resC = evaluateCompensationTier(99.25, 99.95, tiers);
  assert(resC.isBreached && resC.creditPercentage === 25, `99.25% breach matches 25% credit tier, got ${resC.creditPercentage}%`);

  // Case D: 98.50% (Severe) -> falls in < 99.00% tier (50% credit)
  const resD = evaluateCompensationTier(98.50, 99.95, tiers);
  assert(resD.isBreached && resD.creditPercentage === 50, `98.50% breach matches 50% credit tier, got ${resD.creditPercentage}%`);
}

// TEST 6: Claim Deadline Enforcement
{
  const novEnd = new Date('2026-11-30T23:59:59Z');
  const claimDeadlineDays = 30;

  // Day 20 after end (Dec 20) -> Valid
  const validDate = new Date('2026-12-20T10:00:00Z');
  assert(!isClaimExpired(novEnd, claimDeadlineDays, validDate), 'Claim within 30-day window is valid');

  // Day 45 after end (Jan 15) -> Expired
  const expiredDate = new Date('2027-01-15T10:00:00Z');
  assert(isClaimExpired(novEnd, claimDeadlineDays, expiredDate), 'Claim past 30-day window is expired');
}

// TEST 7: Cumulative Caps and Cumulative Monthly Outages
{
  const mockCustomer: Customer = {
    id: 'c-test',
    name: 'Test Corp',
    domain: 'test.com',
    plan: 'Enterprise Tier 1',
    monthlySpend: 10000,
    billingEmail: 'bill@test.com',
    paypalEmail: 'pay@test.com',
    slaContractId: 'k-1',
    contractNumber: 'SLA-1',
    region: 'us-east',
    paymentMethod: 'PayPal Refund'
  };

  const mockContract: Contract = {
    id: 'k-1',
    contractNumber: 'SLA-1',
    customerId: 'c-test',
    customerName: 'Test Corp',
    slaName: 'Gold SLA',
    uptimeTarget: 99.95,
    measurementPeriod: 'Monthly',
    claimDeadlineDays: 30,
    compensationTiers: [
      { uptimeThreshold: 99.95, creditPercentage: 0, label: 'Met' },
      { uptimeThreshold: 99.95, creditPercentage: 10, label: '10% Tier' },
      { uptimeThreshold: 99.50, creditPercentage: 25, label: '25% Tier' },
      { uptimeThreshold: 99.00, creditPercentage: 50, label: '50% Tier' }
    ],
    maintenanceExclusions: [],
    maxCompensationPercent: 30, // Cap at 30% of $10,000 = $3,000 max
    effectiveStartDate: '2026-01-01',
    effectiveEndDate: '2026-12-31',
    status: 'active',
    extractedConfidence: 0.99,
    uploadedAt: '2026-01-01T00:00:00Z',
    fileName: 'sla.pdf',
    fileSize: '1MB',
    clauses: []
  };

  const inc1: Incident = {
    id: 'inc-1',
    incidentNumber: 'INC-1',
    service: 'API',
    severity: 'P1 - Critical',
    status: 'resolved',
    summary: '38 min outage',
    rootCause: 'Crash',
    startedAt: '2026-11-03T14:00:00Z',
    detectedAt: '2026-11-03T14:00:00Z',
    mitigatedAt: '2026-11-03T14:38:00Z',
    resolvedAt: '2026-11-03T14:38:00Z',
    durationMinutes: 38,
    affectedRegions: ['us-east'],
    affectedCustomerIds: ['c-test'],
    affectedCustomersCount: 1,
    telemetry: [],
    timeline: [],
    slaBreached: true,
    slaImpactAnalysis: ''
  };

  // Test single incident calculation
  const ent1 = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: mockContract,
    triggeringIncident: inc1,
    allPeriodIncidents: [inc1],
    evaluationDate: new Date('2026-11-04T00:00:00Z'),
    cumulativePeriodCreditsAlreadyGranted: 0
  });

  assert(ent1.measuredUptime === 99.912, `ent1 measuredUptime must be exactly 99.912%, got ${ent1.measuredUptime}%`);
  assert(ent1.eligibleCredit === 1000, `ent1 credit is 10% of $10,000 = $1,000, got $${ent1.eligibleCredit}`);

  // Test cumulative incident calculation in same month:
  // Inc 2 has 450 min outage (total 488m downtime in 43,200m = 98.87% availability)
  // This breaches < 99.00%, triggering 50% ($5,000), but contract maxCompensationPercent is 30% ($3,000)
  // And $1,000 was already granted previously -> remaining allowable credit is exactly $2,000!
  const inc2: Incident = {
    id: 'inc-2',
    incidentNumber: 'INC-2',
    service: 'API',
    severity: 'P1 - Critical',
    status: 'resolved',
    summary: '450 min severe outage',
    rootCause: 'Hardware',
    startedAt: '2026-11-15T10:00:00Z',
    detectedAt: '2026-11-15T10:00:00Z',
    mitigatedAt: '2026-11-15T17:30:00Z',
    resolvedAt: '2026-11-15T17:30:00Z',
    durationMinutes: 450,
    affectedRegions: ['us-east'],
    affectedCustomerIds: ['c-test'],
    affectedCustomersCount: 1,
    telemetry: [],
    timeline: [],
    slaBreached: true,
    slaImpactAnalysis: ''
  };

  const ent2 = calculateEntitlementEngine({
    customer: mockCustomer,
    contract: mockContract,
    triggeringIncident: inc2,
    allPeriodIncidents: [inc1, inc2],
    evaluationDate: new Date('2026-11-16T00:00:00Z'),
    cumulativePeriodCreditsAlreadyGranted: 1000 // $1,000 granted previously
  });

  assert(ent2.eligibleCredit === 2000, `ent2 credit is capped to remaining $2,000 (total $3,000 cap), got $${ent2.eligibleCredit}`);
}

console.log('\n✅ ALL PHASE 1 SLA CALCULATION TESTS PASSED WITH 100% MATHEMATICAL PRECISION!\n');
