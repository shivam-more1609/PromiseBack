'use client';

import React from 'react';
import Link from 'next/link';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Entitlement } from '@/types';
import { ArrowUpRight, CheckCircle, Clock } from 'lucide-react';

interface PendingCompensationTableProps {
  cases: Entitlement[];
}

export default function PendingCompensationTable({ cases }: PendingCompensationTableProps) {
  const getStatusBadge = (status: Entitlement['status']) => {
    switch (status) {
      case 'approved':
        return <Badge variant="success" size="sm" dot>Approved</Badge>;
      case 'pending_approval':
        return <Badge variant="warning" size="sm" dot>Pending Dual-Approval</Badge>;
      case 'requires_review':
        return <Badge variant="danger" size="sm" dot>Requires Review</Badge>;
      case 'compensated':
        return <Badge variant="indigo" size="sm" dot>Compensated</Badge>;
      case 'not_eligible':
        return <Badge variant="neutral" size="sm">Not Eligible</Badge>;
      default:
        return <Badge variant="outline" size="sm">{status}</Badge>;
    }
  };

  return (
    <Card
      title="Pending Compensation Cases"
      subtitle="Contractual SLA breach remediation queue awaiting review & disbursement"
      action={
        <Link href="/entitlements">
          <Button variant="ghost" size="sm" icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
            View All Entitlements
          </Button>
        </Link>
      }
      padding="none"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#FAFBFD] border-b border-neutral-border text-neutral-secondary font-semibold">
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Incident</th>
              <th className="py-3 px-4">Contract SLA</th>
              <th className="py-3 px-4 text-right">Calculated Credit</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-border">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-secondary">
                  No pending compensation cases. All SLA covenants satisfied.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-neutral-primary block">{c.customerName}</span>
                    <span className="text-[11px] text-neutral-secondary block">{c.customerPlan}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-neutral-primary font-medium">{c.incidentNumber}</span>
                    </div>
                    <span className="text-[11px] text-neutral-secondary truncate max-w-xs block">
                      {c.incidentSummary}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-neutral-primary">{c.contractNumber}</span>
                    <span className="text-[11px] text-neutral-secondary block">
                      Target {c.calculation.contractedUptime}% (Measured {c.measuredUptime}%)
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-mono font-bold text-neutral-primary text-sm tabular-nums">
                      ${c.eligibleCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-neutral-secondary block">
                      {c.payoutMethod}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(c.status)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link href={`/compensation-review?caseId=${c.id}`}>
                      <Button variant="outline" size="sm">
                        Investigate
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
