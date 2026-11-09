'use client';

import React, { useState, useEffect } from 'react';
import Drawer from '../ui/Drawer';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ContractClauseVerification from './ContractClauseVerification';
import AiIntelligencePanel from '../ui/AiIntelligencePanel';
import { Contract } from '@/types';
import { FileText, Calendar, Clock, DollarSign, ShieldAlert, CheckCircle2, Download } from 'lucide-react';

interface ContractDetailDrawerProps {
  contract: Contract | null;
  isOpen: boolean;
  onClose: () => void;
  onContractUpdated: (updatedContract?: Contract) => void;
}

export default function ContractDetailDrawer({
  contract,
  isOpen,
  onClose,
  onContractUpdated
}: ContractDetailDrawerProps) {
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (contract && isOpen) {
      setLoadingAi(true);
      fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contract', entityId: contract.id })
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
  }, [contract, isOpen]);

  if (!contract) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={contract.customerName}
      subtitle={`${contract.contractNumber} • ${contract.slaName}`}
      width="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-xs text-neutral-secondary">
            <FileText className="w-4 h-4 text-primary" />
            <span>{contract.fileName} ({contract.fileSize})</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Drawer
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Uptime Target</span>
            <span className="text-base font-bold text-neutral-primary font-mono">{contract.uptimeTarget}%</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Explicit % Cap</span>
            <span className="text-base font-bold text-primary font-mono">
              {contract.explicitPercentageCap !== null && contract.explicitPercentageCap !== undefined
                ? `${contract.explicitPercentageCap}%`
                : (typeof contract.maxCompensationPercent === 'number'
                    ? `${contract.maxCompensationPercent}%`
                    : 'Not Specified')}
            </span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Monetary Ceiling</span>
            <span className="text-base font-bold text-neutral-primary font-mono">
              {contract.contractualMonetaryCeiling
                ? `100% ($${contract.contractualMonetaryCeiling.toLocaleString()})`
                : (contract.monthlyServiceFee ? `100% ($${contract.monthlyServiceFee.toLocaleString()})` : 'Not Specified')}
            </span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Max Credit Tier</span>
            <span className="text-base font-bold text-primary font-mono">
              {contract.maxServiceCreditTier ? `${contract.maxServiceCreditTier}%` : '20%'}
            </span>
          </div>
        </div>

        {/* Contract Validity & Status */}
        <div className="bg-white p-4 rounded-xl border border-neutral-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-primary">Contract Lifecycle Metadata</span>
            <Badge 
              variant={contract.status === 'active' ? 'success' : 'warning'} 
              size="sm" 
              dot
            >
              {contract.status === 'active' ? 'Active Covenant' : 'Requires Compliance Review'}
            </Badge>
            {contract.isDemo ? (
              <Badge variant="neutral" size="sm">
                Demo Seed
              </Badge>
            ) : (
              <Badge variant="indigo" size="sm">
                Uploaded PDF
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1 border-t border-neutral-border">
            <div>
              <span className="text-neutral-secondary">Effective Period:</span>
              <p className="font-medium text-neutral-primary mt-0.5">
                {contract.effectiveStartDate && contract.effectiveEndDate
                  ? `${contract.effectiveStartDate} → ${contract.effectiveEndDate}`
                  : (contract.effectiveStartDate || 'Not specified in source document')}
              </p>
            </div>
            <div>
              <span className="text-neutral-secondary">AI Extraction Confidence:</span>
              <p className="font-mono font-medium text-primary mt-0.5">
                {(contract.extractedConfidence * 100).toFixed(0)}%
              </p>
            </div>
            {contract.downtimeAllowanceMinutes && (
              <div>
                <span className="text-neutral-secondary">Downtime Allowance:</span>
                <p className="font-mono font-medium text-neutral-primary mt-0.5">
                  {contract.downtimeAllowanceMinutes} minutes / month
                </p>
              </div>
            )}
            {contract.monthlyServiceFee && (
              <div>
                <span className="text-neutral-secondary">Monthly Service Fee:</span>
                <p className="font-mono font-medium text-neutral-primary mt-0.5">
                  USD {contract.monthlyServiceFee.toLocaleString()}
                </p>
              </div>
            )}
            <div className="sm:col-span-2">
              <span className="text-neutral-secondary">Contractual Monetary Ceiling:</span>
              <p className="font-mono font-medium text-neutral-primary mt-0.5 text-[11px] leading-relaxed">
                {contract.contractualMonetaryCeilingText || (contract.monthlyServiceFee
                  ? `100% of relevant month fees (USD ${contract.monthlyServiceFee.toLocaleString()})`
                  : 'Not specified in source document')}
              </p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-neutral-secondary">Remedy Disbursement Policy:</span>
              <p className="font-medium text-neutral-primary mt-0.5">
                {contract.isCashRefundAllowed === false
                  ? 'Subsequent Invoice Credit (Credits are not redeemable for cash per Section 10; PayPal cash refunds prohibited)'
                  : (contract.disbursementMethodText || 'Direct Invoicing Credit or PayPal Reversal')}
              </p>
            </div>
          </div>
        </div>

        {/* Context-Aware AI Intelligence Assessment */}
        {aiAnalysis && (
          <AiIntelligencePanel
            analysis={aiAnalysis}
            loading={loadingAi}
          />
        )}

        {/* Compensation Tiers Matrix */}
        <div className="bg-white rounded-xl border border-neutral-border overflow-hidden">
          <div className="px-4 py-3 bg-[#FAFBFD] border-b border-neutral-border">
            <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider">
              Contractual Compensation Tiers
            </h4>
          </div>
          <div className="p-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-border text-neutral-secondary">
                  <th className="py-2">Availability Window</th>
                  <th className="py-2 text-right">Contract Remedy (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border font-mono">
                {contract.compensationTiers.map((tier, idx) => (
                  <tr key={idx} className="hover:bg-[#F8FAFC]">
                    <td className="py-2.5 text-neutral-primary">{tier.label}</td>
                    <td className="py-2.5 text-right font-bold text-primary">{tier.creditPercentage}% Credit</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Maintenance Exclusions */}
        <div className="bg-white p-4 rounded-xl border border-neutral-border">
          <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider mb-2.5">
            Maintenance & Outage Exclusions
          </h4>
          <ul className="space-y-1.5 pl-5 list-disc text-xs text-neutral-secondary marker:text-neutral-muted">
            {contract.maintenanceExclusions.map((exc, idx) => (
              <li key={idx} className="leading-relaxed">{exc}</li>
            ))}
          </ul>
        </div>

        {/* Clause-Level Verification Registry */}
        <ContractClauseVerification
          contractId={contract.id}
          clauses={contract.clauses}
          onClauseUpdated={onContractUpdated}
        />
      </div>
    </Drawer>
  );
}
