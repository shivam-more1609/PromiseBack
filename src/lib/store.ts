import {
  Contract,
  Incident,
  Customer,
  Entitlement,
  RefundRecord,
  ServiceCreditRecord,
  AuditEvent,
  DashboardStats,
  AvailabilityTimeSeriesPoint,
  VerificationStatus,
  EntitlementStatus,
  GenuineCaptureRecord
} from '../types';
import {
  calculateEntitlementEngine,
  getMeasurementPeriodMinutes,
  mergeOutageIntervals
} from './slaEngine';
import {
  executePayPalCaptureRefund,
  validatePayPalCaptureForRefund,
  isPayPalSandboxConfigured,
  PayPalRefundResult
} from './paypal';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'store.json');
const DEMO_DATA_FILE_PATH = path.join(process.cwd(), 'data', 'store.demo.json');

class PromiseBackStore {
  private contracts: Contract[] = [];
  private incidents: Incident[] = [];
  private customers: Customer[] = [];
  private entitlements: Entitlement[] = [];
  private refunds: RefundRecord[] = [];
  private serviceCredits: ServiceCreditRecord[] = [];
  private auditEvents: AuditEvent[] = [];
  private genuineCaptures: GenuineCaptureRecord[] = [];
  private processedWebhookEventIds: string[] = [];
  private lastAuditHash: string = '0000000000000000000000000000000000000000000000000000000000000000';
  private entitlementLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    if (!this.loadFromDisk()) {
      this.seedInitialData();
      this.saveToDisk();
    }
    this.reconcileStartupRefunds();
  }

  /**
   * Reconciles incomplete or processing financial refunds on server startup.
   * If a process crashed during refund execution, marks them for manual audit / reconciliation
   * to strictly prevent blind duplicate disbursement upon restart.
   */
  private reconcileStartupRefunds(): void {
    const processingRefunds = this.refunds.filter(r => r.status === 'processing');
    if (processingRefunds.length > 0) {
      for (const r of processingRefunds) {
        r.status = 'pending_reconciliation';
        r.failureReason = 'Process interrupted during dispatch. Reconciliation required before retry to prevent duplicate payment.';
        this.recordAuditEventSync({
          category: 'SYSTEM',
          eventType: 'REFUND_STARTUP_RECONCILED',
          description: `Refund ${r.refundNumber} was processing when process halted. Transitioned to pending_reconciliation.`,
          actor: { type: 'SYSTEM_AI', name: 'Startup Reconciliation Worker' },
          entityId: r.id,
          entityType: 'Refund'
        });
      }
      this.saveToDisk();
    }
  }

  /**
   * In-process concurrency mutex for financial operations touching the same entitlement.
   * Serializes simultaneous requests against the same entitlement to ensure atomic balance checks and reservations.
   */
  public async acquireEntitlementLock<T>(entitlementId: string, operation: () => Promise<T>): Promise<T> {
    while (this.entitlementLocks.has(entitlementId)) {
      await this.entitlementLocks.get(entitlementId);
    }
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(res => { releaseLock = res; });
    this.entitlementLocks.set(entitlementId, lockPromise);

    try {
      return await operation();
    } finally {
      this.entitlementLocks.delete(entitlementId);
      releaseLock!();
    }
  }

  /**
   * SERIALIZED CONCURRENT WRITE QUEUE:
   * Prevents simultaneous writes from corrupting or colliding on disk.
   *
   * ARCHITECTURAL LIMITATION NOTICE:
   * This embedded JSON file store provides serialized persistence for a single Node.js runtime process.
   * It is NOT an ACID production database. Multi-process clusters, distributed microservices, or
   * horizontal scale deployments require PostgreSQL with SERIALIZABLE isolation or Redis Redlock distributed locks.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  public async persistToDiskAsync(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await this.atomicWriteFile();
    }).catch(err => {
      console.error('[CRITICAL] Concurrent disk write queue error:', err);
    });
    return this.writeQueue;
  }

  private saveToDisk(): void {
    const data = {
      contracts: this.contracts,
      incidents: this.incidents,
      customers: this.customers,
      entitlements: this.entitlements,
      refunds: this.refunds,
      serviceCredits: this.serviceCredits,
      genuineCaptures: this.genuineCaptures,
      processedWebhookEventIds: this.processedWebhookEventIds,
      auditEvents: this.auditEvents,
      lastAuditHash: this.lastAuditHash
    };

    const uniqueTmp = `${DATA_FILE_PATH}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(uniqueTmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(uniqueTmp, DATA_FILE_PATH);
    } catch (err) {
      // In case of momentary Windows file locking, retry
      try {
        if (fs.existsSync(uniqueTmp)) {
          fs.renameSync(uniqueTmp, DATA_FILE_PATH);
        }
      } catch (retryErr) {
        console.error('Failed to persist store to disk:', retryErr);
        try { if (fs.existsSync(uniqueTmp)) fs.unlinkSync(uniqueTmp); } catch {}
      }
    }
  }

  private async atomicWriteFile(): Promise<void> {
    const data = {
      contracts: this.contracts,
      incidents: this.incidents,
      customers: this.customers,
      entitlements: this.entitlements,
      refunds: this.refunds,
      serviceCredits: this.serviceCredits,
      genuineCaptures: this.genuineCaptures,
      processedWebhookEventIds: this.processedWebhookEventIds,
      auditEvents: this.auditEvents,
      lastAuditHash: this.lastAuditHash
    };

    const json = JSON.stringify(data, null, 2);
    const uniqueTmp = `${DATA_FILE_PATH}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;

    try {
      await fs.promises.writeFile(uniqueTmp, json, 'utf-8');

      // Retry rename on Windows if file handle is momentarily held
      let attempts = 5;
      while (attempts > 0) {
        try {
          await fs.promises.rename(uniqueTmp, DATA_FILE_PATH);
          break;
        } catch (err: any) {
          attempts--;
          if (attempts === 0) {
            try { await fs.promises.unlink(uniqueTmp); } catch {}
            throw err;
          }
          await new Promise(r => setTimeout(r, 15 + Math.random() * 20));
        }
      }
    } catch (err: any) {
      console.error('[STORE] Atomic write failed:', err);
      try { if (fs.existsSync(uniqueTmp)) fs.unlinkSync(uniqueTmp); } catch {}
    }
  }

  private loadFromDisk(): boolean {
    try {
      const targetPath = fs.existsSync(DATA_FILE_PATH)
        ? DATA_FILE_PATH
        : (fs.existsSync(DEMO_DATA_FILE_PATH) ? DEMO_DATA_FILE_PATH : null);

      if (targetPath) {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        const data = JSON.parse(raw);
        this.contracts = (data.contracts || []).map((c: Contract) => ({
          ...c,
          isDemo: c.isDemo !== undefined ? c.isDemo : /^contract-0[1-4]$/.test(c.id)
        }));
        this.incidents = data.incidents || [];
        this.customers = data.customers || [];
        this.entitlements = data.entitlements || [];
        this.refunds = data.refunds || [];
        this.serviceCredits = data.serviceCredits || [];
        this.genuineCaptures = data.genuineCaptures || [];
        // Deterministically reconcile customers with completed genuine captures on every disk load
        for (const cust of this.customers) {
          const custCaptures = this.genuineCaptures.filter(c => c.customerId === cust.id && c.status === 'COMPLETED');
          if (custCaptures.length > 0) {
            const uniqueMap = new Map<string, GenuineCaptureRecord>();
            for (const cap of custCaptures) {
              if (cap.paypalCaptureId && !uniqueMap.has(cap.paypalCaptureId)) {
                uniqueMap.set(cap.paypalCaptureId, cap);
              }
            }
            const deposits = Array.from(uniqueMap.values()).reduce((sum, c) => sum + (c.amount || 0), 0);
            const refunds = this.refunds
              .filter(r => r.customerId === cust.id && r.status === 'completed' && r.liveSandboxExecution === true && uniqueMap.has(r.paypalCaptureId))
              .reduce((sum, r) => sum + (r.refundAmount || 0), 0);

            const BASE_RESERVES: Record<string, number> = {
              'cust-101': 10000,
              'cust-102': 14500,
              'cust-103': 9200,
              'cust-104': 17600,
              'cust-105': 11000,
            };
            const baseReserve = BASE_RESERVES[cust.id] ?? cust.monthlySpend ?? 10000;
            cust.refundableBalance = Number((baseReserve + deposits - refunds).toFixed(2));

            const sorted = Array.from(uniqueMap.values()).sort((a, b) => 
              new Date(a.capturedAt || 0).getTime() - new Date(b.capturedAt || 0).getTime()
            );
            if (sorted.length > 0) {
              const latest = sorted[sorted.length - 1];
              cust.paypalCaptureId = latest.paypalCaptureId;
              cust.currency = latest.currency || 'USD';
            }
          }
        }
        this.processedWebhookEventIds = data.processedWebhookEventIds || [];
        this.auditEvents = data.auditEvents || [];
        this.lastAuditHash = data.lastAuditHash || '0000000000000000000000000000000000000000000000000000000000000000';
        return true;
      }
    } catch (err) {
      console.warn('Could not read store from disk, falling back to seed data:', err);
    }
    return false;
  }

  public syncFromDisk(): boolean {
    return this.loadFromDisk();
  }

  private seedInitialData() {
    // 1. Customers with real capture IDs and refundable balances
    this.customers = [
      {
        id: 'cust-101',
        name: 'Apex Fintech Solutions Inc.',
        domain: 'apexfintech.io',
        plan: 'Enterprise Tier 1',
        monthlySpend: 14500,
        billingEmail: 'billing@apexfintech.io',
        paypalEmail: 'payouts@apexfintech.io',
        paypalCaptureId: '2GG10928AB778901C',
        refundableBalance: 14500,
        slaContractId: 'contract-01',
        contractNumber: 'SLA-2026-AF88',
        region: 'US-East (N. Virginia)',
        paymentMethod: 'PayPal Refund'
      },
      {
        id: 'cust-102',
        name: 'Nexus Logistics AI Corp',
        domain: 'nexuslogistics.ai',
        plan: 'Enterprise Tier 2',
        monthlySpend: 9200,
        billingEmail: 'finance@nexuslogistics.ai',
        paypalEmail: 'ap@nexuslogistics.ai',
        paypalCaptureId: '4KK88192BC112233D',
        refundableBalance: 9200,
        slaContractId: 'contract-02',
        contractNumber: 'SLA-2026-NL41',
        region: 'US-West (Oregon)',
        paymentMethod: 'PayPal Refund'
      },
      {
        id: 'cust-103',
        name: 'QuantVanguard Asset Partners',
        domain: 'quantvanguard.com',
        plan: 'Enterprise Tier 1',
        monthlySpend: 22000,
        billingEmail: 'treasury@quantvanguard.com',
        paypalEmail: 'disbursements@quantvanguard.com',
        paypalCaptureId: '9XL3819280911A',
        refundableBalance: 17600, // $4,400 already refunded
        slaContractId: 'contract-03',
        contractNumber: 'SLA-2026-QV19',
        region: 'EU-West (Frankfurt)',
        paymentMethod: 'PayPal Refund'
      },
      {
        id: 'cust-104',
        name: 'HyperScale Health Systems',
        domain: 'hyperscalehealth.org',
        plan: 'Growth',
        monthlySpend: 4800,
        billingEmail: 'accounts@hyperscalehealth.org',
        paypalEmail: 'finance@hyperscalehealth.org',
        slaContractId: 'contract-04',
        contractNumber: 'SLA-2026-HH09',
        region: 'US-East (Ohio)',
        paymentMethod: 'Direct Invoicing Credit'
      },
      {
        id: 'cust-105',
        name: 'BioSynthetica Therapeutics',
        domain: 'biosynthetica.com',
        plan: 'Enterprise Tier 2',
        monthlySpend: 11000,
        billingEmail: 'ops-billing@biosynthetica.com',
        paypalEmail: 'treasury@biosynthetica.com',
        paypalCaptureId: '7MM55122CD990011E',
        refundableBalance: 11000,
        slaContractId: 'contract-01',
        contractNumber: 'SLA-2026-AF88',
        region: 'US-East (N. Virginia)',
        paymentMethod: 'PayPal Refund'
      }
    ];

    // 2. Contracts with mathematically sound compensation tiers
    this.contracts = [
      {
        id: 'contract-01',
        contractNumber: 'SLA-2026-AF88',
        customerId: 'cust-101',
        customerName: 'Apex Fintech Solutions Inc.',
        slaName: 'Enterprise Mission-Critical Gold SLA',
        uptimeTarget: 99.95,
        measurementPeriod: 'Monthly',
        claimDeadlineDays: 30,
        compensationTiers: [
          { uptimeThreshold: 99.95, creditPercentage: 0, minUptime: 99.95, maxUptime: 100, label: '≥ 99.95% Target Met (0% Credit)' },
          { uptimeThreshold: 99.95, creditPercentage: 10, minUptime: 99.50, maxUptime: 99.95, label: '99.50% - 99.94% (10% Credit)' },
          { uptimeThreshold: 99.50, creditPercentage: 25, minUptime: 99.00, maxUptime: 99.50, label: '99.00% - 99.49% (25% Credit)' },
          { uptimeThreshold: 99.00, creditPercentage: 50, minUptime: 0, maxUptime: 99.00, label: '< 99.00% Severe Outage (50% Credit)' },
        ],
        maintenanceExclusions: [
          'Pre-announced maintenance notified 5 days prior (Sundays 02:00-04:00 UTC)',
          'Force Majeure & Tier-1 upstream transit provider fiber cuts',
          'Customer unauthorized payload DDOS testing'
        ],
        maxCompensationPercent: 50,
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-12-31',
        status: 'active',
        extractedConfidence: 0.98,
        uploadedAt: '2026-01-15T10:30:00Z',
        fileName: 'Apex_Fintech_Master_SLA_2026.pdf',
        fileSize: '2.4 MB',
        clauses: [
          {
            id: 'clause-101',
            section: 'Section 4.1',
            title: 'Monthly Service Availability Covenant',
            content: 'Provider warrants monthly availability of not less than 99.95% for core transaction routing endpoints across primary regions.',
            confidence: 0.99,
            status: 'human_verified',
            verifiedBy: 'Elena Rostova (Compliance Lead)',
            verifiedAt: '2026-01-16T14:20:00Z'
          },
          {
            id: 'clause-102',
            section: 'Section 4.3',
            title: 'Tiered Service Credit Remedy Schedule',
            content: 'If monthly availability falls between 99.50% and 99.94%, Customer is entitled to a 10% credit. If availability falls between 99.00% and 99.49%, Provider shall disburse a 25% credit.',
            confidence: 0.97,
            status: 'human_verified',
            verifiedBy: 'David Chen (Finance Director)',
            verifiedAt: '2026-01-16T14:22:00Z'
          },
          {
            id: 'clause-103',
            section: 'Section 4.7',
            title: 'Remedy Disbursement via Electronic Payment Reversal',
            content: 'Customer holds the discretionary election to receive approved SLA remedies either as a billing credit on the next invoice or via automated PayPal refund against original captured subscription fees.',
            confidence: 0.96,
            status: 'human_verified',
            verifiedBy: 'David Chen (Finance Director)',
            verifiedAt: '2026-01-16T14:25:00Z'
          }
        ]
      },
      {
        id: 'contract-02',
        contractNumber: 'SLA-2026-NL41',
        customerId: 'cust-102',
        customerName: 'Nexus Logistics AI Corp',
        slaName: 'Enterprise Standard Platform SLA',
        uptimeTarget: 99.90,
        measurementPeriod: 'Monthly',
        claimDeadlineDays: 45,
        compensationTiers: [
          { uptimeThreshold: 99.90, creditPercentage: 0, minUptime: 99.90, maxUptime: 100, label: '≥ 99.90% Target Met' },
          { uptimeThreshold: 99.90, creditPercentage: 15, minUptime: 99.00, maxUptime: 99.90, label: '99.00% - 99.89% (15% Credit)' },
          { uptimeThreshold: 99.00, creditPercentage: 30, minUptime: 0, maxUptime: 99.00, label: '< 99.00% (30% Credit)' },
        ],
        maintenanceExclusions: ['Pre-announced database engine minor patch updates'],
        maxCompensationPercent: 30,
        effectiveStartDate: '2026-02-01',
        effectiveEndDate: '2027-01-31',
        status: 'active',
        extractedConfidence: 0.94,
        uploadedAt: '2026-02-05T09:15:00Z',
        fileName: 'Nexus_Logistics_SLA_Execution_Final.pdf',
        fileSize: '1.8 MB',
        clauses: [
          {
            id: 'clause-201',
            section: 'Clause 3.1',
            title: 'Route Optimization Engine Availability',
            content: 'Provider warrants 99.90% uptime during standard monthly calendar billing intervals.',
            confidence: 0.96,
            status: 'human_verified',
            verifiedBy: 'Sarah Jenkins (Ops Manager)',
            verifiedAt: '2026-02-06T11:00:00Z'
          }
        ]
      },
      {
        id: 'contract-03',
        contractNumber: 'SLA-2026-QV19',
        customerId: 'cust-103',
        customerName: 'QuantVanguard Asset Partners',
        slaName: 'Ultra-Low Latency High-Frequency SLA',
        uptimeTarget: 99.99,
        measurementPeriod: 'Monthly',
        claimDeadlineDays: 15,
        compensationTiers: [
          { uptimeThreshold: 99.99, creditPercentage: 0, label: '≥ 99.99% Ultra Target' },
          { uptimeThreshold: 99.99, creditPercentage: 20, label: '99.90% - 99.98% (20% Credit)' },
          { uptimeThreshold: 99.90, creditPercentage: 40, label: '99.50% - 99.89% (40% Credit)' },
          { uptimeThreshold: 99.50, creditPercentage: 50, label: '< 99.50% Critical Breach (50% Credit)' }
        ],
        maintenanceExclusions: ['Emergency kernel security patches with CVE advisory'],
        maxCompensationPercent: 50,
        effectiveStartDate: '2026-01-01',
        effectiveEndDate: '2026-12-31',
        status: 'active',
        extractedConfidence: 0.99,
        uploadedAt: '2026-01-10T16:00:00Z',
        fileName: 'QuantVanguard_Execution_Tier1_SLA.pdf',
        fileSize: '3.1 MB',
        clauses: [
          {
            id: 'clause-301',
            section: 'Paragraph 2',
            title: 'Execution Gateway SLA',
            content: 'Provider guarantees 99.99% availability of execution endpoints. Outages exceeding 4.38 minutes in any calendar month trigger remediation.',
            confidence: 0.99,
            status: 'human_verified',
            verifiedBy: 'Marcus Sterling (Legal Director)',
            verifiedAt: '2026-01-12T09:30:00Z'
          }
        ]
      },
      {
        id: 'contract-04',
        contractNumber: 'SLA-2026-HH09',
        customerId: 'cust-104',
        customerName: 'HyperScale Health Systems',
        slaName: 'Healthcare HIPAA Resilient SLA',
        uptimeTarget: 99.90,
        measurementPeriod: 'Monthly',
        claimDeadlineDays: 60,
        compensationTiers: [
          { uptimeThreshold: 99.90, creditPercentage: 0, label: '≥ 99.90% Target Met' },
          { uptimeThreshold: 99.90, creditPercentage: 10, label: '99.00% - 99.89% (10% Credit)' },
          { uptimeThreshold: 99.00, creditPercentage: 20, label: '< 99.00% (20% Credit)' }
        ],
        maintenanceExclusions: ['Scheduled Sunday maintenance windows (02:00-04:00 UTC)'],
        maxCompensationPercent: 20,
        effectiveStartDate: '2026-03-01',
        effectiveEndDate: '2027-02-28',
        status: 'requires_review',
        extractedConfidence: 0.82,
        uploadedAt: '2026-03-02T11:45:00Z',
        fileName: 'HyperScale_Health_Addendum.pdf',
        fileSize: '1.2 MB',
        clauses: [
          {
            id: 'clause-401',
            section: 'Schedule A',
            title: 'Protected Records Availability',
            content: 'EHR ingestion pipelines shall remain operational 99.90% of the standard billing cycle.',
            confidence: 0.85,
            status: 'requires_review',
            notes: 'Pending execution of signature addendum.'
          }
        ]
      }
    ];

    // 3. Incidents with accurate timestamps and duration
    this.incidents = [
      {
        id: 'inc-901',
        incidentNumber: 'INC-2026-0314',
        service: 'Core Transaction Routing & Payment Webhook Ingestion',
        severity: 'P1 - Critical',
        status: 'resolved',
        summary: 'Database connection pool deadlock on primary replica causing 504 Gateway Timeouts for payment webhooks.',
        rootCause: 'Deadlock cascade following automated index optimization job on transactions_ledger table during peak processing window.',
        startedAt: '2026-11-03T14:12:00Z',
        detectedAt: '2026-11-03T14:14:30Z',
        mitigatedAt: '2026-11-03T14:48:00Z',
        resolvedAt: '2026-11-03T14:50:00Z',
        durationMinutes: 38,
        affectedRegions: ['us-east-1', 'us-east-2'],
        affectedCustomerIds: ['cust-101', 'cust-105'],
        affectedCustomersCount: 2,
        slaBreached: true,
        slaImpactAnalysis: 'Outage of 38 minutes reduces November availability to 99.912% for US-East tenants, directly breaching the 99.95% Gold SLA target. Activates Tier 1 compensation of 10% for affected accounts.',
        telemetry: [
          { time: '14:00', availability: 100.0, latencyMs: 42, errorRate: 0.01 },
          { time: '14:15', availability: 62.4, latencyMs: 3800, errorRate: 48.2 },
          { time: '14:35', availability: 48.7, latencyMs: 5400, errorRate: 59.3 },
          { time: '14:50', availability: 100.0, latencyMs: 41, errorRate: 0.01 }
        ],
        timeline: [
          {
            id: 'time-01',
            timestamp: '2026-11-03T14:12:00Z',
            title: 'Synthetic Canary Trigger',
            description: 'Canary probe failed HTTP 200 health check on /v2/ledger/charge.',
            phase: 'detection',
            actor: 'Prometheus Canary Probe'
          },
          {
            id: 'time-02',
            timestamp: '2026-11-03T14:50:00Z',
            title: 'Incident Resolved',
            description: 'Connection pool normalized. Backlog drained cleanly.',
            phase: 'resolved',
            actor: 'SRE On-Call'
          }
        ]
      },
      {
        id: 'inc-902',
        incidentNumber: 'INC-2026-0308',
        service: 'Route Optimization Engine & Fleet Telemetry Websockets',
        severity: 'P2 - Major',
        status: 'resolved',
        summary: 'Elevated latency and intermittent HTTP 502 Bad Gateway responses on route dispatch endpoints.',
        rootCause: 'BGP route flapping at intermediate upstream transit provider in Portland IX.',
        startedAt: '2026-10-28T08:20:00Z',
        detectedAt: '2026-10-28T08:23:00Z',
        mitigatedAt: '2026-10-28T09:20:00Z',
        resolvedAt: '2026-10-28T09:20:00Z',
        durationMinutes: 60,
        affectedRegions: ['us-west-2'],
        affectedCustomerIds: ['cust-102'],
        affectedCustomersCount: 1,
        slaBreached: true,
        slaImpactAnalysis: 'Outage of 60 minutes dropped October monthly uptime to 99.866%, breaching Nexus Logistics contract uptime threshold of 99.90%. Activates 15% tier credit.',
        telemetry: [],
        timeline: []
      },
      {
        id: 'inc-903',
        incidentNumber: 'INC-2026-0294',
        service: 'Audit Log Archival API',
        severity: 'P3 - Minor',
        status: 'resolved',
        summary: 'Read replica replication lag during pre-notified Sunday maintenance window.',
        rootCause: 'Disk I/O saturation on non-production cold storage tier.',
        startedAt: '2026-10-18T02:30:00Z', // Sunday 02:30 UTC
        detectedAt: '2026-10-18T02:35:00Z',
        mitigatedAt: '2026-10-18T03:00:00Z',
        resolvedAt: '2026-10-18T03:00:00Z',
        durationMinutes: 30,
        affectedRegions: ['us-east-1'],
        affectedCustomerIds: ['cust-104'],
        affectedCustomersCount: 1,
        slaBreached: false,
        isPlannedMaintenance: true,
        maintenanceWindow: 'Sunday 02:00-04:00 UTC',
        slaImpactAnalysis: 'Maintenance occurred during pre-notified Sunday scheduled window (Clause 5.1). Excluded from SLA breach liability under contractual terms.',
        telemetry: [],
        timeline: []
      }
    ];

    // 4. Initial Entitlements with mathematically verified values
    // Note: 38 minutes downtime in 30 days (Nov) = 99.912% uptime. For 99.95% target, 99.912% falls into Tier 1 (10% credit = $1,450.00).
    this.entitlements = [
      {
        id: 'ent-801',
        caseNumber: 'ENT-202611-1011',
        customerId: 'cust-101',
        customerName: 'Apex Fintech Solutions Inc.',
        customerPlan: 'Enterprise Tier 1',
        contractId: 'contract-01',
        contractNumber: 'SLA-2026-AF88',
        incidentId: 'inc-901',
        incidentNumber: 'INC-2026-0314',
        incidentSummary: 'Database connection pool deadlock on Core Transaction API (38 min outage)',
        measuredUptime: 99.912,
        eligibleCredit: 1450.00,
        status: 'pending_approval',
        billingPeriodKey: '2026-11',
        idempotencyKey: 'cust-101:2026-11:inc-901',
        payoutMethod: 'PayPal Refund',
        evidenceSummary: 'Incident INC-2026-0314 caused 38 minutes of verified downtime in US-East-1. Customer November monthly availability measured at 99.912% vs 99.95% target (0.038% breach). Contract Tier 1 mandates 10% credit ($14,500 base fee × 10% = $1,450.00). Direct PayPal capture refund authorized against capture 2GG10928AB778901C per Clause 4.7.',
        telemetrySource: 'Datadog Synthetic Canary Monitor #canary-us-east-tx-01 & Aurora PostgreSQL metrics',
        calculation: {
          contractedUptime: 99.95,
          measuredUptime: 99.912,
          outageMinutes: 38,
          totalPeriodMinutes: 43200,
          breachMagnitude: 0.038,
          applicableTier: {
            uptimeThreshold: 99.95,
            creditPercentage: 10,
            label: '99.50% - 99.94% (10% Credit)'
          },
          formula: 'Monthly Base Fee ($14,500.00) × 10% SLA Credit Tier',
          baseAmount: 14500.00,
          creditAmount: 1450.00,
          calculatedAt: '2026-11-03T15:30:00Z',
          applicableClauseId: 'clause-102',
          applicableClauseTitle: 'Section 4.3 Service Credit Tier Escalation',
          cumulativePeriodDowntimeMinutes: 38,
          cumulativePeriodCredits: 1450.00,
          measurementPeriodScope: 'Monthly (2026-11)'
        },
        approvalHistory: [
          {
            requestedAt: '2026-11-03T15:35:00Z',
            notes: 'Automated calculation by PromiseBack SLA Engine v3.0.'
          }
        ]
      },
      {
        id: 'ent-802',
        caseNumber: 'ENT-202610-1012',
        customerId: 'cust-102',
        customerName: 'Nexus Logistics AI Corp',
        customerPlan: 'Enterprise Tier 2',
        contractId: 'contract-02',
        contractNumber: 'SLA-2026-NL41',
        incidentId: 'inc-902',
        incidentNumber: 'INC-2026-0308',
        incidentSummary: 'BGP edge routing flap in Oregon dispatch gateway (60 min degradation)',
        measuredUptime: 99.866,
        eligibleCredit: 1380.00,
        status: 'approved',
        billingPeriodKey: '2026-10',
        idempotencyKey: 'cust-102:2026-10:inc-902',
        payoutMethod: 'PayPal Refund',
        evidenceSummary: 'Incident INC-2026-0308 caused 60 minutes downtime in October (44,640 min period). Measured availability: 99.866% vs 99.90% target. Tier 1 applies (15% credit = $1,380.00). Approved by Finance Director for PayPal capture refund.',
        telemetrySource: 'Cloudflare Edge Analytics & Route Dispatch Latency Monitor #rd-west2',
        calculation: {
          contractedUptime: 99.90,
          measuredUptime: 99.866,
          outageMinutes: 60,
          totalPeriodMinutes: 44640,
          breachMagnitude: 0.034,
          applicableTier: {
            uptimeThreshold: 99.90,
            creditPercentage: 15,
            label: '99.00% - 99.89% (15% Credit)'
          },
          formula: 'Monthly Base Fee ($9,200.00) × 15% SLA Credit Tier',
          baseAmount: 9200.00,
          creditAmount: 1380.00,
          calculatedAt: '2026-10-28T09:45:00Z',
          applicableClauseId: 'clause-201',
          applicableClauseTitle: 'Clause 3.1 Availability Target',
          cumulativePeriodDowntimeMinutes: 60,
          cumulativePeriodCredits: 1380.00,
          measurementPeriodScope: 'Monthly (2026-10)'
        },
        approvalHistory: [
          {
            requestedAt: '2026-10-28T09:50:00Z',
            reviewedBy: 'David Chen (Finance Director)',
            reviewedAt: '2026-10-28T14:10:00Z',
            decision: 'approved',
            notes: 'SLA breach confirmed. Authorized for PayPal Sandbox capture refund.'
          }
        ]
      },
      {
        id: 'ent-805',
        caseNumber: 'ENT-202611-1015',
        customerId: 'cust-103',
        customerName: 'QuantVanguard Asset Partners',
        customerPlan: 'Enterprise Tier 1',
        contractId: 'contract-03',
        contractNumber: 'SLA-2026-QV19',
        incidentId: 'inc-901',
        incidentNumber: 'INC-2026-0314',
        incidentSummary: 'Gateway jitter on Frankfurt transit edge (12 min downtime)',
        measuredUptime: 99.972,
        eligibleCredit: 4400.00,
        status: 'compensated',
        billingPeriodKey: '2026-11',
        idempotencyKey: 'cust-103:2026-11:inc-901',
        payoutMethod: 'PayPal Refund',
        payoutReferenceId: 'REF-2026-PAYPAL-991',
        evidenceSummary: 'QuantVanguard Ultra SLA (99.99% target) breached due to 12 minutes downtime in November (99.972% uptime). Tier 2 applies (20% credit = $4,400.00). Executed against capture 9XL3819280911A.',
        telemetrySource: 'Equinix FR2 Direct Telemetry Probe',
        calculation: {
          contractedUptime: 99.99,
          measuredUptime: 99.972,
          outageMinutes: 12,
          totalPeriodMinutes: 43200,
          breachMagnitude: 0.018,
          applicableTier: {
            uptimeThreshold: 99.99,
            creditPercentage: 20,
            label: '99.90% - 99.98% (20% Credit)'
          },
          formula: 'Monthly Base Fee ($22,000.00) × 20% SLA Credit Tier',
          baseAmount: 22000.00,
          creditAmount: 4400.00,
          calculatedAt: '2026-11-03T16:00:00Z',
          applicableClauseId: 'clause-301',
          applicableClauseTitle: 'Paragraph 2 Execution Gateway SLA'
        },
        approvalHistory: []
      }
    ];

    // 5. Refunds tracking actual captures
    this.refunds = [
      {
        id: 'ref-701',
        refundNumber: 'REF-2026-PAYPAL-991',
        entitlementId: 'ent-805',
        customerId: 'cust-103',
        customerName: 'QuantVanguard Asset Partners',
        paypalAccount: 'disbursements@quantvanguard.com',
        paypalCaptureId: '9XL3819280911A',
        originalPaymentId: 'PAYPAL-SUB-2026-QV',
        refundAmount: 4400.00,
        currency: 'USD',
        paypalRefundId: 'REFUND-9XL-4400',
        idempotencyRequestId: 'idemp-req-771892',
        feeAmount: 0.00,
        status: 'completed',
        createdAt: '2026-11-03T16:30:00Z',
        executedAt: '2026-11-03T16:32:15Z',
        liveSandboxExecution: false
      }
    ];

    // Seed Audit Log
    this.recordAuditEventSync({
      category: 'SYSTEM',
      eventType: 'SYSTEM_INITIALIZED',
      description: 'PromiseBack SLA Recovery Platform ledger initialized with SHA-256 cryptographic chaining.',
      actor: { type: 'SYSTEM_AI', name: 'PromiseBack Core Engine' },
      entityId: 'SYS-ROOT',
      entityType: 'Contract',
      timestamp: '2026-01-01T00:00:00Z'
    });
  }

  private recordAuditEventSync(params: {
    category: AuditEvent['category'];
    eventType: string;
    description: string;
    actor: AuditEvent['actor'];
    entityId: string;
    entityType: AuditEvent['entityType'];
    timestamp?: string;
    metadata?: Record<string, any>;
  }): AuditEvent {
    const timestamp = params.timestamp || new Date().toISOString();
    const id = `audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const previousHash = this.lastAuditHash;
    const content = `${timestamp}|${params.category}|${params.eventType}|${params.entityId}|${params.description}|${previousHash}`;
    const hash = sha256(content);

    const event: AuditEvent = {
      id,
      timestamp,
      category: params.category,
      eventType: params.eventType,
      description: params.description,
      actor: params.actor,
      entityId: params.entityId,
      entityType: params.entityType,
      hash,
      previousHash,
      metadata: params.metadata
    };

    this.lastAuditHash = hash;
    this.auditEvents.unshift(event);
    this.saveToDisk();
    return event;
  }

  // Public Query Methods
  public getContracts(): Contract[] {
    return this.contracts;
  }

  public getContractById(id: string): Contract | undefined {
    return this.contracts.find(c => c.id === id);
  }

  public addContract(contract: Contract, actorName = 'Compliance Officer'): Contract {
    if (contract.isDemo === undefined) {
      contract.isDemo = false;
    }
    this.contracts.unshift(contract);
    this.recordAuditEventSync({
      category: 'CONTRACT',
      eventType: 'CONTRACT_UPLOADED',
      description: `Contract "${contract.fileName}" (${contract.slaName}) uploaded and parsed.`,
      actor: { type: 'HUMAN', name: actorName },
      entityId: contract.id,
      entityType: 'Contract',
      metadata: { contractNumber: contract.contractNumber, uptimeTarget: contract.uptimeTarget }
    });
    this.saveToDisk();
    return contract;
  }

  public updateClauseVerification(contractId: string, clauseId: string, status: VerificationStatus, verifiedBy: string, notes?: string): Contract | null {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) return null;
    const clause = contract.clauses.find(cl => cl.id === clauseId);
    if (!clause) return null;

    clause.status = status;
    clause.verifiedBy = verifiedBy;
    clause.verifiedAt = new Date().toISOString();
    if (notes) clause.notes = notes;

    if (status === 'requires_review' || status === 'unverified') {
      contract.status = 'requires_review';
    } else {
      const allVerified = contract.clauses.every(cl => cl.status === 'human_verified' || (cl.status as string) === 'verified');
      if (allVerified) {
        contract.status = 'active';
      }
    }

    this.recordAuditEventSync({
      category: 'CONTRACT',
      eventType: 'CLAUSE_VERIFICATION_UPDATED',
      description: `Clause "${clause.title}" in ${contract.contractNumber} marked as ${status} by ${verifiedBy}.`,
      actor: { type: 'HUMAN', name: verifiedBy },
      entityId: contract.id,
      entityType: 'Contract',
      metadata: { clauseId, status, notes }
    });

    this.saveToDisk();
    return contract;
  }

  public getIncidents(): Incident[] {
    return this.incidents;
  }

  public getIncidentById(id: string): Incident | undefined {
    return this.incidents.find(i => i.id === id);
  }

  public addIncident(incident: Incident): { incident: Incident; createdEntitlements: Entitlement[] } {
    const existing = this.incidents.find(i => i.id === incident.id || (incident.incidentNumber && i.incidentNumber === incident.incidentNumber));
    if (existing) {
      throw new Error(`DUPLICATE_INCIDENT: Incident ${incident.incidentNumber || incident.id} has already been ingested into the system.`);
    }

    this.incidents.unshift(incident);
    this.recordAuditEventSync({
      category: 'INCIDENT',
      eventType: 'INCIDENT_INGESTED',
      description: `Incident ${incident.incidentNumber} (${incident.severity}) on ${incident.service} ingested.`,
      actor: { type: 'SYSTEM_AI', name: 'Incident Ingestion Gateway' },
      entityId: incident.id,
      entityType: 'Incident'
    });

    // Run entitlement calculation engine
    const createdEntitlements = this.calculateEntitlementsForIncident(incident);
    this.saveToDisk();
    return { incident, createdEntitlements };
  }

  public getCustomers(): Customer[] {
    return this.customers;
  }

  public getCustomerById(id: string): Customer | undefined {
    return this.customers.find(c => c.id === id);
  }

  public addCustomer(customer: Customer): Customer {
    this.customers.push(customer);
    this.saveToDisk();
    return customer;
  }

  /**
   * Deterministic financial reconciliation:
   * refundableBalance = originalContractualReserve + sum(unique completed genuine captures) - sum(genuinely executed completed refunds)
   * Excludes mocked refund events and simulated webhook test records from deductions.
   * Ensures customer.paypalCaptureId points to the latest completed genuine capture.
   * Appends an immutable LEDGER_BALANCE_RECONCILED audit event if balance changes.
   */
  public reconcileCustomerLedger(customerId = 'cust-101', recordAudit = true): {
    customerId: string;
    previousBalance: number;
    reconciledBalance: number;
    baseReserve: number;
    genuineDepositsTotal: number;
    genuineRefundsTotal: number;
    latestCaptureId: string | null;
  } {
    const customer = this.customers.find(c => c.id === customerId);
    if (!customer) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer ${customerId} does not exist.`);
    }

    const BASE_RESERVES: Record<string, number> = {
      'cust-101': 10000,
      'cust-102': 14500,
      'cust-103': 9200,
      'cust-104': 17600,
      'cust-105': 11000,
    };
    const baseReserve = BASE_RESERVES[customerId] ?? customer.monthlySpend ?? 10000;

    // Deduplicate unique completed genuine captures
    const uniqueCapturesMap = new Map<string, GenuineCaptureRecord>();
    for (const cap of this.genuineCaptures) {
      if (cap.customerId === customerId && cap.status === 'COMPLETED' && cap.paypalCaptureId) {
        if (!uniqueCapturesMap.has(cap.paypalCaptureId)) {
          uniqueCapturesMap.set(cap.paypalCaptureId, cap);
        }
      }
    }

    const genuineDepositsTotal = Array.from(uniqueCapturesMap.values()).reduce((sum, c) => sum + (c.amount || 0), 0);

    // Sum genuinely executed completed refunds (must have liveSandboxExecution=true and match a genuine capture)
    const genuineRefundsTotal = this.refunds
      .filter(r => r.customerId === customerId &&
                   r.status === 'completed' &&
                   r.liveSandboxExecution === true &&
                   uniqueCapturesMap.has(r.paypalCaptureId))
      .reduce((sum, r) => sum + (r.refundAmount || 0), 0);

    const previousBalance = customer.refundableBalance ?? baseReserve;
    const reconciledBalance = Number((baseReserve + genuineDepositsTotal - genuineRefundsTotal).toFixed(2));
    customer.refundableBalance = reconciledBalance;

    // Ensure customer points to the newest capture
    const sortedCaptures = Array.from(uniqueCapturesMap.values()).sort((a, b) => 
      new Date(a.capturedAt || 0).getTime() - new Date(b.capturedAt || 0).getTime()
    );
    if (sortedCaptures.length > 0) {
      const latest = sortedCaptures[sortedCaptures.length - 1];
      customer.paypalCaptureId = latest.paypalCaptureId;
      customer.currency = latest.currency || 'USD';
    }

    if (recordAudit && previousBalance !== reconciledBalance) {
      this.recordAuditEventSync({
        category: 'FINANCIAL',
        eventType: 'LEDGER_BALANCE_RECONCILED',
        description: `Reconciled customer ${customer.name} (${customer.id}) balance from $${previousBalance.toFixed(2)} to $${reconciledBalance.toFixed(2)} based on ${uniqueCapturesMap.size} genuine PayPal Sandbox captures ($${genuineDepositsTotal.toFixed(2)}) and $${genuineRefundsTotal.toFixed(2)} genuine refunds.`,
        actor: { type: 'SYSTEM', name: 'Financial Ledger Reconciliation Engine' },
        entityId: customer.id,
        entityType: 'Customer',
        metadata: {
          customerId: customer.id,
          previousBalance,
          reconciledBalance,
          baseReserve,
          genuineDepositsTotal,
          genuineRefundsTotal,
          capturesCount: uniqueCapturesMap.size,
          latestCaptureId: customer.paypalCaptureId
        }
      });
    }

    this.saveToDisk();
    return {
      customerId: customer.id,
      previousBalance,
      reconciledBalance,
      baseReserve,
      genuineDepositsTotal,
      genuineRefundsTotal,
      latestCaptureId: customer.paypalCaptureId || null
    };
  }

  public resetToSeed(): void {
    const existingCaptures = [...this.genuineCaptures];
    this.seedInitialData();
    if (existingCaptures.length > 0) {
      this.genuineCaptures = existingCaptures;
      const customerIds = Array.from(new Set(existingCaptures.map(c => c.customerId)));
      for (const cid of customerIds) {
        this.reconcileCustomerLedger(cid, false);
      }
    }
    this.saveToDisk();
  }

  public getEntitlements(): Entitlement[] {
    return this.entitlements;
  }

  public getEntitlementById(id: string): Entitlement | undefined {
    return this.entitlements.find(e => e.id === id);
  }

  /**
   * Calculates entitlements for all affected customers of an incident.
   * Enforces idempotency (no duplicate claims for same customer/incident),
   * calendar-based measurement periods, cumulative period downtime, and contractual caps.
   */
  public calculateEntitlementsForIncident(incident: Incident): Entitlement[] {
    const newEntitlements: Entitlement[] = [];

    for (const customerId of incident.affectedCustomerIds) {
      const customer = this.customers.find(c => c.id === customerId);
      if (!customer) continue;
      const contract = this.contracts.find(c => c.id === customer.slaContractId);
      if (!contract) continue;

      const incidentDate = new Date(incident.startedAt);
      const year = incidentDate.getUTCFullYear();
      const month = incidentDate.getUTCMonth();
      const quarter = Math.floor(month / 3) + 1;
      const period = getMeasurementPeriodMinutes(contract.measurementPeriod, year, contract.measurementPeriod === 'Quarterly' ? quarter : month);

      const idempotencyKey = `${customer.id}:${period.periodKey}:${incident.id}`;

      // Check if entitlement already exists (prevent duplicate claims)
      const existing = this.entitlements.find(e => e.idempotencyKey === idempotencyKey);
      if (existing) {
        newEntitlements.push(existing);
        continue;
      }

      // Find all incidents in this period affecting this customer
      const periodIncidents = this.incidents.filter(inc => {
        const d = new Date(inc.startedAt);
        return d >= period.startDate && d <= period.endDate && inc.affectedCustomerIds.includes(customer.id);
      });

      // Sum credits already granted in this period to enforce cumulative caps
      const creditsAlreadyGranted = this.entitlements
        .filter(e => e.customerId === customer.id && e.billingPeriodKey === period.periodKey && e.status !== 'rejected')
        .reduce((sum, e) => sum + e.eligibleCredit, 0);

      const entitlement = calculateEntitlementEngine({
        customer,
        contract,
        triggeringIncident: incident,
        allPeriodIncidents: periodIncidents,
        evaluationDate: new Date(),
        cumulativePeriodCreditsAlreadyGranted: creditsAlreadyGranted
      });

      this.entitlements.unshift(entitlement);
      newEntitlements.push(entitlement);

      this.recordAuditEventSync({
        category: 'CALCULATION',
        eventType: 'ENTITLEMENT_CALCULATED',
        description: `Calculated entitlement ${entitlement.caseNumber} for ${customer.name}: $${entitlement.eligibleCredit.toFixed(2)} (${entitlement.status}).`,
        actor: { type: 'SYSTEM_AI', name: 'SLA Engine v3.0' },
        entityId: entitlement.id,
        entityType: 'Entitlement'
      });
    }

    this.saveToDisk();
    return newEntitlements;
  }

  /**
   * Processes human approval/rejection decision with strict Dual-Approval Financial Governance:
   * - Single approval for amounts <= DUAL_APPROVAL_THRESHOLD ($2,500.00).
   * - Two-person dual approval for amounts > DUAL_APPROVAL_THRESHOLD ($2,500.00).
   * - Separation of duties: Stage 1 and Stage 2 approvers MUST be distinct individuals.
   * - Role-based permissions: Stage 1 requires Finance Officer; Stage 2 requires Executive/Legal sign-off.
   * - Expiration: Stage 1 approval expires after 24 hours.
   * - Tamper protection: Modifying amount after Stage 1 invalidates the approval.
   * - Rejection & audit trail permanently tracked in SHA-256 chain.
   */
  public processApproval(params: {
    entitlementId: string;
    decision: 'approved' | 'rejected' | 'review_requested';
    reviewedBy: string;
    role?: string;
    notes?: string;
    threshold?: number;
  }): { entitlement: Entitlement; refundRecord?: RefundRecord; serviceCredit?: ServiceCreditRecord; stage?: 'single_approval' | 'first_approval' | 'second_approval' } {
    const entitlement = this.entitlements.find(e => e.id === params.entitlementId);
    if (!entitlement) {
      throw new Error(`ENTITLEMENT_NOT_FOUND: Case ID ${params.entitlementId} does not exist.`);
    }

    if (entitlement.status === 'compensated') {
      throw new Error(`ALREADY_COMPENSATED: Cannot modify approval status of already paid case ${entitlement.caseNumber}.`);
    }

    if (entitlement.status === 'approved' && params.decision === 'approved') {
      throw new Error(`ALREADY_APPROVED: Case ${entitlement.caseNumber} has already been approved.`);
    }

    if (entitlement.status === 'rejected') {
      throw new Error(`ALREADY_REJECTED: Case ${entitlement.caseNumber} has already been rejected and cannot be modified.`);
    }

    // Role resolution helper
    const resolveRole = (name: string, explicitRole?: string): string => {
      if (explicitRole) return explicitRole.toUpperCase();
      const n = name.toLowerCase();
      if (n.includes('legal') || n.includes('counsel') || n.includes('attorney')) return 'LEGAL_COUNSEL';
      if (n.includes('executive') || n.includes('director') || n.includes('vp') || n.includes('cfo') || n.includes('ceo')) return 'EXECUTIVE_DIRECTOR';
      if (n.includes('finance') || n.includes('controller') || n.includes('disbursement') || n.includes('officer') || n.includes('treasury')) return 'FINANCE_CONTROLLER';
      return 'FINANCE_CONTROLLER';
    };

    const approverRole = resolveRole(params.reviewedBy, params.role);
    const DUAL_APPROVAL_THRESHOLD = params.threshold ?? 2500.00;
    const isDualApprovalRequired = entitlement.eligibleCredit > DUAL_APPROVAL_THRESHOLD;

    // Handle Rejection
    if (params.decision === 'rejected') {
      entitlement.status = 'rejected';
      entitlement.firstApproval = undefined;
      entitlement.secondApproval = undefined;
      entitlement.approvalHistory.push({
        requestedAt: new Date().toISOString(),
        reviewedBy: params.reviewedBy,
        reviewedAt: new Date().toISOString(),
        decision: 'rejected',
        notes: params.notes
      });

      this.recordAuditEventSync({
        category: 'APPROVAL',
        eventType: 'COMPENSATION_REJECTED',
        description: `Entitlement ${entitlement.caseNumber} ($${entitlement.eligibleCredit.toFixed(2)}) rejected by ${params.reviewedBy} (${approverRole}). Reason: ${params.notes || 'Contractual terms not satisfied'}.`,
        actor: { type: 'HUMAN', name: params.reviewedBy },
        entityId: entitlement.id,
        entityType: 'Entitlement',
        metadata: { role: approverRole, notes: params.notes }
      });
      this.saveToDisk();
      return { entitlement };
    }

    // Handle Review Requested
    if (params.decision === 'review_requested') {
      entitlement.status = 'requires_review';
      entitlement.firstApproval = undefined;
      entitlement.approvalHistory.push({
        requestedAt: new Date().toISOString(),
        reviewedBy: params.reviewedBy,
        reviewedAt: new Date().toISOString(),
        decision: 'review_requested',
        notes: params.notes
      });

      this.recordAuditEventSync({
        category: 'APPROVAL',
        eventType: 'REVIEW_REQUESTED',
        description: `Entitlement ${entitlement.caseNumber} returned for secondary review by ${params.reviewedBy} (${approverRole}). Note: ${params.notes || 'Additional telemetry verification requested'}.`,
        actor: { type: 'HUMAN', name: params.reviewedBy },
        entityId: entitlement.id,
        entityType: 'Entitlement',
        metadata: { role: approverRole, notes: params.notes }
      });
      this.saveToDisk();
      return { entitlement };
    }

    // Handle Approval Decision
    if (params.decision === 'approved') {
      // Unauthorized role check
      const UNAUTHORIZED_ROLES = ['GUEST', 'INTERN', 'READ_ONLY', 'OPERATOR_VIEWER', 'UNAUTHORIZED'];
      if (UNAUTHORIZED_ROLES.includes(approverRole)) {
        throw new Error(`UNAUTHORIZED_APPROVER: Role "${approverRole}" is not authorized to grant financial compensation approvals.`);
      }

      // Check if this case requires Dual Approval
      if (isDualApprovalRequired) {
        entitlement.dualApprovalRequired = true;

        // Stage 1 Approval
        if (entitlement.status !== 'pending_executive_approval') {
          // Verify Stage 1 permissions
          const validStage1Roles = ['FINANCE_CONTROLLER', 'SENIOR_FINANCE_OFFICER', 'LEAD_DISBURSEMENT_OFFICER', 'FINANCE_OFFICER', 'EXECUTIVE_DIRECTOR', 'LEGAL_COUNSEL', 'CHIEF_FINANCIAL_OFFICER'];
          if (!validStage1Roles.includes(approverRole)) {
            throw new Error(`INSUFFICIENT_PERMISSIONS: Stage 1 financial review requires Finance Officer or Controller authorization.`);
          }

          entitlement.firstApproval = {
            approver: params.reviewedBy,
            role: approverRole,
            approvedAt: new Date().toISOString(),
            boundAmount: entitlement.eligibleCredit,
            notes: params.notes
          };
          entitlement.approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          entitlement.status = 'pending_executive_approval';

          entitlement.approvalHistory.push({
            requestedAt: new Date().toISOString(),
            reviewedBy: params.reviewedBy,
            reviewedAt: new Date().toISOString(),
            decision: 'approved',
            notes: `[Stage 1 / Dual-Approval]: ${params.notes || 'Primary financial review approved. Awaiting executive sign-off.'}`
          });

          this.recordAuditEventSync({
            category: 'APPROVAL',
            eventType: 'STAGE_1_APPROVAL_GRANTED',
            description: `Stage 1 approval granted for ${entitlement.caseNumber} ($${entitlement.eligibleCredit.toFixed(2)}) by ${params.reviewedBy} (${approverRole}). Dual-approval threshold: $${DUAL_APPROVAL_THRESHOLD.toFixed(2)}. Case awaits Stage 2 executive sign-off.`,
            actor: { type: 'HUMAN', name: params.reviewedBy },
            entityId: entitlement.id,
            entityType: 'Entitlement',
            metadata: { stage: 1, boundAmount: entitlement.eligibleCredit, approver: params.reviewedBy, role: approverRole, expiresAt: entitlement.approvalExpiresAt }
          });

          this.saveToDisk();
          return { entitlement, stage: 'first_approval' };
        }

        // Stage 2 Approval
        if (entitlement.status === 'pending_executive_approval') {
          // 1. Expiration check (24 hours TTL)
          if (entitlement.approvalExpiresAt && new Date() > new Date(entitlement.approvalExpiresAt)) {
            entitlement.status = 'requires_review';
            entitlement.firstApproval = undefined;
            this.recordAuditEventSync({
              category: 'APPROVAL',
              eventType: 'APPROVAL_EXPIRED',
              description: `Stage 1 approval for ${entitlement.caseNumber} expired after 24 hours. Status reset to requires_review.`,
              actor: { type: 'SYSTEM', name: 'Dual-Approval Governance Engine' },
              entityId: entitlement.id,
              entityType: 'Entitlement'
            });
            this.saveToDisk();
            throw new Error(`APPROVAL_EXPIRED: First-stage approval for ${entitlement.caseNumber} has expired (24-hour TTL). Re-initiation of dual-approval workflow required.`);
          }

          // 2. Separation of Duties enforcement: Same person cannot approve both stages!
          const firstApprover = entitlement.firstApproval?.approver?.trim().toLowerCase();
          const secondApprover = params.reviewedBy.trim().toLowerCase();
          if (firstApprover && firstApprover === secondApprover) {
            throw new Error(`SEPARATION_OF_DUTIES_VIOLATION: Approver "${params.reviewedBy}" cannot approve Stage 2 because they performed Stage 1 approval. A separate authorized executive is strictly required.`);
          }

          // 3. Stage 2 Role-Based Permissions (must be Executive / Legal / CFO)
          const validStage2Roles = ['EXECUTIVE_DIRECTOR', 'LEGAL_COUNSEL', 'CHIEF_FINANCIAL_OFFICER', 'CFO', 'GENERAL_COUNSEL', 'SENIOR_EXECUTIVE', 'LEGAL_AND_FINANCE_LEAD'];
          if (!validStage2Roles.includes(approverRole)) {
            throw new Error(`INSUFFICIENT_PERMISSIONS: Executive sign-off for amounts exceeding $${DUAL_APPROVAL_THRESHOLD.toFixed(2)} requires Executive Director, Legal Counsel, or CFO authorization.`);
          }

          // 4. Amount Tamper Protection: Entitlement amount must match Stage 1 bound amount
          if (entitlement.firstApproval && entitlement.firstApproval.boundAmount !== entitlement.eligibleCredit) {
            const bound = entitlement.firstApproval.boundAmount;
            entitlement.status = 'requires_review';
            entitlement.firstApproval = undefined;
            this.saveToDisk();
            throw new Error(`APPROVAL_AMOUNT_MISMATCH: Entitlement amount ($${entitlement.eligibleCredit.toFixed(2)}) has changed since Stage 1 approval ($${bound.toFixed(2)}). Approval invalidated.`);
          }

          // All Stage 2 checks passed!
          entitlement.secondApproval = {
            approver: params.reviewedBy,
            role: approverRole,
            approvedAt: new Date().toISOString(),
            boundAmount: entitlement.eligibleCredit,
            notes: params.notes
          };
          entitlement.status = 'approved';

          entitlement.approvalHistory.push({
            requestedAt: new Date().toISOString(),
            reviewedBy: params.reviewedBy,
            reviewedAt: new Date().toISOString(),
            decision: 'approved',
            notes: `[Stage 2 / Dual-Approval Finalized]: ${params.notes || 'Executive sign-off confirmed. Dual-approval governance satisfied.'}`
          });
        }
      } else {
        // Single Approval (Amount <= Threshold)
        entitlement.status = 'approved';
        entitlement.approvalHistory.push({
          requestedAt: new Date().toISOString(),
          reviewedBy: params.reviewedBy,
          reviewedAt: new Date().toISOString(),
          decision: 'approved',
          notes: params.notes
        });
      }

      // Generate Financial Disbursement Records (Refund / Service Credit)
      const customer = this.customers.find(c => c.id === entitlement.customerId);
      const isPayPal = entitlement.payoutMethod === 'PayPal Refund';

      let refundRecord: RefundRecord | undefined;
      let serviceCredit: ServiceCreditRecord | undefined;

      if (isPayPal && customer) {
        if (!customer.paypalCaptureId || !/^[A-Za-z0-9_-]{12,32}$/.test(customer.paypalCaptureId.trim())) {
          throw new Error(`MISSING_PAYPAL_CAPTURE_ID: Customer "${customer.name}" does not have a valid original PayPal capture ID on record. Cannot generate PayPal refund.`);
        }
        const captureId = customer.paypalCaptureId.trim();

        // Idempotency: check if refund record already exists for this entitlement
        const existingRefund = this.refunds.find(r => r.entitlementId === entitlement.id);
        if (existingRefund) {
          refundRecord = existingRefund;
        } else {
          refundRecord = {
            id: `ref-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
            refundNumber: `REF-2026-PAYPAL-${Math.floor(100 + Math.random() * 900)}`,
            entitlementId: entitlement.id,
            customerId: customer.id,
            customerName: customer.name,
            paypalAccount: customer.paypalEmail,
            paypalCaptureId: captureId,
            originalPaymentId: `PAYPAL-SUB-${customer.id}`,
            refundAmount: entitlement.eligibleCredit,
            currency: customer.currency || 'USD',
            idempotencyRequestId: `idemp-${entitlement.idempotencyKey}`,
            feeAmount: 0.00,
            status: 'approved',
            createdAt: new Date().toISOString()
          };
          this.refunds.unshift(refundRecord);
        }
        entitlement.payoutReferenceId = refundRecord.refundNumber;
      } else if (customer) {
        const existingCredit = this.serviceCredits.find(c => c.entitlementId === entitlement.id);
        if (existingCredit) {
          serviceCredit = existingCredit;
        } else {
          serviceCredit = {
            id: `cred-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
            creditNumber: `CRED-2026-INV-${Math.floor(100 + Math.random() * 900)}`,
            entitlementId: entitlement.id,
            customerId: customer.id,
            customerName: customer.name,
            billingAccount: `ACT-${customer.name.substring(0, 3).toUpperCase()}-001`,
            creditAmount: entitlement.eligibleCredit,
            currency: 'USD',
            applicableBillingPeriod: 'Immediate Next Invoice Cycle',
            status: 'pending_invoice',
            createdAt: new Date().toISOString()
          };
          this.serviceCredits.unshift(serviceCredit);
        }
        entitlement.payoutReferenceId = serviceCredit.creditNumber;
      }

      const eventType = isDualApprovalRequired ? 'DUAL_APPROVAL_COMPLETED' : 'COMPENSATION_APPROVED';
      const eventDesc = isDualApprovalRequired
        ? `Dual-approval governance completed for ${entitlement.caseNumber} ($${entitlement.eligibleCredit.toFixed(2)}). Stage 1: ${entitlement.firstApproval?.approver} (${entitlement.firstApproval?.role}); Stage 2: ${params.reviewedBy} (${approverRole}). Financial record created.`
        : `Entitlement ${entitlement.caseNumber} ($${entitlement.eligibleCredit.toFixed(2)}) approved by ${params.reviewedBy} (${approverRole}). Financial record created.`;

      this.recordAuditEventSync({
        category: 'APPROVAL',
        eventType,
        description: eventDesc,
        actor: { type: 'HUMAN', name: params.reviewedBy },
        entityId: entitlement.id,
        entityType: 'Entitlement',
        metadata: {
          decision: params.decision,
          notes: params.notes,
          dualApproval: isDualApprovalRequired,
          firstApprover: entitlement.firstApproval?.approver,
          secondApprover: params.reviewedBy,
          eligibleCredit: entitlement.eligibleCredit
        }
      });

      this.saveToDisk();
      return {
        entitlement,
        refundRecord,
        serviceCredit,
        stage: isDualApprovalRequired ? 'second_approval' : 'single_approval'
      };
    }

    throw new Error(`INVALID_DECISION: Decision "${params.decision}" is not supported.`);
  }

  /**
   * Executes refund against real PayPal Sandbox capture API:
   * POST /v2/payments/captures/{capture_id}/refund
   * Enforces backend security invariants:
   * 1. Existing entitlement must be found.
   * 2. Financial status must be 'approved' or 'partially_compensated'.
   * 3. Valid original PayPal capture ID (alphanumeric 12-32 chars).
   * 4. Customer refundable balance must be sufficient.
   * 5. Valid currency (ISO 3-letter code).
   * 6. Atomically reserves balance under an entitlement mutex to prevent simultaneous double-disbursement.
   * 7. Reuses immutable PayPal-Request-Id for operation retries.
   * 8. Performs PayPal Sandbox capture verification before refund execution.
   * 9. Reconciles state transitions cleanly between pending, processing, completed, and failed.
   * 10. Fails cleanly with transparent error if Sandbox credentials are not configured (NO FAKE SUCCESS).
   */
  public async executePayPalCaptureRefundAction(params: {
    refundId: string;
    actorName?: string;
  }): Promise<{ refund: RefundRecord; result: PayPalRefundResult }> {
    const refund = this.refunds.find(r => r.id === params.refundId);
    if (!refund) {
      throw new Error(`REFUND_NOT_FOUND: Refund record ${params.refundId} not found.`);
    }

    if (refund.status === 'completed') {
      throw new Error(`ALREADY_REFUNDED: Refund ${refund.refundNumber} has already been executed.`);
    }

    if (refund.status === 'processing') {
      throw new Error(`CONCURRENT_OPERATION_IN_PROGRESS: Refund ${refund.refundNumber} is currently processing. Simultaneous dispatch blocked.`);
    }

    const entitlement = this.entitlements.find(e => e.id === refund.entitlementId);
    if (!entitlement) {
      throw new Error(`ENTITLEMENT_NOT_FOUND: Refund ${refund.refundNumber} references non-existent entitlement.`);
    }

    // Protect entire financial operation via entitlement concurrency lock
    return await this.acquireEntitlementLock(entitlement.id, async () => {
      // 1. FINANCIAL STATUS INVARIANT
      if (entitlement.status !== 'approved' && entitlement.status !== 'partially_compensated') {
        throw new Error(`UNAUTHORIZED_FINANCIAL_ACTION: Case ${entitlement.caseNumber} status is "${entitlement.status}". Only "approved" or "partially_compensated" cases may execute refunds.`);
      }

      const customer = this.customers.find(c => c.id === refund.customerId);
      if (!customer) {
        throw new Error(`CUSTOMER_NOT_FOUND: Customer ${refund.customerId} missing.`);
      }

      // 2. ORIGINAL PAYPAL CAPTURE ID VALIDATION
      const captureId = refund.paypalCaptureId?.trim();
      if (!captureId || !/^[A-Za-z0-9_-]{12,32}$/.test(captureId)) {
        throw new Error(`INVALID_PAYPAL_CAPTURE_ID: Original capture ID "${refund.paypalCaptureId}" is invalid. Must be a valid 12-32 character alphanumeric PayPal capture ID.`);
      }

      // 3. CURRENCY VALIDATION
      const ALLOWED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      const refundCurrency = (refund.currency || 'USD').toUpperCase();
      if (!ALLOWED_CURRENCIES.includes(refundCurrency)) {
        throw new Error(`INVALID_CURRENCY: Currency "${refund.currency}" is invalid. Permitted currencies: ${ALLOWED_CURRENCIES.join(', ')}.`);
      }

      // 4. REFUND AMOUNT VALIDATION
      if (!refund.refundAmount || refund.refundAmount <= 0 || isNaN(refund.refundAmount)) {
        throw new Error(`INVALID_REFUND_AMOUNT: Refund amount must be a positive number.`);
      }

      // 5. CUSTOMER REFUNDABLE BALANCE VALIDATION
      const currentBalance = customer.refundableBalance ?? customer.monthlySpend;
      if (refund.refundAmount > currentBalance) {
        throw new Error(`INSUFFICIENT_REFUNDABLE_BALANCE: Refund amount ($${refund.refundAmount.toFixed(2)}) exceeds customer refundable balance ($${currentBalance.toFixed(2)}).`);
      }

      // 6. CUMULATIVE ENTITLEMENT CAP (PREVENTS OVER-REFUNDING BEYOND CONTRACTUAL REMEDY)
      const activeRefunds = this.refunds.filter(
        r => r.entitlementId === entitlement.id && 
             (r.status === 'completed' || r.status === 'processing' || r.status === 'approved') && 
             r.id !== refund.id
      );
      const previouslyCommitted = activeRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
      const totalAfterRefund = Number((previouslyCommitted + refund.refundAmount).toFixed(2));

      if (totalAfterRefund > entitlement.eligibleCredit) {
        const remainingPermitted = Math.max(0, Number((entitlement.eligibleCredit - previouslyCommitted).toFixed(2)));
        throw new Error(
          `EXCEEDS_PERMITTED_ENTITLEMENT_AMOUNT: Cumulative refunds ($${totalAfterRefund.toFixed(2)}) would exceed contractual entitlement limit of $${entitlement.eligibleCredit.toFixed(2)}. Maximum remaining allowable refund is $${remainingPermitted.toFixed(2)}.`
        );
      }

      // 7. ATOMIC RESERVATION: Reserve amount in state before external network call
      refund.status = 'processing';
      this.saveToDisk();

      // 8. LIVE PAYPAL CAPTURE VALIDATION (if sandbox is configured)
      if (isPayPalSandboxConfigured()) {
        const captureValidation = await validatePayPalCaptureForRefund({
          captureId: refund.paypalCaptureId,
          expectedCurrency: refundCurrency,
          requestedRefundAmount: refund.refundAmount,
          expectedCustomerId: customer.id,
          expectedOriginalPaymentId: refund.originalPaymentId
        });

        if (!captureValidation.valid) {
          refund.status = 'failed';
          refund.failureReason = captureValidation.error;
          this.recordAuditEventSync({
            category: 'PAYPAL_REFUND',
            eventType: 'PAYPAL_REFUND_FAILED',
            description: `PayPal capture validation for ${refund.refundNumber} failed: ${captureValidation.error}`,
            actor: { type: 'HUMAN', name: params.actorName || 'Disbursement Worker' },
            entityId: refund.id,
            entityType: 'Refund',
            metadata: { error: captureValidation.error }
          });
          this.saveToDisk();
          return {
            refund,
            result: {
              success: false,
              captureId: refund.paypalCaptureId,
              error: captureValidation.error,
              requiresSandboxConfig: captureValidation.requiresSandboxConfig
            }
          };
        }
      }

      // 9. CALL PAYPAL SANDBOX ENDPOINT (REUSING SAME PayPal-Request-Id FOR RETRIES)
      const result = await executePayPalCaptureRefund({
        captureId: refund.paypalCaptureId,
        amount: refund.refundAmount,
        currency: refundCurrency,
        note: `Contractual SLA Remedy for Case ${entitlement.caseNumber}`,
        idempotencyRequestId: refund.idempotencyRequestId // immutable idempotency key preserved across retries
      });

      if (!result.success) {
        refund.status = 'failed';
        refund.failureReason = result.error;
        this.recordAuditEventSync({
          category: 'PAYPAL_REFUND',
          eventType: 'PAYPAL_REFUND_FAILED',
          description: `PayPal capture refund for ${refund.refundNumber} ($${refund.refundAmount.toFixed(2)}) failed: ${result.error}`,
          actor: { type: 'HUMAN', name: params.actorName || 'Disbursement Worker' },
          entityId: refund.id,
          entityType: 'Refund',
          metadata: { error: result.error, requiresSandboxConfig: result.requiresSandboxConfig }
        });
        this.saveToDisk();
        return { refund, result };
      }

      // 10. SUCCESS PATH: Reconcile completed state and customer balance
      refund.status = 'completed';
      refund.executedAt = new Date().toISOString();
      refund.paypalRefundId = result.refundId;
      refund.rawPayload = result.rawResponse;
      refund.liveSandboxExecution = true;

      // Deduct customer balance
      customer.refundableBalance = Math.max(0, Number((currentBalance - refund.refundAmount).toFixed(2)));

      // Track cumulative entitlement refund metrics
      entitlement.totalRefundedAmount = totalAfterRefund;
      entitlement.remainingRefundableAmount = Math.max(0, Number((entitlement.eligibleCredit - totalAfterRefund).toFixed(2)));

      // Transition status: If fully refunded -> 'compensated'; If partial -> 'partially_compensated'
      if (totalAfterRefund >= entitlement.eligibleCredit) {
        entitlement.status = 'compensated';
      } else {
        entitlement.status = 'partially_compensated';
      }

      this.recordAuditEventSync({
        category: 'PAYPAL_REFUND',
        eventType: 'PAYPAL_REFUND_EXECUTED',
        description: `Disbursed $${refund.refundAmount.toFixed(2)} to ${refund.customerName} via PayPal Sandbox capture refund (Capture: ${refund.paypalCaptureId}, Refund: ${result.refundId}). Status: ${entitlement.status}.`,
        actor: { type: 'HUMAN', name: params.actorName || 'Disbursement Worker' },
        entityId: refund.id,
        entityType: 'Refund',
        metadata: { captureId: refund.paypalCaptureId, refundId: result.refundId, amount: refund.refundAmount, entitlementStatus: entitlement.status }
      });

      this.saveToDisk();
      return { refund, result };
    });
  }

  /**
   * Creates a legitimate partial refund against an approved or partially compensated entitlement.
   */
  public createPartialRefund(params: {
    entitlementId: string;
    amount: number;
    actorName?: string;
    notes?: string;
  }): RefundRecord {
    const entitlement = this.entitlements.find(e => e.id === params.entitlementId);
    if (!entitlement) {
      throw new Error(`ENTITLEMENT_NOT_FOUND: Case ${params.entitlementId} not found.`);
    }

    if (entitlement.status !== 'approved' && entitlement.status !== 'partially_compensated') {
      throw new Error(`UNAUTHORIZED_FINANCIAL_ACTION: Case ${entitlement.caseNumber} must be "approved" or "partially_compensated" to create a partial refund.`);
    }

    const customer = this.customers.find(c => c.id === entitlement.customerId);
    if (!customer) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer for entitlement ${entitlement.caseNumber} missing.`);
    }

    if (!customer.paypalCaptureId || !/^[A-Za-z0-9_-]{12,32}$/.test(customer.paypalCaptureId.trim())) {
      throw new Error(`MISSING_PAYPAL_CAPTURE_ID: Customer "${customer.name}" lacks a valid original PayPal capture ID on record.`);
    }

    // Check remaining permitted entitlement amount against active (approved, processing, or completed) refunds
    const activeRefunds = this.refunds.filter(
      r => r.entitlementId === entitlement.id && (r.status === 'completed' || r.status === 'processing' || r.status === 'approved')
    );
    const previouslyCommitted = activeRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
    const remainingPermitted = Math.max(0, Number((entitlement.eligibleCredit - previouslyCommitted).toFixed(2)));

    if (params.amount <= 0 || isNaN(params.amount)) {
      throw new Error(`INVALID_REFUND_AMOUNT: Requested partial refund amount must be greater than zero.`);
    }

    if (params.amount > remainingPermitted) {
      throw new Error(`EXCEEDS_PERMITTED_ENTITLEMENT_AMOUNT: Requested partial refund ($${params.amount.toFixed(2)}) exceeds remaining allowable credit of $${remainingPermitted.toFixed(2)}.`);
    }

    const currentBalance = customer.refundableBalance ?? customer.monthlySpend;
    if (params.amount > currentBalance) {
      throw new Error(`INSUFFICIENT_REFUNDABLE_BALANCE: Requested partial refund ($${params.amount.toFixed(2)}) exceeds customer refundable balance ($${currentBalance.toFixed(2)}).`);
    }

    const refundRecord: RefundRecord = {
      id: `ref-partial-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      refundNumber: `REF-2026-PARTIAL-${Math.floor(100 + Math.random() * 900)}`,
      entitlementId: entitlement.id,
      customerId: customer.id,
      customerName: customer.name,
      paypalAccount: customer.paypalEmail,
      paypalCaptureId: customer.paypalCaptureId.trim(),
      originalPaymentId: `PAYPAL-SUB-${customer.id}`,
      refundAmount: params.amount,
      currency: customer.currency || 'USD',
      idempotencyRequestId: `idemp-part-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      feeAmount: 0.00,
      status: 'approved',
      createdAt: new Date().toISOString()
    };

    this.refunds.unshift(refundRecord);
    this.recordAuditEventSync({
      category: 'APPROVAL',
      eventType: 'PARTIAL_REFUND_CREATED',
      description: `Created partial refund record ${refundRecord.refundNumber} ($${params.amount.toFixed(2)}) for entitlement ${entitlement.caseNumber} by ${params.actorName || 'Disbursement Officer'}.`,
      actor: { type: 'HUMAN', name: params.actorName || 'Disbursement Officer' },
      entityId: refundRecord.id,
      entityType: 'Refund'
    });

    this.saveToDisk();
    return refundRecord;
  }

  public getRefunds(): RefundRecord[] {
    return this.refunds;
  }

  public getRefundById(id: string): RefundRecord | undefined {
    return this.refunds.find(r => r.id === id);
  }

  public getGenuineCaptures(): GenuineCaptureRecord[] {
    return this.genuineCaptures;
  }

  /**
   * Maps a genuine PayPal Sandbox payment capture to a PromiseBack customer.
   * Updates customer's paypalCaptureId and refundableBalance, maintaining complete audit trail.
   */
  public recordGenuineSandboxCapture(params: {
    customerId: string;
    orderId: string;
    captureId: string;
    amount: number;
    currency: string;
    status: string;
    capturedAt?: string;
    rawPayload?: any;
  }): GenuineCaptureRecord {
    this.loadFromDisk();
    const customer = this.customers.find(c => c.id === params.customerId);
    if (!customer) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer ${params.customerId} not found.`);
    }

    const cleanCaptureId = params.captureId.trim();
    if (!cleanCaptureId || !/^[A-Za-z0-9_-]{12,32}$/.test(cleanCaptureId)) {
      throw new Error(`INVALID_CAPTURE_ID: Capture ID "${cleanCaptureId}" fails validation.`);
    }

    // Idempotency: prevent duplicate capture record creation
    const existing = this.genuineCaptures.find(c => c.paypalCaptureId === cleanCaptureId);
    if (existing) {
      this.reconcileCustomerLedger(customer.id, false);
      return existing;
    }

    const record: GenuineCaptureRecord = {
      id: `cap-rec-${Date.now()}`,
      customerId: customer.id,
      customerName: customer.name,
      paypalOrderId: params.orderId,
      paypalCaptureId: cleanCaptureId,
      amount: params.amount,
      currency: params.currency || 'USD',
      status: params.status || 'COMPLETED',
      capturedAt: params.capturedAt || new Date().toISOString(),
      rawPayload: params.rawPayload
    };

    this.genuineCaptures.unshift(record);

    // Deterministically reconcile customer balance and ensure latest capture reference
    const recon = this.reconcileCustomerLedger(customer.id, false);

    this.recordAuditEventSync({
      category: 'PAYPAL_CAPTURE',
      eventType: 'PAYPAL_GENUINE_CAPTURE_MAPPED',
      description: `Mapped genuine PayPal Sandbox capture ${cleanCaptureId} ($${params.amount.toFixed(2)} ${params.currency}) to customer ${customer.name}. New refundable balance: $${recon.reconciledBalance.toFixed(2)}.`,
      actor: { type: 'HUMAN', name: 'Sandbox Checkout Operator' },
      entityId: record.id,
      entityType: 'Capture',
      metadata: { orderId: params.orderId, captureId: cleanCaptureId, customerId: customer.id, amount: params.amount, newBalance: recon.reconciledBalance }
    });

    this.saveToDisk();
    return record;
  }

  /**
   * Idempotent webhook event reconciliation for verified PayPal webhook deliveries.
   * Protects against duplicate deliveries, reconciles refund status, and safely handles unknown resources.
   */
  public reconcileWebhookEvent(event: {
    id: string;
    event_type: string;
    resource: Record<string, any>;
    create_time?: string;
  }): { reconciled: boolean; actionTaken: string; matchedRefundId?: string; error?: string } {
    if (!event.id) {
      return { reconciled: false, actionTaken: 'MISSING_EVENT_ID', error: 'Event missing unique ID.' };
    }

    // 1. Duplicate Event Protection (Idempotency)
    if (this.processedWebhookEventIds.includes(event.id)) {
      return {
        reconciled: true,
        actionTaken: 'DUPLICATE_EVENT_IGNORED'
      };
    }

    this.processedWebhookEventIds.push(event.id);
    if (this.processedWebhookEventIds.length > 500) {
      this.processedWebhookEventIds.shift();
    }

    const eventType = event.event_type;
    const resource = event.resource || {};

    // 2. Reconcile Refund Event: PAYMENT.CAPTURE.REFUNDED
    if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      const refundId = resource.id;
      const captureId = resource.capture_id;

      // Locate matching PromiseBack refund
      const matchedRefund = this.refunds.find(r => 
        (refundId && r.paypalRefundId === refundId) ||
        (captureId && r.paypalCaptureId === captureId && r.status !== 'completed')
      );

      if (matchedRefund) {
        const prevStatus = matchedRefund.status;
        matchedRefund.status = 'completed';
        matchedRefund.executedAt = event.create_time || new Date().toISOString();
        if (!matchedRefund.paypalRefundId && refundId) {
          matchedRefund.paypalRefundId = refundId;
        }
        matchedRefund.liveSandboxExecution = true;

        // Transition matching entitlement if not compensated
        const entitlement = this.entitlements.find(e => e.id === matchedRefund.entitlementId);
        if (entitlement && entitlement.status !== 'compensated') {
          entitlement.status = 'compensated';
        }

        this.recordAuditEventSync({
          category: 'PAYPAL_REFUND',
          eventType: 'PAYPAL_WEBHOOK_RECONCILED',
          description: `Webhook reconciled refund ${matchedRefund.refundNumber} ($${matchedRefund.refundAmount.toFixed(2)}) via PayPal event ${event.id}. Status: completed.`,
          actor: { type: 'WEBHOOK', name: 'PayPal Sandbox Webhook' },
          entityId: matchedRefund.id,
          entityType: 'Refund',
          metadata: { webhookEventId: event.id, resourceId: refundId, prevStatus }
        });

        this.saveToDisk();
        return {
          reconciled: true,
          actionTaken: 'REFUND_COMPLETED_VIA_WEBHOOK',
          matchedRefundId: matchedRefund.id
        };
      } else {
        // Safe handling of unmapped or simulator mock resource IDs
        this.recordAuditEventSync({
          category: 'SYSTEM',
          eventType: 'PAYPAL_WEBHOOK_UNMAPPED_RESOURCE',
          description: `Received verified webhook ${eventType} (${event.id}) for unmapped resource ${refundId || 'unknown'}. Safely acknowledged without state corruption.`,
          actor: { type: 'WEBHOOK', name: 'PayPal Sandbox Webhook' },
          entityId: event.id,
          entityType: 'Refund',
          metadata: { resourceId: refundId, captureId }
        });

        this.saveToDisk();
        return {
          reconciled: true,
          actionTaken: 'UNMAPPED_RESOURCE_ACKNOWLEDGED'
        };
      }
    }

    // 3. Reconcile Capture Completed: PAYMENT.CAPTURE.COMPLETED
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const captureId = resource.id;
      const matchedCapture = this.genuineCaptures.find(c => c.paypalCaptureId === captureId);
      if (matchedCapture) {
        matchedCapture.status = 'COMPLETED';
      }

      const isSynthetic = event.id.startsWith('WH-EVT-SIMULATOR') || event.id.startsWith('WH-SYNTHETIC') || event.id.startsWith('WH-TEST');
      this.recordAuditEventSync({
        category: 'PAYPAL_CAPTURE',
        eventType: 'PAYPAL_WEBHOOK_CAPTURE_COMPLETED',
        description: `${isSynthetic ? '[Synthetic Test Event] ' : 'Verified '}PayPal webhook confirmed capture ${captureId} completed.`,
        actor: { type: 'WEBHOOK', name: isSynthetic ? 'PromiseBack Webhook Simulator' : 'PayPal Sandbox Webhook' },
        entityId: event.id,
        entityType: 'Capture',
        metadata: { captureId, isSynthetic }
      });

      this.saveToDisk();
      return {
        reconciled: true,
        actionTaken: 'CAPTURE_COMPLETED_VIA_WEBHOOK'
      };
    }

    // 4. Handle PAYMENT.CAPTURE.PENDING
    if (eventType === 'PAYMENT.CAPTURE.PENDING') {
      const captureId = resource.id;
      const matchedCapture = this.genuineCaptures.find(c => c.paypalCaptureId === captureId);
      if (matchedCapture) {
        matchedCapture.status = 'PENDING';
      }

      const isSynthetic = event.id.startsWith('WH-EVT-SIMULATOR') || event.id.startsWith('WH-SYNTHETIC') || event.id.startsWith('WH-TEST');
      this.recordAuditEventSync({
        category: 'PAYPAL_CAPTURE',
        eventType: 'PAYPAL_WEBHOOK_CAPTURE_PENDING',
        description: `PayPal webhook notification: Capture ${captureId} status is PENDING.`,
        actor: { type: 'WEBHOOK', name: isSynthetic ? 'PromiseBack Webhook Simulator' : 'PayPal Sandbox Webhook' },
        entityId: event.id,
        entityType: 'Capture',
        metadata: { captureId, status: 'PENDING', isSynthetic }
      });

      this.saveToDisk();
      return {
        reconciled: true,
        actionTaken: 'CAPTURE_PENDING_ACKNOWLEDGED'
      };
    }

    // 5. Handle PAYMENT.CAPTURE.DENIED
    if (eventType === 'PAYMENT.CAPTURE.DENIED') {
      const captureId = resource.id;
      const matchedCapture = this.genuineCaptures.find(c => c.paypalCaptureId === captureId);
      if (matchedCapture) {
        matchedCapture.status = 'DENIED';
      }

      const isSynthetic = event.id.startsWith('WH-EVT-SIMULATOR') || event.id.startsWith('WH-SYNTHETIC') || event.id.startsWith('WH-TEST');
      this.recordAuditEventSync({
        category: 'PAYPAL_CAPTURE',
        eventType: 'PAYPAL_WEBHOOK_CAPTURE_DENIED',
        description: `PayPal webhook notification: Capture ${captureId} status is DENIED.`,
        actor: { type: 'WEBHOOK', name: isSynthetic ? 'PromiseBack Webhook Simulator' : 'PayPal Sandbox Webhook' },
        entityId: event.id,
        entityType: 'Capture',
        metadata: { captureId, status: 'DENIED', isSynthetic }
      });

      this.saveToDisk();
      return {
        reconciled: true,
        actionTaken: 'CAPTURE_DENIED_ACKNOWLEDGED'
      };
    }

    // 6. Handle CHECKOUT.ORDER.APPROVED
    if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = resource.id;
      const isSynthetic = event.id.startsWith('WH-EVT-SIMULATOR') || event.id.startsWith('WH-SYNTHETIC') || event.id.startsWith('WH-TEST');
      this.recordAuditEventSync({
        category: 'PAYPAL_CAPTURE',
        eventType: 'PAYPAL_WEBHOOK_ORDER_APPROVED',
        description: `PayPal webhook notification: Order ${orderId} approved by buyer.`,
        actor: { type: 'WEBHOOK', name: isSynthetic ? 'PromiseBack Webhook Simulator' : 'PayPal Sandbox Webhook' },
        entityId: event.id,
        entityType: 'Capture',
        metadata: { orderId, isSynthetic }
      });

      this.saveToDisk();
      return {
        reconciled: true,
        actionTaken: 'ORDER_APPROVED_ACKNOWLEDGED'
      };
    }

    // Default event acknowledgment
    this.saveToDisk();
    return {
      reconciled: true,
      actionTaken: 'EVENT_ACKNOWLEDGED'
    };
  }

  public getServiceCredits(): ServiceCreditRecord[] {
    return this.serviceCredits;
  }

  public applyServiceCredit(creditId: string, actorName = 'Billing Automation'): ServiceCreditRecord {
    const credit = this.serviceCredits.find(c => c.id === creditId);
    if (!credit) {
      throw new Error(`SERVICE_CREDIT_NOT_FOUND: ID ${creditId} not found.`);
    }

    const entitlement = this.entitlements.find(e => e.id === credit.entitlementId);
    if (entitlement && entitlement.status !== 'approved' && entitlement.status !== 'compensated') {
      throw new Error(`UNAUTHORIZED_FINANCIAL_ACTION: Case ${entitlement.caseNumber} must be "approved" before applying credit.`);
    }

    credit.status = 'applied';
    credit.appliedAt = new Date().toISOString();
    credit.invoiceCreditId = `INV-CR-${Math.floor(10000 + Math.random() * 90000)}`;

    if (entitlement) {
      entitlement.status = 'compensated';
    }

    this.recordAuditEventSync({
      category: 'APPROVAL',
      eventType: 'CREDIT_APPLIED_TO_INVOICE',
      description: `Applied service credit of $${credit.creditAmount.toFixed(2)} for ${credit.customerName} on ${credit.applicableBillingPeriod}. Reference: ${credit.invoiceCreditId}`,
      actor: { type: 'SYSTEM_AI', name: actorName },
      entityId: credit.id,
      entityType: 'ServiceCredit'
    });

    this.saveToDisk();
    return credit;
  }

  public getAuditEvents(): AuditEvent[] {
    return this.auditEvents;
  }

  public verifyAuditIntegrity(): { isValid: boolean; checkedEventsCount: number; brokenAtHash?: string } {
    let previous = '0000000000000000000000000000000000000000000000000000000000000000';
    const chronological = [...this.auditEvents].reverse();

    for (let i = 0; i < chronological.length; i++) {
      const event = chronological[i];
      if (event.previousHash !== previous) {
        return { isValid: false, checkedEventsCount: i, brokenAtHash: event.hash };
      }
      const recalculated = sha256(`${event.timestamp}|${event.category}|${event.eventType}|${event.entityId}|${event.description}|${event.previousHash}`);
      if (recalculated !== event.hash) {
        return { isValid: false, checkedEventsCount: i, brokenAtHash: event.hash };
      }
      previous = event.hash;
    }

    return { isValid: true, checkedEventsCount: chronological.length };
  }

  public getDashboardStats(): DashboardStats {
    const activeContracts = this.contracts.filter(c => c.status === 'active').length;
    const activeIncidents = this.incidents.filter(i => i.status !== 'resolved').length;
    
    const creditsOwed = this.entitlements
      .filter(e => e.status === 'pending_approval' || e.status === 'approved' || e.status === 'requires_review')
      .reduce((sum, e) => sum + e.eligibleCredit, 0);

    const pendingApprovals = this.entitlements.filter(e => e.status === 'pending_approval').length;
    
    const totalCompensatedThisMonth = this.refunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + r.refundAmount, 0) + 
      this.serviceCredits
      .filter(c => c.status === 'applied')
      .reduce((sum, c) => sum + c.creditAmount, 0);

    const breachedIncidentsCount = this.incidents.filter(i => i.slaBreached).length;
    const casesRequiringReviewCount = this.entitlements.filter(e => e.status === 'requires_review').length;

    // Dynamically calculate average availability across all monitored tenant periods
    const measuredUptimes = this.entitlements.map(e => e.measuredUptime);
    const averageUptime = measuredUptimes.length > 0 
      ? Number((measuredUptimes.reduce((a, b) => a + b, 0) / measuredUptimes.length).toFixed(3))
      : 99.95;

    return {
      activeContracts,
      activeIncidents,
      creditsOwed,
      pendingApprovals,
      totalCustomersProtected: this.customers.length,
      totalCompensatedThisMonth,
      averageUptimeCurrentMonth: averageUptime,
      targetUptime: 99.95,
      operationalIntelligence: {
        breachedIncidentsCount,
        casesRequiringReviewCount,
        estimatedCompensation: creditsOwed,
        recommendedActions: [
          `${breachedIncidentsCount} incidents breached contractual service commitments.`,
          `${pendingApprovals} customer entitlement cases await financial dual-approval.`,
          `Estimated outstanding contractual compensation: $${creditsOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
        ]
      }
    };
  }

  public getAvailabilityTimeSeries(): AvailabilityTimeSeriesPoint[] {
    const points: AvailabilityTimeSeriesPoint[] = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      let avail = 100.00;
      let isOutage = false;
      let incName: string | undefined;

      if (i === 2) {
        // Incident INC-2026-0314 (38 mins outage in 30-day month = 99.912% uptime)
        avail = 99.912;
        isOutage = true;
        incName = 'INC-2026-0314 (Core API 38m)';
      } else if (i === 8) {
        // Incident INC-2026-0308 (60 mins outage in 31-day month = 99.866% uptime)
        avail = 99.866;
        isOutage = true;
        incName = 'INC-2026-0308 (BGP Flap 60m)';
      } else if (i === 15) {
        avail = 99.988;
        isOutage = false;
      } else {
        avail = Number((99.985 + (Math.sin(i) * 0.012)).toFixed(3));
      }

      points.push({
        date: dateStr,
        actualAvailability: avail,
        slaThreshold: 99.95,
        isOutage,
        incidentName: incName
      });
    }

    return points;
  }
}

// Global Singleton instance
const globalStore = global as unknown as { __promiseBackStore?: PromiseBackStore };
export const store = globalStore.__promiseBackStore || new PromiseBackStore();

if (process.env.NODE_ENV !== 'production') {
  globalStore.__promiseBackStore = store;
}
