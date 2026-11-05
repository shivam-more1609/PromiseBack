'use client';

import React, { useState, useEffect } from 'react';
import Drawer from '../ui/Drawer';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import AiIntelligencePanel from '../ui/AiIntelligencePanel';
import { Entitlement } from '@/types';
import {
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Calculator,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface EntitlementDetailDrawerProps {
  entitlement: Entitlement | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EntitlementDetailDrawer({
  entitlement,
  isOpen,
  onClose
}: EntitlementDetailDrawerProps) {
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (entitlement && isOpen) {
      setLoadingAi(true);
      fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'entitlement', entityId: entitlement.id })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setAiAnalysis(data.analysis);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingAi(false));
    }
  }, [entitlement, isOpen]);

  if (!entitlement) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Entitlement Case ${entitlement.caseNumber}`}
      subtitle={`${entitlement.customerName} • ${entitlement.customerPlan}`}
      width="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Link href={`/compensation-review?caseId=${entitlement.id}`}>
            <Button variant="primary" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
              Open in Compensation Review
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Top Financial Strip */}
        <div className="bg-white p-5 rounded-xl border border-neutral-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-secondary uppercase tracking-wider block">
              Calculated Contractual Remedy
            </span>
            <div className="text-3xl font-bold text-neutral-primary font-mono tabular-nums mt-1">
              ${entitlement.eligibleCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-neutral-secondary mt-0.5 block">
              Remedy Method: <strong className="text-primary">{entitlement.payoutMethod}</strong>
            </span>
          </div>

          <div className="text-right">
            <Badge
              variant={
                entitlement.status === 'approved' ? 'success' :
                entitlement.status === 'compensated' ? 'indigo' :
                entitlement.status === 'pending_approval' ? 'warning' :
                entitlement.status === 'requires_review' ? 'danger' : 'neutral'
              }
              size="md"
              dot
            >
              {entitlement.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <span className="text-[10px] text-neutral-secondary block mt-1 font-mono">
              Ref: {entitlement.payoutReferenceId || 'Awaiting Approval'}
            </span>
          </div>
        </div>

        {/* Calculation Mathematical Breakdown */}
        <div className="bg-white rounded-xl border border-neutral-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider">
              Mathematical Calculation Breakdown
            </h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-neutral-border">
              <span className="text-[10px] text-neutral-secondary block font-sans">Target SLA</span>
              <span className="font-bold text-neutral-primary">{entitlement.calculation.contractedUptime}%</span>
            </div>

            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-neutral-border">
              <span className="text-[10px] text-neutral-secondary block font-sans">Measured Uptime</span>
              <span className="font-bold text-danger">{entitlement.calculation.measuredUptime}%</span>
            </div>

            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-neutral-border">
              <span className="text-[10px] text-neutral-secondary block font-sans">Breach Deficit</span>
              <span className="font-bold text-danger">-{entitlement.calculation.breachMagnitude}%</span>
            </div>

            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-neutral-border">
              <span className="text-[10px] text-neutral-secondary block font-sans">Applied Tier</span>
              <span className="font-bold text-primary">{entitlement.calculation.applicableTier.creditPercentage}% Credit</span>
            </div>
          </div>

          <div className="bg-[#FAFBFD] p-3.5 rounded-lg border border-neutral-border text-xs space-y-1">
            <span className="text-neutral-secondary text-[11px] block">Deterministic Formula:</span>
            <div className="font-mono font-semibold text-neutral-primary bg-white p-2 rounded border border-neutral-border">
              {entitlement.calculation.formula}
            </div>
            <span className="text-[11px] text-neutral-secondary block pt-1">
              Governed by clause: <strong className="text-neutral-primary">{entitlement.calculation.applicableClauseTitle}</strong>
            </span>
          </div>
        </div>

        {/* Context-Aware AI Intelligence Assessment */}
        {aiAnalysis && (
          <AiIntelligencePanel
            analysis={aiAnalysis}
            loading={loadingAi}
          />
        )}

        {/* Supporting Evidence Package */}
        <div className="bg-white p-5 rounded-xl border border-neutral-border space-y-3">
          <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider">
            Supporting Evidence & Telemetry Source
          </h4>
          <p className="text-xs text-neutral-secondary leading-relaxed bg-[#FAFBFD] p-3 rounded-lg border border-neutral-border">
            {entitlement.evidenceSummary}
          </p>
          <div className="flex items-center justify-between text-[11px] text-neutral-secondary pt-2 border-t border-neutral-border">
            <span>Data Ingestion: <strong className="text-neutral-primary">{entitlement.telemetrySource}</strong></span>
            <span className="font-mono">Incident {entitlement.incidentNumber}</span>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
