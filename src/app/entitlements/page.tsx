'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EntitlementDetailDrawer from '@/components/entitlements/EntitlementDetailDrawer';
import AgGridEntitlementsTable from '@/components/entitlements/AgGridEntitlementsTable';
import { Entitlement, EntitlementStatus } from '@/types';
import {
  Calculator,
  Search,
  Filter,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Table as TableIcon,
  Grid
} from 'lucide-react';

export default function EntitlementsPage() {
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedEntitlement, setSelectedEntitlement] = useState<Entitlement | null>(null);
  const [viewMode, setViewMode] = useState<'ag-grid' | 'standard'>('ag-grid');

  const fetchEntitlements = async () => {
    try {
      setLoading(true);
      const url = new URL('/api/entitlements', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (search) url.searchParams.set('customer', search);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setEntitlements(data.entitlements);
      }
    } catch (err) {
      console.error('Failed to fetch entitlements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, [statusFilter, search]);

  const totalCompensation = entitlements.reduce((sum, e) => sum + e.eligibleCredit, 0);

  const getStatusBadge = (status: EntitlementStatus) => {
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
      case 'rejected':
        return <Badge variant="outline" size="sm">Rejected</Badge>;
      default:
        return <Badge variant="outline" size="sm">{status}</Badge>;
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All Cases' },
    { id: 'eligible', label: 'Eligible' },
    { id: 'pending_approval', label: 'Pending Approval' },
    { id: 'requires_review', label: 'Requires Review' },
    { id: 'compensated', label: 'Compensated' },
    { id: 'not_eligible', label: 'Not Eligible' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Customer Entitlements
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Identify customers eligible for compensation under their contractual service commitments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-[#F1F4F9] p-0.5 rounded-lg border border-neutral-border mr-2">
            <button
              onClick={() => setViewMode('ag-grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'ag-grid'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>AG Grid Enterprise</span>
            </button>
            <button
              onClick={() => setViewMode('standard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'standard'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Classic View</span>
            </button>
          </div>

          <Link href="/compensation-review">
            <Button variant="primary" icon={<CheckCircle2 className="w-4 h-4" />}>
              Open Approval Queue
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Header Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Total Calculated Liability</span>
            <div className="text-2xl font-bold text-neutral-primary font-mono tabular-nums">
              ${totalCompensation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-2.5 bg-primary-light text-primary rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Pending Sign-off</span>
            <div className="text-2xl font-bold text-warning font-mono">
              {entitlements.filter(e => e.status === 'pending_approval').length} Cases
            </div>
          </div>
          <div className="p-2.5 bg-warning-bg text-warning rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Completed Disbursements</span>
            <div className="text-2xl font-bold text-success font-mono">
              {entitlements.filter(e => e.status === 'compensated').length} Paid
            </div>
          </div>
          <div className="p-2.5 bg-success-bg text-success rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Enterprise Filter Strip */}
      <div className="bg-white rounded-xl border border-neutral-border p-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by customer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Tab Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-primary text-white font-semibold'
                    : 'bg-[#F1F4F9] text-neutral-secondary hover:text-neutral-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AG Grid Enterprise View vs Classic Table */}
      {viewMode === 'ag-grid' ? (
        <AgGridEntitlementsTable
          entitlements={entitlements}
          onSelectEntitlement={(e) => setSelectedEntitlement(e)}
        />
      ) : (
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAFBFD] border-b border-neutral-border text-neutral-secondary font-semibold select-none">
                <th className="py-3 px-4">Case #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Subscription Plan</th>
                <th className="py-3 px-4">SLA Agreement</th>
                <th className="py-3 px-4">Affected Incident</th>
                <th className="py-3 px-4 text-right">Availability</th>
                <th className="py-3 px-4 text-right">Eligible Credit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-neutral-secondary animate-pulse">
                    Evaluating customer contractual covenants against ingested telemetry...
                  </td>
                </tr>
              ) : entitlements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-neutral-secondary">
                    No customer entitlements match the selected criteria.
                  </td>
                </tr>
              ) : (
                entitlements.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEntitlement(e)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-neutral-primary">
                      {e.caseNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-neutral-primary group-hover:text-primary transition-colors block">
                        {e.customerName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-secondary">
                      {e.customerPlan}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-primary">
                      {e.contractNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-neutral-primary font-medium">{e.incidentNumber}</span>
                      <span className="text-[11px] text-neutral-secondary block truncate max-w-[180px]">{e.incidentSummary}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span className={e.measuredUptime < e.calculation.contractedUptime ? 'text-danger font-bold' : 'text-success'}>
                        {e.measuredUptime.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-neutral-secondary block">
                        Target: {e.calculation.contractedUptime}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-neutral-primary text-sm tabular-nums">
                      ${e.eligibleCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-[10px] font-normal text-neutral-secondary block">{e.payoutMethod}</span>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(e.status)}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <Link href={`/compensation-review?caseId=${e.id}`}>
                        <Button variant="outline" size="sm">
                          Review Case
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
      )}

      {/* Row Click Drawer */}
      <EntitlementDetailDrawer
        entitlement={selectedEntitlement}
        isOpen={!!selectedEntitlement}
        onClose={() => setSelectedEntitlement(null)}
      />
    </div>
  );
}
