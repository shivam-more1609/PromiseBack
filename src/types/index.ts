export type VerificationStatus = 'ai_extracted' | 'human_verified' | 'requires_review';

export interface SLATier {
  uptimeThreshold: number; // e.g. 99.95
  creditPercentage: number; // e.g. 10 (%)
  minUptime?: number; // Lower bound (inclusive) e.g. 99.50
  maxUptime?: number; // Upper bound (exclusive) e.g. 99.95
  label: string; // e.g. "99.50% - 99.94% (10% Credit)"
}

export interface SLAClause {
  id: string;
  section: string;
  title: string;
  content: string;
  confidence: number; // 0 to 1
  status: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
  sourceCitation?: {
    pageNumber?: number;
    paragraphNumber?: number;
    exactMatchSnippet?: string;
  };
}

export interface Contract {
  id: string;
  contractNumber: string;
  customerId: string;
  customerName: string;
  slaName: string;
  uptimeTarget: number; // e.g. 99.95 (%)
  measurementPeriod: 'Monthly' | 'Quarterly' | 'Annual';
  claimDeadlineDays: number; // e.g. 30 days after period end
  compensationTiers: SLATier[];
  maintenanceExclusions: string[];
  maxCompensationPercent: number; // e.g. 50 (%)
  effectiveStartDate: string;
  effectiveEndDate: string;
  status: 'active' | 'requires_review' | 'expired';
  extractedConfidence: number;
  uploadedAt: string;
  fileName: string;
  fileSize: string;
  clauses: SLAClause[];
  rawTextPreview?: string;
}

export type IncidentSeverity = 'P1 - Critical' | 'P2 - Major' | 'P3 - Minor';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  phase: 'detection' | 'impact' | 'mitigation' | 'recovery' | 'resolved';
  actor: string;
}

export interface TelemetryPoint {
  time: string;
  availability: number;
  latencyMs: number;
  errorRate: number;
}

export interface Incident {
  id: string;
  incidentNumber: string;
  service: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  rootCause: string;
  startedAt: string;
  detectedAt: string;
  mitigatedAt: string;
  resolvedAt: string;
  durationMinutes: number;
  affectedRegions: string[];
  affectedCustomerIds: string[];
  affectedCustomersCount: number;
  telemetry: TelemetryPoint[];
  timeline: TimelineEvent[];
  slaBreached: boolean;
  slaImpactAnalysis: string;
  isPlannedMaintenance?: boolean;
  maintenanceWindow?: string;
}

export interface Customer {
  id: string;
  name: string;
  domain: string;
  plan: 'Enterprise Tier 1' | 'Enterprise Tier 2' | 'Growth' | 'Custom';
  monthlySpend: number;
  billingEmail: string;
  paypalEmail: string;
  paypalCaptureId?: string; // Actual or sandbox capture ID from captured subscription
  refundableBalance?: number; // Current remaining unrefunded balance
  slaContractId: string;
  contractNumber: string;
  region: string;
  currency?: string; // Default USD
  paymentMethod: 'PayPal Refund' | 'Direct Invoicing Credit' | 'PayPal Payout';
}

export type EntitlementStatus = 
  | 'eligible'
  | 'not_eligible'
  | 'requires_review'
  | 'pending_approval'
  | 'pending_executive_approval'
  | 'approved'
  | 'partially_compensated'
  | 'compensated'
  | 'rejected'
  | 'ineligible';

export interface CalculationDetail {
  contractedUptime: number; // e.g. 99.95
  measuredUptime: number; // e.g. 99.912
  outageMinutes: number; // e.g. 38 minutes
  totalPeriodMinutes: number; // 43,200 for 30-day month
  breachMagnitude: number; // e.g. 0.038%
  applicableTier: SLATier;
  formula: string; // "Monthly Base Fee ($14,500) × 10% SLA Credit Tier"
  baseAmount: number;
  creditAmount: number;
  calculatedAt: string;
  applicableClauseId: string;
  applicableClauseTitle: string;
  cumulativePeriodDowntimeMinutes?: number;
  cumulativePeriodCredits?: number;
  measurementPeriodScope?: string;
}

export interface Entitlement {
  id: string;
  caseNumber: string;
  customerId: string;
  customerName: string;
  customerPlan: string;
  contractId: string;
  contractNumber: string;
  incidentId: string;
  incidentNumber: string;
  incidentSummary: string;
  measuredUptime: number;
  eligibleCredit: number;
  status: EntitlementStatus;
  calculation: CalculationDetail;
  evidenceSummary: string;
  telemetrySource: string;
  billingPeriodKey: string; // e.g. "2026-11"
  idempotencyKey: string;
  isClaimDeadlineExpired?: boolean;
  totalRefundedAmount?: number;
  remainingRefundableAmount?: number;
  currency?: string;
  approvalHistory: {
    requestedAt: string;
    reviewedBy?: string;
    reviewedAt?: string;
    decision?: 'approved' | 'rejected' | 'review_requested';
    notes?: string;
  }[];
  dualApprovalRequired?: boolean;
  firstApproval?: {
    approver: string;
    role: string;
    approvedAt: string;
    boundAmount: number;
    notes?: string;
  };
  secondApproval?: {
    approver: string;
    role: string;
    approvedAt: string;
    boundAmount: number;
    notes?: string;
  };
  approvalExpiresAt?: string;
  payoutMethod: 'PayPal Refund' | 'Service Credit';
  payoutReferenceId?: string;
}

export type PayoutStatus = 'requested' | 'approved' | 'processing' | 'completed' | 'failed' | 'pending_reconciliation';

export interface RefundRecord {
  id: string;
  refundNumber: string;
  entitlementId: string;
  customerId: string;
  customerName: string;
  paypalAccount: string;
  paypalCaptureId: string; // Real or sandbox capture ID
  originalPaymentId?: string;
  refundAmount: number;
  currency: string;
  paypalBatchId?: string;
  paypalRefundId?: string; // Real PayPal Refund ID from POST /v2/payments/captures/{id}/refund
  paypalTransactionId?: string;
  idempotencyRequestId: string; // PayPal-Request-Id header value
  feeAmount: number;
  status: PayoutStatus;
  createdAt: string;
  executedAt?: string;
  failureReason?: string;
  rawPayload?: Record<string, any>;
  liveSandboxExecution?: boolean;
}

export interface ServiceCreditRecord {
  id: string;
  creditNumber: string;
  entitlementId: string;
  customerId: string;
  customerName: string;
  billingAccount: string;
  creditAmount: number;
  currency: string;
  applicableBillingPeriod: string;
  invoiceCreditId?: string;
  status: 'pending_invoice' | 'applied' | 'expired';
  createdAt: string;
  appliedAt?: string;
}

export interface GenuineCaptureRecord {
  id: string;
  customerId: string;
  customerName: string;
  paypalOrderId: string;
  paypalCaptureId: string;
  amount: number;
  currency: string;
  status: string;
  capturedAt: string;
  rawPayload?: Record<string, any>;
}

export type AuditCategory = 
  | 'CONTRACT'
  | 'INCIDENT'
  | 'CALCULATION'
  | 'APPROVAL'
  | 'PAYPAL_PAYOUT'
  | 'PAYPAL_REFUND'
  | 'PAYPAL_CAPTURE'
  | 'FINANCIAL'
  | 'SYSTEM';

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: AuditCategory;
  eventType: string;
  description: string;
  actor: {
    type: 'HUMAN' | 'SYSTEM_AI' | 'SYSTEM' | 'WEBHOOK';
    name: string;
    email?: string;
  };
  entityId: string;
  entityType: 'Contract' | 'Incident' | 'Entitlement' | 'Refund' | 'ServiceCredit' | 'Capture' | 'Payment' | 'Customer';
  hash: string;
  previousHash: string;
  metadata?: Record<string, any>;
}

export interface DashboardStats {
  activeContracts: number;
  activeIncidents: number;
  creditsOwed: number;
  pendingApprovals: number;
  totalCustomersProtected: number;
  totalCompensatedThisMonth: number;
  averageUptimeCurrentMonth: number;
  targetUptime: number;
  operationalIntelligence: {
    breachedIncidentsCount: number;
    casesRequiringReviewCount: number;
    estimatedCompensation: number;
    recommendedActions: string[];
  };
}

export interface AvailabilityTimeSeriesPoint {
  date: string;
  actualAvailability: number;
  slaThreshold: number;
  isOutage: boolean;
  incidentName?: string;
}
