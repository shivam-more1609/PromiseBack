'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import TransactionDetailDrawer from '@/components/refunds/TransactionDetailDrawer';
import Modal from '@/components/ui/Modal';
import { RefundRecord, ServiceCreditRecord } from '@/types';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Send,
  FileText,
  AlertTriangle,
  RefreshCw,
  Info,
  ShieldCheck,
  Lock
} from 'lucide-react';

export default function RefundsPage() {
  const [activeTab, setActiveTab] = useState<'paypal' | 'credits'>('paypal');
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [serviceCredits, setServiceCredits] = useState<ServiceCreditRecord[]>([]);
  const [sandboxConfigured, setSandboxConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRefund, setSelectedRefund] = useState<RefundRecord | null>(null);
  const [selectedCredit, setSelectedCredit] = useState<ServiceCreditRecord | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const fetchRefundsAndCredits = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/refunds');
      const data = await res.json();
      if (data.success) {
        setRefunds(data.refunds);
        setServiceCredits(data.serviceCredits);
        setSandboxConfigured(!!data.sandboxConfigured);
        if (selectedRefund) {
          const updated = data.refunds.find((r: RefundRecord) => r.id === selectedRefund.id);
          if (updated) setSelectedRefund(updated);
        }
        if (selectedCredit) {
          const updated = data.serviceCredits.find((c: ServiceCreditRecord) => c.id === selectedCredit.id);
          if (updated) setSelectedCredit(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch refunds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefundsAndCredits();
  }, []);

  const handleExecutePayPal = async (refundId: string) => {
    setExecutingId(refundId);
    try {
      const response = await fetch('/api/refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promiseback-client': 'promiseback-web-console'
        },
        body: JSON.stringify({
          action: 'execute_paypal',
          id: refundId,
          actorName: 'Elena Rostova (Compliance & Payout Lead)'
        })
      });
      const data = await response.json();
      if (!data.success) {
        setErrorModal({
          isOpen: true,
          title: data.requiresSandboxConfig ? 'PayPal Sandbox Configuration Required' : 'Refund Execution Prevented',
          message: data.error || 'The financial transaction could not be executed.'
        });
      }
      await fetchRefundsAndCredits();
    } catch (err: any) {
      setErrorModal({
        isOpen: true,
        title: 'Network Communication Error',
        message: err.message || 'Failed to communicate with the payment server.'
      });
    } finally {
      setExecutingId(null);
    }
  };

  const handleApplyCredit = async (creditId: string) => {
    setExecutingId(creditId);
    try {
      const response = await fetch('/api/refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promiseback-client': 'promiseback-web-console'
        },
        body: JSON.stringify({
          action: 'apply_credit',
          id: creditId,
          actorName: 'Billing Cycle Lead'
        })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.error);
      }
      await fetchRefundsAndCredits();
    } catch (err) {
      alert('Failed to apply invoice credit');
    } finally {
      setExecutingId(null);
    }
  };

  const totalPayPalDisbursed = refunds
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + r.refundAmount, 0);

  const totalCreditsApplied = serviceCredits
    .filter(c => c.status === 'applied')
    .reduce((sum, c) => sum + c.creditAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Refunds & Service Credits
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Separate monetary payment capture refunds from upcoming invoice billing credits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRefundsAndCredits}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Sync Ledgers
          </Button>
        </div>
      </div>

      {/* Sandbox Compliance Banner */}
      <div className="bg-[#FAFBFD] border border-neutral-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary-light text-primary rounded-lg shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-primary">Financial Compliance Policy: Capture Refunds Mode</span>
              {sandboxConfigured ? (
                <Badge variant="success" size="sm" dot>Live Sandbox Connected</Badge>
              ) : (
                <Badge variant="warning" size="sm" dot>Sandbox Credentials Needed in .env.local</Badge>
              )}
            </div>
            <p className="text-neutral-secondary text-[11px] mt-0.5 max-w-2xl">
              Refunds execute against original PayPal payment captures (<code>POST /v2/payments/captures/&#123;id&#125;/refund</code>). Mocking is strictly disabled in compliance with financial audit controls.
            </p>
          </div>
        </div>
        <div className="text-[11px] text-neutral-secondary font-mono self-start sm:self-auto bg-white px-2.5 py-1 rounded border border-neutral-border">
          API: PayPal REST v2
        </div>
      </div>

      {/* KPI Header Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Capture Refunds Settled</span>
            <div className="text-2xl font-bold text-neutral-primary font-mono tabular-nums">
              ${totalPayPalDisbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-success">Direct PayPal capture reversals</span>
          </div>
          <div className="p-2.5 bg-primary-light text-primary rounded-lg">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Service Credits Applied</span>
            <div className="text-2xl font-bold text-neutral-primary font-mono tabular-nums">
              ${totalCreditsApplied.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-neutral-secondary">On-invoice deduction</span>
          </div>
          <div className="p-2.5 bg-success-bg text-success rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">PayPal Gateway Status</span>
            <div className="text-base font-bold text-neutral-primary flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${sandboxConfigured ? 'bg-success' : 'bg-warning'}`}></span>
              <span>{sandboxConfigured ? 'Sandbox Connected' : 'Sandbox Config Ready'}</span>
            </div>
            <span className="text-[10px] text-neutral-secondary font-mono">Capture Reversals Protected</span>
          </div>
          <div className="p-2.5 bg-[#EEEDFF] text-primary rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Distinct Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-border">
        <button
          onClick={() => setActiveTab('paypal')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'paypal'
              ? 'border-primary text-primary'
              : 'border-transparent text-neutral-secondary hover:text-neutral-primary'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>PAYPAL CAPTURE REFUNDS ({refunds.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('credits')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'credits'
              ? 'border-primary text-primary'
              : 'border-transparent text-neutral-secondary hover:text-neutral-primary'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>SERVICE CREDITS ({serviceCredits.length})</span>
        </button>
      </div>

      {/* Tab 1: PayPal Refunds Table */}
      {activeTab === 'paypal' && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAFBFD] border-b border-neutral-border text-neutral-secondary font-semibold">
                  <th className="py-3 px-4">Refund Reference</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">PayPal Capture ID</th>
                  <th className="py-3 px-4 text-right">Refund Amount</th>
                  <th className="py-3 px-4">PayPal Refund ID</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border">
                {refunds.map((refund) => (
                  <tr
                    key={refund.id}
                    onClick={() => setSelectedRefund(refund)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-neutral-primary">
                      {refund.refundNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-neutral-primary group-hover:text-primary transition-colors block">
                        {refund.customerName}
                      </span>
                      <span className="text-[11px] text-neutral-secondary block">{refund.paypalAccount}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-primary font-medium">
                      {refund.paypalCaptureId}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-neutral-primary text-sm tabular-nums">
                      ${refund.refundAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-secondary">
                      {refund.paypalRefundId ? (
                        <span className="text-primary font-medium">{refund.paypalRefundId}</span>
                      ) : (
                        <span className="text-neutral-muted">Pending Sandbox Execution</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-neutral-secondary">
                      {new Date(refund.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          refund.status === 'completed' ? 'success' :
                          refund.status === 'approved' ? 'warning' :
                          refund.status === 'processing' ? 'indigo' : 'danger'
                        }
                        size="sm"
                        dot
                      >
                        {refund.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {refund.status === 'approved' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={executingId === refund.id}
                          onClick={() => handleExecutePayPal(refund.id)}
                          icon={<Send className="w-3 h-3" />}
                        >
                          Execute Capture Refund
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRefund(refund)}
                        >
                          Inspect Receipt
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Service Credits Table */}
      {activeTab === 'credits' && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAFBFD] border-b border-neutral-border text-neutral-secondary font-semibold">
                  <th className="py-3 px-4">Credit Reference</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Billing Account</th>
                  <th className="py-3 px-4 text-right">Credit Amount</th>
                  <th className="py-3 px-4">Applicable Billing Period</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-border">
                {serviceCredits.map((credit) => (
                  <tr
                    key={credit.id}
                    onClick={() => setSelectedCredit(credit)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-neutral-primary">
                      {credit.creditNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-neutral-primary group-hover:text-primary transition-colors block">
                        {credit.customerName}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-secondary">
                      {credit.billingAccount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-neutral-primary text-sm tabular-nums">
                      ${credit.creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-neutral-secondary">
                      {credit.applicableBillingPeriod}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={credit.status === 'applied' ? 'success' : 'warning'}
                        size="sm"
                        dot
                      >
                        {credit.status === 'applied' ? 'APPLIED TO INVOICE' : 'PENDING RUN'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {credit.status === 'pending_invoice' ? (
                        <Button
                          variant="success"
                          size="sm"
                          loading={executingId === credit.id}
                          onClick={() => handleApplyCredit(credit.id)}
                        >
                          Apply to Invoice
                        </Button>
                      ) : (
                        <span className="text-[11px] font-mono text-neutral-secondary">
                          {credit.invoiceCreditId}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        refund={selectedRefund}
        credit={selectedCredit}
        isOpen={!!selectedRefund || !!selectedCredit}
        onClose={() => {
          setSelectedRefund(null);
          setSelectedCredit(null);
        }}
      />

      {/* Error / Sandbox Configuration Modal */}
      <Modal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, title: '', message: '' })}
        title={errorModal.title}
        subtitle="Financial Execution Notice"
        maxWidth="md"
        footer={
          <Button variant="outline" size="sm" onClick={() => setErrorModal({ isOpen: false, title: '', message: '' })}>
            Acknowledge
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="p-3 bg-warning-bg border border-[#FFE2B3] text-[#925B0E] rounded-lg flex items-start gap-2.5">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {errorModal.message}
            </p>
          </div>

          <div className="p-3 bg-[#FAFBFD] border border-neutral-border rounded-lg text-neutral-secondary text-[11px] space-y-1.5">
            <span className="font-semibold text-neutral-primary block">How to configure PayPal Sandbox:</span>
            <p>1. Open your PayPal Developer Dashboard at <code>developer.paypal.com</code>.</p>
            <p>2. Obtain your Sandbox Client ID and Secret under your App settings.</p>
            <p>3. Set <code>PAYPAL_SANDBOX_CLIENT_ID</code> and <code>PAYPAL_SANDBOX_CLIENT_SECRET</code> in <code>.env.local</code>.</p>
            <p>4. Execute the refund. PromiseBack will send <code>POST /v2/payments/captures/&#123;id&#125;/refund</code> with server-side idempotency.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
