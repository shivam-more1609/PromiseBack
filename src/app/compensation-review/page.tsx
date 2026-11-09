'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import AiIntelligencePanel from '@/components/ui/AiIntelligencePanel';
import Modal from '@/components/ui/Modal';
import { Entitlement, Contract, Incident } from '@/types';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Calculator,
  FileText,
  Clock,
  Activity,
  DollarSign,
  User,
  ArrowRight,
  ExternalLink,
  CreditCard
} from 'lucide-react';

function CompensationReviewContent() {
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('caseId');

  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [selectedCase, setSelectedCase] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  const [notes, setNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  const fetchEntitlements = async (preferredId?: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/entitlements');
      const data = await res.json();
      if (data.success && data.entitlements.length > 0) {
        setEntitlements(data.entitlements);
        const match = preferredId
          ? data.entitlements.find((e: Entitlement) => e.id === preferredId)
          : caseIdParam
          ? data.entitlements.find((e: Entitlement) => e.id === caseIdParam)
          : data.entitlements.find((e: Entitlement) => e.status === 'pending_approval') || data.entitlements[0];
        
        setSelectedCase(match || data.entitlements[0]);
      }
    } catch (err) {
      console.error('Failed to load entitlements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, [caseIdParam]);

  useEffect(() => {
    if (selectedCase) {
      fetch('/api/ai/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'entitlement', entityId: selectedCase.id })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) setAiAnalysis(data.analysis);
        })
        .catch(console.error);
    }
  }, [selectedCase]);

  const handleDecision = async (decision: 'approved' | 'rejected' | 'review_requested') => {
    if (!selectedCase) return;

    setSubmittingAction(true);
    setActionSuccessMsg('');

    try {
      const isStage2 = selectedCase.status === 'pending_executive_approval';
      const reviewedBy = isStage2 
        ? 'Victoria Sterling (Executive Legal Counsel)' 
        : 'Elena Rostova (Lead Finance Controller)';
      const role = isStage2 ? 'LEGAL_COUNSEL' : 'FINANCE_CONTROLLER';

      const response = await fetch('/api/approvals', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entitlementId: selectedCase.id,
          decision,
          reviewedBy,
          role,
          notes: decision === 'rejected' ? rejectReason : notes || (isStage2 ? 'Stage 2 executive sign-off confirmed.' : 'Stage 1 primary financial review approved.')
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to record approval decision.');
      }

      if (decision === 'approved') {
        if (data.stage === 'first_approval') {
          setActionSuccessMsg(`Case ${selectedCase.caseNumber} Stage 1 Approved! Claim exceeds $2,500.00 executive threshold. Awaiting Stage 2 sign-off by Legal Counsel.`);
        } else {
          setActionSuccessMsg(`Case ${selectedCase.caseNumber} Approved! ${selectedCase.payoutMethod === 'PayPal Refund' ? 'PayPal capture refund authorized for Sandbox execution.' : 'Service credit queued for invoice run.'}`);
        }
      } else if (decision === 'rejected') {
        setActionSuccessMsg(`Case ${selectedCase.caseNumber} Rejected. Audit record permanently logged.`);
      } else {
        setActionSuccessMsg(`Case ${selectedCase.caseNumber} returned to Compliance team for review.`);
      }

      setShowRejectModal(false);
      setRejectReason('');
      setNotes('');
      // Refresh list and maintain updated case
      await fetchEntitlements(selectedCase.id);
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-neutral-border animate-pulse text-xs text-neutral-secondary">
        Loading financial compensation cases...
      </div>
    );
  }

  if (!selectedCase) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-neutral-border">
        <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-neutral-primary">Zero Cases Pending Approval</h3>
        <p className="text-xs text-neutral-secondary mt-1">All contractual entitlements have been reviewed and finalized.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
              Compensation Review
            </h1>
            <Badge
              variant={
                selectedCase.status === 'approved' ? 'success' :
                selectedCase.status === 'pending_approval' ? 'warning' :
                selectedCase.status === 'requires_review' ? 'danger' : 'neutral'
              }
              size="sm"
              dot
            >
              {selectedCase.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {aiAnalysis?.completenessScore !== undefined && (
              <Badge
                variant={aiAnalysis.completenessScore >= 80 ? 'success' : aiAnalysis.completenessScore >= 60 ? 'warning' : 'danger'}
                size="sm"
              >
                Evidence Score: {aiAnalysis.completenessScore}%
              </Badge>
            )}
          </div>
          <p className="text-xs text-neutral-secondary mt-1">
            Dual-approval investigation workbench: Contractual covenants vs Telemetry evidence.
          </p>
        </div>

        {/* Case Switcher */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-secondary">Select Case:</label>
          <select
            value={selectedCase.id}
            onChange={(e) => {
              const found = entitlements.find(ent => ent.id === e.target.value);
              if (found) setSelectedCase(found);
            }}
            className="px-3 py-1.5 bg-white border border-neutral-border rounded-lg text-xs font-semibold text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {entitlements.map(e => (
              <option key={e.id} value={e.id}>
                {e.caseNumber} - {e.customerName} (${e.eligibleCredit.toFixed(2)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMsg && (
        <div className="p-4 bg-[#E8F7F1] border border-[#C3EAD9] rounded-xl text-success flex items-center justify-between text-xs font-medium animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg('')} className="text-xs font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Structured Two-Column Investigation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* =================================================== */}
        {/* LEFT PANEL: CONTRACTUAL OBLIGATION                   */}
        {/* =================================================== */}
        <div className="space-y-4">
          <Card
            title="Contractual Obligation"
            subtitle="Governing SLA covenants, baseline availability thresholds and penalty tiers"
            badge={<Badge variant="indigo" size="sm">Legal Instrument</Badge>}
            padding="md"
          >
            <div className="space-y-4 text-xs">
              {/* Top Covenant Overview */}
              <div className="bg-[#FAFBFD] p-3.5 rounded-lg border border-neutral-border grid grid-cols-2 gap-3">
                <div>
                  <span className="text-neutral-secondary text-[11px] block">Contract Master Agreement</span>
                  <span className="font-mono font-bold text-neutral-primary text-sm">{selectedCase.contractNumber}</span>
                </div>
                <div>
                  <span className="text-neutral-secondary text-[11px] block">Governing Covenant Clause</span>
                  <span className="font-semibold text-primary block truncate">{selectedCase.calculation.applicableClauseTitle}</span>
                </div>
              </div>

              {/* Mathematical Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                <div className="bg-white p-3 rounded-lg border border-neutral-border">
                  <span className="text-[10px] text-neutral-secondary block font-sans">Contract Target</span>
                  <span className="text-base font-bold text-neutral-primary">
                    {selectedCase.calculation.contractedUptime}%
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-neutral-border">
                  <span className="text-[10px] text-neutral-secondary block font-sans">Actual Measured</span>
                  <span className="text-base font-bold text-danger">
                    {selectedCase.calculation.measuredUptime}%
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-neutral-border col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-neutral-secondary block font-sans">Deficit Magnitude</span>
                  <span className="text-base font-bold text-danger">
                    -{selectedCase.calculation.breachMagnitude}%
                  </span>
                </div>
              </div>

              {/* Tier Matrix */}
              <div className="p-3.5 bg-white rounded-lg border border-neutral-border space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-secondary">Triggered Compensation Tier:</span>
                  <Badge variant="danger" size="sm">
                    {selectedCase.calculation.applicableTier.creditPercentage}% Remedy
                  </Badge>
                </div>
                <div className="font-mono text-neutral-primary text-xs bg-[#F8FAFC] p-2 rounded border border-neutral-border">
                  {selectedCase.calculation.applicableTier.label}
                </div>
              </div>

              {/* Calculation Formula */}
              <div className="p-3.5 bg-white rounded-lg border border-neutral-border space-y-2">
                <span className="text-[11px] text-neutral-secondary block">Deterministic Remedy Calculation:</span>
                <div className="font-mono font-bold text-sm text-neutral-primary bg-[#F1F4F9] p-2.5 rounded border border-neutral-border">
                  {selectedCase.calculation.formula}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-neutral-secondary text-[11px]">Calculated Remedy Amount:</span>
                  <span className="text-lg font-bold font-mono text-primary tabular-nums">
                    ${selectedCase.calculation.creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* =================================================== */}
        {/* RIGHT PANEL: SUPPORTING EVIDENCE                    */}
        {/* =================================================== */}
        <div className="space-y-4">
          <Card
            title="Supporting Telemetry Evidence"
            subtitle="System monitoring logs, incident timestamps and tenant mapping audit"
            badge={<Badge variant="success" size="sm">Verified Telemetry</Badge>}
            padding="md"
          >
            <div className="space-y-4 text-xs">
              {/* Incident Summary */}
              <div className="bg-[#FAFBFD] p-3.5 rounded-lg border border-neutral-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-neutral-primary">{selectedCase.incidentNumber}</span>
                  <Badge variant="danger" size="sm">P1 Outage (38m)</Badge>
                </div>
                <p className="text-neutral-primary font-medium">{selectedCase.incidentSummary}</p>
              </div>

              {/* Evidence & Telemetry Narrative */}
              <div className="p-3.5 bg-white rounded-lg border border-neutral-border space-y-2">
                <span className="text-[11px] text-neutral-secondary uppercase tracking-wider block font-semibold">
                  Evidence Narrative
                </span>
                <p className="text-xs text-neutral-secondary leading-relaxed bg-[#F8FAFC] p-3 rounded border border-neutral-border font-serif">
                  {selectedCase.evidenceSummary}
                </p>
              </div>

              {/* Source Data Probe & Mapping */}
              <div className="p-3.5 bg-white rounded-lg border border-neutral-border space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-secondary">Telemetry Source:</span>
                  <span className="font-mono text-neutral-primary font-medium">{selectedCase.telemetrySource}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-neutral-border">
                  <span className="text-neutral-secondary">Customer Tenant UUID:</span>
                  <span className="font-mono text-neutral-primary">{selectedCase.customerId}</span>
                </div>
              </div>

              {/* Context-Aware AI Intelligence Summary */}
              {aiAnalysis && (
                <div className="pt-2">
                  <AiIntelligencePanel
                    analysis={aiAnalysis}
                    className="border-neutral-border shadow-none"
                  />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* =================================================== */}
      {/* BOTTOM ACTION SECTION                               */}
      {/* =================================================== */}
      <div className="bg-white border border-neutral-border rounded-xl p-5 shadow-elevated">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Customer & Proposed Compensation Details */}
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-[11px] text-neutral-secondary block font-medium">Customer Enterprise</span>
              <span className="text-sm font-bold text-neutral-primary">{selectedCase.customerName}</span>
              <span className="text-[11px] text-neutral-secondary block">{selectedCase.customerPlan}</span>
            </div>

            <div className="border-l border-neutral-border pl-6">
              <span className="text-[11px] text-neutral-secondary block font-medium">Proposed Remedy</span>
              <span className="text-2xl font-bold font-mono text-neutral-primary tabular-nums">
                ${selectedCase.eligibleCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="border-l border-neutral-border pl-6">
              <span className="text-[11px] text-neutral-secondary block font-medium">Payment Execution Method</span>
              <div className="flex items-center gap-1.5 mt-0.5 font-semibold text-primary">
                <CreditCard className="w-4 h-4" />
                <span>{selectedCase.payoutMethod}</span>
              </div>
              <span className="text-[10px] text-neutral-secondary block">Automated API Dispatch</span>
            </div>

            <div className="border-l border-neutral-border pl-6">
              <span className="text-[11px] text-neutral-secondary block font-medium">Approval Status</span>
              <div className="mt-1">
                <Badge
                  variant={
                    selectedCase.status === 'approved' ? 'success' :
                    selectedCase.status === 'pending_approval' ? 'warning' :
                    selectedCase.status === 'pending_executive_approval' ? 'indigo' :
                    selectedCase.status === 'compensated' ? 'indigo' : 'neutral'
                  }
                  size="md"
                  dot
                >
                  {selectedCase.status === 'pending_executive_approval'
                    ? 'STAGE 2: AWAITING EXECUTIVE SIGN-OFF'
                    : selectedCase.status.replace(/_/g, ' ').toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {selectedCase.status !== 'approved' && selectedCase.status !== 'compensated' ? (
              <>
                <Button
                  variant="outline"
                  size="md"
                  loading={submittingAction}
                  onClick={() => handleDecision('review_requested')}
                  icon={<HelpCircle className="w-4 h-4 text-warning" />}
                >
                  Request Secondary Review
                </Button>

                <Button
                  variant="outline"
                  size="md"
                  loading={submittingAction}
                  onClick={() => setShowRejectModal(true)}
                  icon={<XCircle className="w-4 h-4 text-danger" />}
                  className="hover:bg-danger-bg hover:text-danger hover:border-danger/30"
                >
                  Reject Claim
                </Button>

                <Button
                  variant="success"
                  size="md"
                  loading={submittingAction}
                  onClick={() => handleDecision('approved')}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  {selectedCase.status === 'pending_executive_approval'
                    ? 'Grant Executive Sign-off (Stage 2)'
                    : (selectedCase.eligibleCredit > 2500 ? 'Grant Stage 1 Review' : 'Approve Compensation')}
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-success font-semibold flex items-center gap-1.5 bg-success-bg px-3 py-2 rounded-lg border border-[#C3EAD9]">
                  <CheckCircle2 className="w-4 h-4" />
                  Remedy Approved by Finance Lead
                </span>
                <Link href="/refunds">
                  <Button variant="primary" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                    View in Refunds & Credits
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Compensation Claim"
        subtitle={`Record reason for rejecting Case ${selectedCase.caseNumber}`}
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDecision('rejected')}
              disabled={!rejectReason}
              loading={submittingAction}
            >
              Confirm Rejection
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <label className="block font-medium text-neutral-secondary">
            Reason for Rejection *
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Outage fell under scheduled Sunday maintenance exclusion (Clause 5.1)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-neutral-primary text-xs focus:outline-none focus:ring-2 focus:ring-danger/20"
          />
          <p className="text-[11px] text-neutral-secondary">
            Rejection reasoning is stored with cryptographic hash in the immutable audit ledger.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export default function CompensationReviewPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-neutral-secondary">Loading compensation review...</div>}>
      <CompensationReviewContent />
    </Suspense>
  );
}
