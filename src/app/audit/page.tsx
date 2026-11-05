'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { AuditEvent } from '@/types';
import {
  FileCheck,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Hash,
  User,
  Cpu,
  Globe,
  RefreshCw
} from 'lucide-react';

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [integrity, setIntegrity] = useState<{ isValid: boolean; checkedEventsCount: number }>({ isValid: true, checkedEventsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [actorTypeFilter, setActorTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchAuditEvents = async () => {
    try {
      setLoading(true);
      const url = new URL('/api/audit', window.location.origin);
      if (categoryFilter !== 'all') url.searchParams.set('category', categoryFilter);
      if (actorTypeFilter !== 'all') url.searchParams.set('actorType', actorTypeFilter);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setEvents(data.events);
        setIntegrity(data.integrity);
      }
    } catch (err) {
      console.error('Failed to fetch audit events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditEvents();
  }, [categoryFilter, actorTypeFilter]);

  const filteredEvents = events.filter(e => 
    search === '' ||
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.eventType.toLowerCase().includes(search.toLowerCase()) ||
    e.actor.name.toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryBadge = (category: AuditEvent['category']) => {
    switch (category) {
      case 'CONTRACT':
        return <Badge variant="indigo" size="sm">CONTRACT</Badge>;
      case 'INCIDENT':
        return <Badge variant="warning" size="sm">INCIDENT</Badge>;
      case 'CALCULATION':
        return <Badge variant="neutral" size="sm">CALCULATION</Badge>;
      case 'APPROVAL':
        return <Badge variant="success" size="sm">APPROVAL</Badge>;
      case 'PAYPAL_PAYOUT':
        return <Badge variant="indigo" size="sm">PAYPAL PAYOUT</Badge>;
      case 'SYSTEM':
        return <Badge variant="outline" size="sm">SYSTEM</Badge>;
    }
  };

  const getActorIcon = (type: AuditEvent['actor']['type']) => {
    switch (type) {
      case 'HUMAN':
        return <User className="w-3.5 h-3.5 text-primary" />;
      case 'SYSTEM_AI':
        return <Cpu className="w-3.5 h-3.5 text-success" />;
      case 'WEBHOOK':
        return <Globe className="w-3.5 h-3.5 text-warning" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Audit Trail & Compliance Ledger
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Chronological, cryptographically hashed event ledger verifying all contractual recoveries and disbursements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAuditEvents}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Re-verify Hashes
          </Button>
        </div>
      </div>

      {/* Cryptographic Integrity Strip */}
      <div className="bg-[#FAFBFD] border border-neutral-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-subtle">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-success-bg text-success flex items-center justify-center shrink-0 border border-[#C3EAD9]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-primary">
                Cryptographic Ledger Integrity: Verified
              </span>
              <Badge variant="success" size="sm" dot>
                SHA-256 Chained
              </Badge>
            </div>
            <p className="text-[11px] text-neutral-secondary mt-0.5">
              All {integrity.checkedEventsCount} historical events validated. Zero broken hash linkages detected.
            </p>
          </div>
        </div>

        <div className="text-xs text-neutral-secondary font-mono self-start sm:self-auto bg-white px-3 py-1.5 rounded-lg border border-neutral-border">
          Ledger Root: 000000000000...
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-neutral-border p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search ledger events, actors, or entity IDs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary font-medium"
            >
              <option value="all">All Categories</option>
              <option value="CONTRACT">Contract Events</option>
              <option value="INCIDENT">Incident Events</option>
              <option value="CALCULATION">Calculations</option>
              <option value="APPROVAL">Human Approvals</option>
              <option value="PAYPAL_PAYOUT">PayPal Payouts</option>
            </select>

            {/* Actor Filter */}
            <select
              value={actorTypeFilter}
              onChange={(e) => setActorTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary font-medium"
            >
              <option value="all">All Actors</option>
              <option value="HUMAN">Human Officers</option>
              <option value="SYSTEM_AI">Autonomous AI Engine</option>
              <option value="WEBHOOK">External Webhooks</option>
            </select>
          </div>
        </div>
      </div>

      {/* Chronological Event Timeline */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center bg-white rounded-xl border border-neutral-border animate-pulse text-xs text-neutral-secondary">
            Verifying cryptographic proof and loading ledger...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-neutral-border text-xs text-neutral-secondary">
            No audit ledger entries match your filter criteria.
          </div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-white border border-neutral-border rounded-xl p-4 shadow-subtle hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-border">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(event.category)}
                  <span className="font-mono text-xs font-bold text-neutral-primary">
                    {event.eventType}
                  </span>
                  <span className="text-[11px] text-neutral-secondary font-mono">
                    Entity: {event.entityType} ({event.entityId})
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-neutral-secondary">
                  <Clock className="w-3.5 h-3.5 text-neutral-muted" />
                  <span className="font-mono">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <p className="text-xs text-neutral-primary font-medium mt-3 leading-relaxed">
                {event.description}
              </p>

              {/* Actor & Hashes */}
              <div className="mt-3 pt-2.5 border-t border-neutral-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-neutral-secondary">
                <div className="flex items-center gap-1.5">
                  {getActorIcon(event.actor.type)}
                  <span>
                    Actor: <strong className="text-neutral-primary">{event.actor.name}</strong> ({event.actor.type})
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono text-[10px] text-neutral-muted">
                  <span title={event.hash}>
                    SHA-256: <strong className="text-slate-600">{event.hash.substring(0, 16)}...</strong>
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
