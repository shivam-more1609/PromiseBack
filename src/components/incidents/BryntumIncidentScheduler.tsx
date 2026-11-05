'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Incident } from '@/types';
import Badge from '@/components/ui/Badge';
import {
  Calendar,
  Filter,
  Layers,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

// Import Bryntum Scheduler styles
import '@bryntum/scheduler-trial/scheduler.css';

// Dynamically import BryntumScheduler to guarantee client-side only DOM rendering in Next.js
const BryntumScheduler = dynamic(
  () => import('@bryntum/scheduler-react').then((m) => m.BryntumScheduler),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 w-full flex flex-col items-center justify-center bg-slate-50 border border-neutral-border rounded-xl animate-pulse text-xs text-neutral-secondary">
        <Clock className="w-6 h-6 text-primary mb-2 animate-spin" />
        <span>Initializing Bryntum Incident Scheduler engine...</span>
      </div>
    )
  }
);

interface BryntumIncidentSchedulerProps {
  incidents: Incident[];
  onSelectIncident?: (incident: Incident) => void;
  selectedIncidentId?: string | null;
  claimDeadlineDays?: number;
}

export default function BryntumIncidentScheduler({
  incidents,
  onSelectIncident,
  selectedIncidentId,
  claimDeadlineDays = 30
}: BryntumIncidentSchedulerProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const schedulerRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter incidents based on selected service and severity
  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (selectedService !== 'all' && inc.service !== selectedService) return false;
      if (selectedSeverity !== 'all' && !inc.severity.includes(selectedSeverity)) return false;
      return true;
    });
  }, [incidents, selectedService, selectedSeverity]);

  // Unique services list for filter pills
  const services = useMemo(() => {
    const list = Array.from(new Set(incidents.map((i) => i.service)));
    return ['all', ...list];
  }, [incidents]);

  // Transform incidents into Bryntum Resources (Services / Systems)
  const resources = useMemo(() => {
    const distinctServices = Array.from(new Set(filteredIncidents.map((i) => i.service)));
    const res = distinctServices.map((svc, idx) => ({
      id: `res-${idx + 1}`,
      name: svc,
      serviceKey: svc,
      iconCls: 'b-fa b-fa-server'
    }));

    // Add dedicated resource row for Maintenance & Compliance Deadlines
    res.push({
      id: 'res-maintenance',
      name: 'Planned Maintenance & Exclusions',
      serviceKey: 'Maintenance',
      iconCls: 'b-fa b-fa-tools'
    });
    res.push({
      id: 'res-deadlines',
      name: 'Contractual SLA Claim Deadlines',
      serviceKey: 'Deadlines',
      iconCls: 'b-fa b-fa-clock'
    });

    return res;
  }, [filteredIncidents]);

  // Transform incident phases, planned maintenance, and claim deadlines into Bryntum Events
  const events = useMemo(() => {
    const evts: any[] = [];

    filteredIncidents.forEach((inc, incIdx) => {
      const resource = resources.find((r) => r.serviceKey === inc.service);
      const resId = resource ? resource.id : 'res-1';

      const startDate = new Date(inc.startedAt);
      const detectedDate = new Date(inc.detectedAt || inc.startedAt);
      const mitigatedDate = new Date(inc.mitigatedAt || inc.resolvedAt);
      const resolvedDate = new Date(inc.resolvedAt);

      // 1. Overall Incident Outage Duration Event
      evts.push({
        id: `evt-outage-${inc.id}`,
        resourceId: resId,
        name: `[${inc.incidentNumber}] ${inc.severity}: ${inc.summary} (${inc.durationMinutes}m downtime)`,
        startDate: startDate,
        endDate: resolvedDate > startDate ? resolvedDate : new Date(startDate.getTime() + 38 * 60000),
        eventColor: inc.severity.includes('P1') ? 'red' : 'orange',
        iconCls: 'b-fa b-fa-exclamation-triangle',
        incidentData: inc,
        cls: 'pb-scheduler-outage-bar'
      });

      // 2. Detection Phase Event (Start -> Detected)
      if (detectedDate > startDate) {
        evts.push({
          id: `evt-detect-${inc.id}`,
          resourceId: resId,
          name: `Detection Phase (${Math.round((detectedDate.getTime() - startDate.getTime()) / 60000)}m)`,
          startDate: startDate,
          endDate: detectedDate,
          eventColor: 'amber',
          iconCls: 'b-fa b-fa-bell',
          incidentData: inc
        });
      }

      // 3. Mitigation Phase Event (Detected -> Mitigated)
      if (mitigatedDate > detectedDate) {
        evts.push({
          id: `evt-mitigate-${inc.id}`,
          resourceId: resId,
          name: `Mitigation & Traffic Reroute`,
          startDate: detectedDate,
          endDate: mitigatedDate,
          eventColor: 'indigo',
          iconCls: 'b-fa b-fa-shield-alt',
          incidentData: inc
        });
      }

      // 4. Recovery & Resolution Event (Mitigated -> Resolved)
      if (resolvedDate > mitigatedDate) {
        evts.push({
          id: `evt-recovery-${inc.id}`,
          resourceId: resId,
          name: `Recovery & Verification`,
          startDate: mitigatedDate,
          endDate: resolvedDate,
          eventColor: 'green',
          iconCls: 'b-fa b-fa-check-circle',
          incidentData: inc
        });
      }

      // 5. Planned Maintenance Event (if flagged)
      if (inc.isPlannedMaintenance || inc.rootCause.toLowerCase().includes('maintenance')) {
        evts.push({
          id: `evt-maint-${inc.id}`,
          resourceId: 'res-maintenance',
          name: `Scheduled Window: ${inc.summary} (SLA Exclusion)`,
          startDate: startDate,
          endDate: resolvedDate,
          eventColor: 'gray',
          iconCls: 'b-fa b-fa-wrench',
          incidentData: inc
        });
      }

      // 6. 30-Day Contractual SLA Claim Deadline Event
      const deadlineDate = new Date(startDate.getTime() + claimDeadlineDays * 24 * 60 * 60 * 1000);
      evts.push({
        id: `evt-deadline-${inc.id}`,
        resourceId: 'res-deadlines',
        name: `Claim Deadline for ${inc.incidentNumber} (${claimDeadlineDays}-day window)`,
        startDate: deadlineDate,
        endDate: new Date(deadlineDate.getTime() + 4 * 3600000), // 4-hour visual milestone block
        eventColor: 'purple',
        iconCls: 'b-fa b-fa-flag-checkered',
        incidentData: inc
      });
    });

    return evts;
  }, [filteredIncidents, resources, claimDeadlineDays]);

  // Determine scheduler date range
  const { schedulerStart, schedulerEnd } = useMemo(() => {
    if (events.length === 0) {
      const now = new Date('2026-01-15T00:00:00Z');
      return {
        schedulerStart: new Date(now.getTime() - 24 * 3600000),
        schedulerEnd: new Date(now.getTime() + 35 * 24 * 3600000)
      };
    }

    let min = new Date('2026-01-14T00:00:00Z').getTime();
    let max = new Date('2026-02-20T00:00:00Z').getTime();

    events.forEach((e) => {
      const s = new Date(e.startDate).getTime();
      const end = new Date(e.endDate).getTime();
      if (s < min) min = s;
      if (end > max) max = end;
    });

    return {
      schedulerStart: new Date(min - 12 * 3600000),
      schedulerEnd: new Date(max + 24 * 3600000)
    };
  }, [events]);

  if (!mounted) {
    return (
      <div className="h-96 w-full flex items-center justify-center bg-white border border-neutral-border rounded-xl">
        <span className="text-xs text-neutral-secondary">Loading Bryntum Scheduler...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-border rounded-xl shadow-subtle overflow-hidden space-y-4 p-4">
      {/* Scheduler Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-neutral-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary-light text-primary">
              <Calendar className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-neutral-primary">
              Bryntum Outage & Resolution Scheduler
            </h3>
            <Badge variant="indigo" size="sm">
              Bryntum Scheduler 7.3 (Hackathon Trial)
            </Badge>
          </div>
          <p className="text-xs text-neutral-secondary mt-1">
            Reconstructing timeline phases (Start → Detection → Mitigation → Recovery → Claim Deadline) across microservices.
          </p>
        </div>

        {/* Severity & Service Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Service Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg px-2.5 py-1 text-xs">
            <Layers className="w-3.5 h-3.5 text-neutral-secondary" />
            <span className="text-neutral-secondary font-medium">Service:</span>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="bg-transparent text-neutral-primary font-semibold focus:outline-none"
            >
              {services.map((svc) => (
                <option key={svc} value={svc}>
                  {svc === 'all' ? 'All Services' : svc}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filters */}
          <div className="flex items-center gap-1 bg-[#F1F4F9] p-0.5 rounded-lg border border-neutral-border">
            {(['all', 'P1', 'P2'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  selectedSeverity === sev
                    ? 'bg-white text-neutral-primary font-bold shadow-xs'
                    : 'text-neutral-secondary hover:text-neutral-primary'
                }`}
              >
                {sev === 'all' ? 'All Severities' : sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-secondary px-2 py-1.5 bg-[#FAFBFD] rounded-lg border border-neutral-border">
        <span className="font-semibold text-neutral-primary">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#DC5555]"></span>
          <span>P1 Critical Outage</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#D99124]"></span>
          <span>Detection Phase</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#5146E5]"></span>
          <span>Mitigation Phase</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#139B76]"></span>
          <span>Recovery & Resolved</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#64748B]"></span>
          <span>Planned Maintenance (Excluded)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#7C3AED]"></span>
          <span>Claim Deadline ({claimDeadlineDays}d)</span>
        </span>
      </div>

      {/* Bryntum Scheduler Container */}
      <div className="h-[420px] w-full rounded-xl overflow-hidden border border-neutral-border">
        {React.createElement(BryntumScheduler as any, {
          ref: schedulerRef,
          resources: resources,
          events: events,
          startDate: schedulerStart,
          endDate: schedulerEnd,
          viewPreset: "dayAndMonth",
          rowHeight: 55,
          barMargin: 6,
          columns: [
            {
              text: 'Affected Microservice / Covenants',
              field: 'name',
              width: 250
            }
          ],
          onEventClick: (e: any) => {
            const incData = e.eventRecord?.data?.incidentData;
            if (incData && onSelectIncident) {
              onSelectIncident(incData);
            }
          },
          timeRangesFeature: true,
          eventTooltipFeature: {
            template: (data: any) => {
              const event = data.eventRecord;
              const inc = event.data?.incidentData;
              return `
                <div class="p-2 text-xs font-sans">
                  <div class="font-bold text-neutral-primary">${event.name}</div>
                  <div class="text-neutral-secondary mt-1">Start: ${new Date(event.startDate).toLocaleString()}</div>
                  <div class="text-neutral-secondary">End: ${new Date(event.endDate).toLocaleString()}</div>
                  ${inc ? `<div class="mt-1 pt-1 border-t text-primary font-semibold">Affected Tenants: ${inc.affectedCustomersCount} Accounts</div>` : ''}
                </div>
              `;
            }
          }
        })}
      </div>
    </div>
  );
}
