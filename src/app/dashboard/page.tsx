import React from 'react';
import { store } from '@/lib/store';
import KpiCard from '@/components/dashboard/KpiCard';
import PerformanceChart from '@/components/dashboard/PerformanceChart';
import OperationalIntelligencePanel from '@/components/dashboard/OperationalIntelligencePanel';
import PendingCompensationTable from '@/components/dashboard/PendingCompensationTable';
import RecentIncidentsTable from '@/components/dashboard/RecentIncidentsTable';
import { FileText, AlertTriangle, DollarSign, CheckCircle2 } from 'lucide-react';

export const revalidate = 0; // Dynamic server component

export default async function DashboardPage() {
  const stats = store.getDashboardStats();
  const timeSeries = store.getAvailabilityTimeSeries();
  const incidents = store.getIncidents();
  const entitlements = store.getEntitlements();

  const pendingCases = entitlements.filter(
    e => e.status === 'pending_approval' || e.status === 'requires_review'
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Service Recovery Overview
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Monitor service commitments, customer entitlements and outstanding compensation.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-secondary">Last Ingestion:</span>
          <span className="font-mono bg-white px-2 py-1 rounded border border-neutral-border font-medium text-neutral-primary">
            Today, 15:02 UTC
          </span>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Active SLA Agreements"
          value={stats.activeContracts}
          description="Protected enterprise accounts"
          icon={<FileText className="w-5 h-5 text-primary" />}
          trend={{ value: "+1 this month", isPositive: true, label: "contracts" }}
        />

        <KpiCard
          title="Monitored Incidents (MTD)"
          value={stats.activeIncidents === 0 ? "0 Active" : `${stats.activeIncidents} Active`}
          description="2 SLA breach incidents recorded"
          icon={<AlertTriangle className="w-5 h-5 text-warning" />}
          trend={{ value: "2 breaches", isPositive: false, label: "breaches" }}
        />

        <KpiCard
          title="Customer Credits Owed"
          value={`$${stats.creditsOwed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          description="Awaiting dual-approval disbursement"
          icon={<DollarSign className="w-5 h-5 text-primary" />}
          trend={{ value: "85% via PayPal", isNeutral: true, label: "payout" }}
          highlight
        />

        <KpiCard
          title="Pending Approvals"
          value={stats.pendingApprovals}
          description="Cases requiring executive sign-off"
          icon={<CheckCircle2 className="w-5 h-5 text-success" />}
          trend={{ value: "Action required", isPositive: false, label: "review" }}
        />
      </div>

      {/* Operational Intelligence Alert Panel */}
      <OperationalIntelligencePanel
        breachedIncidentsCount={stats.operationalIntelligence.breachedIncidentsCount}
        casesRequiringReviewCount={stats.operationalIntelligence.casesRequiringReviewCount}
        creditsOwed={stats.operationalIntelligence.estimatedCompensation}
      />

      {/* Main SLA Performance Overview Time-Series */}
      <PerformanceChart data={timeSeries} />

      {/* Two Column Grid for Recent Incidents and Pending Cases */}
      <div className="grid grid-cols-1 gap-6">
        <PendingCompensationTable cases={pendingCases} />
        <RecentIncidentsTable incidents={incidents} />
      </div>
    </div>
  );
}
