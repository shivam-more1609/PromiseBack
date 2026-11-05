'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import IncidentDetailDrawer from '@/components/incidents/IncidentDetailDrawer';
import IngestIncidentModal from '@/components/incidents/IngestIncidentModal';
import BryntumIncidentScheduler from '@/components/incidents/BryntumIncidentScheduler';
import { Incident } from '@/types';
import {
  AlertTriangle,
  Search,
  Clock,
  Activity,
  Plus,
  ChevronRight,
  ShieldAlert,
  Server,
  Users,
  Calendar,
  List
} from 'lucide-react';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'scheduler' | 'list'>('scheduler');

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const url = new URL('/api/incidents', window.location.origin);
      if (severityFilter !== 'all') url.searchParams.set('severity', severityFilter);
      if (search) url.searchParams.set('search', search);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setIncidents(data.incidents);
        if (selectedIncident) {
          const updated = data.incidents.find((i: Incident) => i.id === selectedIncident.id);
          if (updated) setSelectedIncident(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [severityFilter, search]);

  const totalOutageMinutes = incidents.reduce((sum, i) => sum + i.durationMinutes, 0);
  const breachIncidents = incidents.filter(i => i.slaBreached).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Incident Intelligence
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Ingest outage telemetry, reconstruct event timelines and measure contractual availability deficits.
          </p>
        </div>

        <Button
          variant="danger"
          onClick={() => setIsIngestOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Ingest New Incident
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Monitored Incidents</span>
            <div className="text-xl font-bold text-neutral-primary font-mono">{incidents.length}</div>
            <span className="text-[10px] text-neutral-secondary">Current billing cycle</span>
          </div>
          <div className="p-2.5 bg-[#F6F8FC] border border-neutral-border text-neutral-primary rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Contractual Breaches</span>
            <div className="text-xl font-bold text-danger font-mono">{breachIncidents}</div>
            <span className="text-[10px] text-neutral-secondary">Covenants triggered</span>
          </div>
          <div className="p-2.5 bg-danger-bg text-danger rounded-lg">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-neutral-secondary">Cumulative Downtime</span>
            <div className="text-xl font-bold text-neutral-primary font-mono">{totalOutageMinutes} mins</div>
            <span className="text-[10px] text-neutral-secondary">Across all regions</span>
          </div>
          <div className="p-2.5 bg-warning-bg text-warning rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* View Switcher & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-neutral-border">
        {/* View Toggle Tabs */}
        <div className="flex items-center gap-1 bg-[#F1F4F9] p-0.5 rounded-lg border border-neutral-border">
          <button
            onClick={() => setViewMode('scheduler')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'scheduler'
                ? 'bg-primary text-white shadow-xs'
                : 'text-neutral-secondary hover:text-neutral-primary'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Bryntum Scheduler</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'list'
                ? 'bg-primary text-white shadow-xs'
                : 'text-neutral-secondary hover:text-neutral-primary'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Incident List</span>
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by incident number, affected service, or root cause..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Severity Filters */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-xs text-neutral-secondary mr-1">Severity:</span>
          {(['all', 'P1', 'P2', 'P3'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                severityFilter === sev
                  ? 'bg-primary text-white font-semibold'
                  : 'bg-[#F1F4F9] text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              {sev === 'all' ? 'All Severities' : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area: Bryntum Scheduler or Incident Cards */}
      {viewMode === 'scheduler' ? (
        <BryntumIncidentScheduler
          incidents={incidents}
          onSelectIncident={(inc) => setSelectedIncident(inc)}
          selectedIncidentId={selectedIncident?.id}
          claimDeadlineDays={30}
        />
      ) : null}

      {/* Incident List */}
      <div className={`space-y-3 ${viewMode === 'scheduler' ? 'mt-6' : ''}`}>
        {loading ? (
          <div className="p-8 text-center bg-white rounded-xl border border-neutral-border animate-pulse text-xs text-neutral-secondary">
            Loading incident telemetry stream...
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-neutral-border">
            <AlertTriangle className="w-10 h-10 text-neutral-muted mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-neutral-primary">No incidents found</h3>
            <p className="text-xs text-neutral-secondary mt-1">All monitored microservices are currently operating within nominal SLA uptime parameters.</p>
          </div>
        ) : (
          incidents.map((incident) => (
            <div
              key={incident.id}
              onClick={() => setSelectedIncident(incident)}
              className="bg-white hover:bg-[#FAFCFF] border border-neutral-border hover:border-primary/40 rounded-xl p-5 shadow-subtle cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#F6F8FC] border border-neutral-border flex items-center justify-center text-primary shrink-0 group-hover:bg-primary-light transition-colors">
                  <Server className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-neutral-primary group-hover:text-primary transition-colors">
                      {incident.incidentNumber}
                    </span>
                    <Badge
                      variant={incident.severity.includes('P1') ? 'danger' : 'warning'}
                      size="sm"
                    >
                      {incident.severity}
                    </Badge>
                    {incident.slaBreached ? (
                      <Badge variant="danger" size="sm" dot>SLA Breach Confirmed</Badge>
                    ) : (
                      <Badge variant="success" size="sm">Exclusion / Within Target</Badge>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-neutral-primary mt-1">
                    {incident.service}
                  </h3>

                  <p className="text-xs text-neutral-secondary mt-0.5 line-clamp-1">
                    {incident.summary}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-neutral-secondary mt-2.5 flex-wrap">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-neutral-muted" />
                      {incident.durationMinutes} minutes downtime
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-neutral-muted" />
                      {incident.affectedCustomersCount} Affected Tenants
                    </span>
                    <span>Regions: <strong className="text-neutral-primary font-mono">{incident.affectedRegions.join(', ')}</strong></span>
                  </div>
                </div>
              </div>

              {/* Right Side */}
              <div className="flex items-center gap-4 self-end md:self-auto shrink-0">
                <div className="text-right hidden sm:block">
                  <span className="text-[11px] text-neutral-secondary block">Started</span>
                  <span className="font-mono text-xs font-medium text-neutral-primary">
                    {new Date(incident.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
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

      {/* Ingest Modal */}
      <IngestIncidentModal
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        onIncidentIngested={fetchIncidents}
      />

      {/* Investigation Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
