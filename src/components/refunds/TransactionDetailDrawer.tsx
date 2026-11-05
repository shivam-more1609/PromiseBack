'use client';

import React from 'react';
import Drawer from '../ui/Drawer';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { RefundRecord, ServiceCreditRecord } from '@/types';
import { CreditCard, DollarSign, CheckCircle2, Clock, FileText, ArrowRight, ShieldCheck, Terminal } from 'lucide-react';

interface TransactionDetailDrawerProps {
  refund?: RefundRecord | null;
  credit?: ServiceCreditRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionDetailDrawer({
  refund,
  credit,
  isOpen,
  onClose
}: TransactionDetailDrawerProps) {
  if (!isOpen) return null;

  const isRefund = !!refund;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isRefund ? refund!.refundNumber : credit!.creditNumber}
      subtitle={isRefund ? `PayPal Capture Refund • ${refund!.customerName}` : `Invoice Service Credit • ${credit!.customerName}`}
      width="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-xs text-neutral-secondary">
            <ShieldCheck className="w-4 h-4 text-success" />
            <span>Audited & Cryptographically Chained</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-6 text-xs">
        {/* Top Financial Stat */}
        <div className="bg-white p-5 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-neutral-secondary block font-medium">Remedy Settled</span>
            <div className="text-3xl font-bold font-mono text-neutral-primary tabular-nums mt-1">
              ${(isRefund ? refund!.refundAmount : credit!.creditAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-neutral-secondary mt-0.5 block">
              Currency: <strong>{isRefund ? refund!.currency : credit!.currency}</strong>
            </span>
          </div>

          <Badge
            variant={
              (isRefund && refund!.status === 'completed') || (!isRefund && credit!.status === 'applied')
                ? 'success'
                : 'warning'
            }
            size="md"
            dot
          >
            {isRefund ? refund!.status.toUpperCase() : credit!.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>

        {/* Transaction Metadata */}
        <div className="bg-white p-4 rounded-xl border border-neutral-border space-y-3">
          <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider">
            {isRefund ? 'PayPal Capture & Refund Reconciliation' : 'Billing Account Schedule'}
          </h4>

          <div className="grid grid-cols-2 gap-4 pt-1 font-mono">
            <div>
              <span className="text-neutral-secondary text-[10px] block font-sans">Beneficiary Customer Account</span>
              <span className="font-semibold text-neutral-primary">
                {isRefund ? refund!.paypalAccount : credit!.billingAccount}
              </span>
            </div>

            <div>
              <span className="text-neutral-secondary text-[10px] block font-sans">
                {isRefund ? 'PayPal Target Capture ID' : 'Applicable Invoice Run'}
              </span>
              <span className="text-primary font-bold">
                {isRefund ? refund!.paypalCaptureId : credit!.applicableBillingPeriod}
              </span>
            </div>

            {isRefund && (
              <>
                <div>
                  <span className="text-neutral-secondary text-[10px] block font-sans">PayPal Refund ID (API Returned)</span>
                  <span className="text-neutral-primary font-semibold">
                    {refund!.paypalRefundId || 'Pending Execution'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-secondary text-[10px] block font-sans">Idempotency Request ID</span>
                  <span className="text-neutral-secondary text-[11px] truncate block">
                    {refund!.idempotencyRequestId}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Raw Payload Inspector */}
        {isRefund && refund!.rawPayload && (
          <div className="bg-[#0F172A] rounded-xl p-4 border border-[#1E293B] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
                <Terminal className="w-3.5 h-3.5 text-primary-light" />
                <span>PAYPAL REST API v2 /v2/payments/captures/&#123;id&#125;/refund RESPONSE</span>
              </div>
              <span className="text-[10px] bg-[#1E293B] text-slate-400 px-2 py-0.5 rounded font-mono">
                JSON
              </span>
            </div>
            <pre className="text-[11px] font-mono text-emerald-400 bg-black/40 p-3 rounded-lg overflow-x-auto max-h-60 leading-relaxed">
              {JSON.stringify(refund!.rawPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Drawer>
  );
}
