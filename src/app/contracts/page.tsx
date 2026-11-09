'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ContractUploadModal from '@/components/contracts/ContractUploadModal';
import ContractDetailDrawer from '@/components/contracts/ContractDetailDrawer';
import { Contract } from '@/types';
import {
  FileText,
  UploadCloud,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Layers
} from 'lucide-react';

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'requires_review'>('all');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      const url = new URL('/api/contracts', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (search) url.searchParams.set('search', search);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setContracts(data.contracts);
        // Refresh selected contract if already open
        setSelectedContract(prev => {
          if (!prev) return null;
          return data.contracts.find((c: Contract) => c.id === prev.id) || prev;
        });
      }
    } catch (err) {
      console.error('Failed to fetch contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [statusFilter, search]);

  const verifiedClausesCount = contracts.reduce(
    (sum, c) => sum + c.clauses.filter(cl => cl.status === 'human_verified').length,
    0
  );
  const totalClausesCount = contracts.reduce((sum, c) => sum + c.clauses.length, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Contract Intelligence
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Ingest SLA agreements, extract contractual thresholds and verify clause-level remedies.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsUploadOpen(true)}
          icon={<UploadCloud className="w-4 h-4" />}
        >
          Upload SLA Agreement
        </Button>
      </div>

      {/* Verification KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Active Contracts</span>
            <div className="text-xl font-bold text-neutral-primary font-mono">{contracts.length}</div>
          </div>
          <div className="p-2.5 bg-primary-light text-primary rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Clause Verification Rate</span>
            <div className="text-xl font-bold text-success font-mono">
              {totalClausesCount > 0 ? Math.round((verifiedClausesCount / totalClausesCount) * 100) : 100}%
            </div>
            <span className="text-[10px] text-neutral-secondary">{verifiedClausesCount} of {totalClausesCount} clauses confirmed</span>
          </div>
          <div className="p-2.5 bg-success-bg text-success rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Legal Review Queue</span>
            <div className="text-xl font-bold text-warning font-mono">
              {contracts.filter(c => c.status === 'requires_review').length}
            </div>
            <span className="text-[10px] text-neutral-secondary">Agreements with unverified terms</span>
          </div>
          <div className="p-2.5 bg-warning-bg text-warning rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-neutral-border">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by customer name, SLA number, or plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-xs text-neutral-secondary mr-1">Status:</span>
          {(['all', 'active', 'requires_review'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-primary text-white font-semibold'
                  : 'bg-[#F1F4F9] text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              {status === 'all' ? 'All Contracts' : status === 'active' ? 'Active' : 'Needs Review'}
            </button>
          ))}
        </div>
      </div>

      {/* Contract List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center bg-white rounded-xl border border-neutral-border animate-pulse text-xs text-neutral-secondary">
            Loading contractual intelligence database...
          </div>
        ) : contracts.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-neutral-border">
            <FileText className="w-10 h-10 text-neutral-muted mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-neutral-primary">No contracts found</h3>
            <p className="text-xs text-neutral-secondary mt-1">Upload a customer SLA PDF to begin automated clause extraction.</p>
          </div>
        ) : (
          contracts.map((contract) => (
            <div
              key={contract.id}
              onClick={() => setSelectedContract(contract)}
              className="bg-white hover:bg-[#FAFCFF] border border-neutral-border hover:border-primary/40 rounded-xl p-5 shadow-subtle cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#F6F8FC] border border-neutral-border flex items-center justify-center text-primary shrink-0 group-hover:bg-primary-light transition-colors">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-neutral-primary truncate group-hover:text-primary transition-colors">
                      {contract.customerName}
                    </h3>
                    <span className="font-mono text-xs bg-[#F1F4F9] px-2 py-0.5 rounded text-neutral-secondary border border-neutral-border">
                      {contract.contractNumber}
                    </span>
                    <Badge
                      variant={contract.status === 'active' ? 'success' : 'warning'}
                      size="sm"
                      dot
                    >
                      {contract.status === 'active' ? 'Active SLA' : 'Requires Legal Review'}
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

                  <p className="text-xs text-neutral-secondary mt-1">
                    {contract.slaName} • <span className="font-mono">{contract.fileName}</span> ({contract.fileSize})
                  </p>

                  <div className="flex items-center gap-4 text-xs text-neutral-secondary mt-2 flex-wrap">
                    <span>Target: <strong className="text-neutral-primary font-mono">{contract.uptimeTarget}%</strong></span>
                    <span>Window: <strong className="text-neutral-primary">{contract.measurementPeriod}</strong></span>
                    <span>Explicit Percentage Cap: <strong className="text-neutral-primary font-mono">
                      {contract.explicitPercentageCap !== null && contract.explicitPercentageCap !== undefined
                        ? `${contract.explicitPercentageCap}%`
                        : (typeof contract.maxCompensationPercent === 'number'
                            ? `${contract.maxCompensationPercent}%`
                            : 'Not Specified')}
                    </strong></span>
                    <span>Monetary Ceiling: <strong className="text-neutral-primary font-mono">
                      {contract.contractualMonetaryCeiling
                        ? `USD ${contract.contractualMonetaryCeiling.toLocaleString()}`
                        : (contract.monthlyServiceFee ? `USD ${contract.monthlyServiceFee.toLocaleString()}` : 'Not Specified')}
                    </strong></span>
                    <span>Maximum Listed Credit Tier: <strong className="text-primary font-mono">
                      {contract.maxServiceCreditTier ? `${contract.maxServiceCreditTier}%` : '20%'}
                    </strong></span>
                    <span>Clauses: <strong className="text-neutral-primary font-mono">
                      {contract.clauses.filter(c => c.status === 'human_verified').length}/{contract.clauses.length} Verified
                    </strong></span>
                  </div>
                </div>
              </div>

              {/* Right Side Info & Action */}
              <div className="flex items-center gap-4 self-end md:self-auto shrink-0">
                <div className="text-right hidden sm:block">
                  <span className="text-[11px] text-neutral-secondary block">AI Confidence</span>
                  <span className="font-mono text-xs font-semibold text-primary">
                    {(contract.extractedConfidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>

                <div className="p-2 text-neutral-secondary group-hover:text-primary transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      <ContractUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onContractUploaded={fetchContracts}
      />

      {/* Detail Drawer */}
      <ContractDetailDrawer
        contract={selectedContract}
        isOpen={!!selectedContract}
        onClose={() => setSelectedContract(null)}
        onContractUpdated={(updated) => {
          if (updated) {
            setSelectedContract(updated);
            setContracts(prev => prev.map(c => c.id === updated.id ? updated : c));
          }
          fetchContracts();
        }}
      />
    </div>
  );
}
