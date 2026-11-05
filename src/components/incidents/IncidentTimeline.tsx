'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TimelineEvent, Incident } from '@/types';
import Badge from '@/components/ui/Badge';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Activity,
  Calendar,
  Layers,
  Flag
} from 'lucide-react';

// Import Bryntum Scheduler styles
import '@bryntum/scheduler-trial/scheduler.css';

// Dynamically import BryntumScheduler for safe client-side DOM execution
const BryntumScheduler = dynamic(
  () => import('@bryntum/scheduler-react').then((m) => m.BryntumScheduler),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 w-full flex items-center justify-center bg-slate-50 border border-neutral-border rounded-xl text-xs text-neutral-secondary animate-pulse">
        <Clock className="w-4 h-4 mr-2 text-primary animate-spin" />
        <span>Loading Bryntum Event Scheduler...</span>
      </div>
    )
  }
);

interface IncidentTimelineProps {
  timeline: TimelineEvent[];
  incident?: Incident | null;
}

export default function IncidentTimeline({ timeline, incident }: IncidentTimelineProps) {
  const [activeTab, setActiveTab] = useState<'scheduler' | 'chronology'>('scheduler');

  const getPhaseIcon = (phase: TimelineEvent['phase']) => {
    switch (phase) {
      case 'detection':
        return <AlertCircle className="w-4 h-4 text-warning" />;
      case 'impact':
        return <Activity className="w-4 h-4 text-danger" />;
      case 'mitigation':
        return <Clock className="w-4 h-4 text-primary" />;
      case 'recovery':
        return <ShieldCheck className="w-4 h-4 text-[#0D684F]" />;
      case 'resolved':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
    }
  };

  const getPhaseBadge = (phase: TimelineEvent['phase']) => {
    const map = {
      detection: 'bg-[#FFF5E5] text-[#925B0E] border-[#FFE2B3]',
      impact: 'bg-[#FDECEC] text-[#9E2B2B] border-[#F9C9C9]',
      mitigation: 'bg-[#EEEDFF] text-[#5146E5] border-[#D5D3FF]',
      recovery: 'bg-[#E8F7F1] text-[#0D684F] border-[#C3EAD9]',
      resolved: 'bg-[#E8F7F1] text-[#0D684F] border-[#C3EAD9]',
    };

    return (
      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${map[phase]}`}>
        {phase}
      </span>
    );
  };

  // Build Bryntum Scheduler Resources & Events for this specific incident
  const { schedulerResources, schedulerEvents, timeSpan } = useMemo(() => {
    const resources = [
      { id: 'track-outage', name: 'Service Outage & Impact' },
      { id: 'track-ops', name: 'Operational Remediation' },
      { id: 'track-covenant', name: 'Contractual Claim Window' }
    ];

    if (!timeline || timeline.length === 0) {
      return { schedulerResources: resources, schedulerEvents: [], timeSpan: { start: new Date(), end: new Date() } };
    }

    const sortedEvents = [...timeline].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const firstTime = new Date(sortedEvents[0].timestamp).getTime();
    const lastTime = new Date(sortedEvents[sortedEvents.length - 1].timestamp).getTime();

    const evts: any[] = [];

    sortedEvents.forEach((ev, idx) => {
      const startTime = new Date(ev.timestamp);
      // Give each point event a clear visual duration (e.g. 15 minutes or until next phase)
      const nextTime = idx < sortedEvents.length - 1 ? new Date(sortedEvents[idx + 1].timestamp) : new Date(startTime.getTime() + 20 * 60000);

      let trackId = 'track-ops';
      let color = 'indigo';

      if (ev.phase === 'impact' || ev.phase === 'detection') {
        trackId = 'track-outage';
        color = ev.phase === 'impact' ? 'red' : 'amber';
      } else if (ev.phase === 'resolved' || ev.phase === 'recovery') {
        trackId = 'track-ops';
        color = 'green';
      }

      evts.push({
        id: `inc-phase-${ev.id}`,
        resourceId: trackId,
        name: `${ev.title} (${ev.phase.toUpperCase()})`,
        startDate: startTime,
        endDate: nextTime > startTime ? nextTime : new Date(startTime.getTime() + 15 * 60000),
        eventColor: color,
        iconCls: 'b-fa b-fa-circle'
      });
    });

    // Add 30-Day Contractual Claim Deadline milestone on the covenant track
    const claimDeadline = new Date(firstTime + 30 * 24 * 3600000);
    evts.push({
      id: 'inc-claim-deadline',
      resourceId: 'track-covenant',
      name: '30-Day Contractual Claim Filing Deadline',
      startDate: claimDeadline,
      endDate: new Date(claimDeadline.getTime() + 4 * 3600000),
      eventColor: 'purple',
      iconCls: 'b-fa b-fa-flag'
    });

    return {
      schedulerResources: resources,
      schedulerEvents: evts,
      timeSpan: {
        start: new Date(firstTime - 2 * 3600000),
        end: new Date(claimDeadline.getTime() + 24 * 3600000)
      }
    };
  }, [timeline]);

  return (
    <div className="space-y-4">
      {/* Header and View Selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider">
            Incident Progression & Bryntum Scheduler
          </h4>
          <Badge variant="indigo" size="sm">
            Bryntum Engine Active
          </Badge>
        </div>

        <div className="flex items-center gap-1 bg-[#F1F4F9] p-0.5 rounded-lg border border-neutral-border">
          <button
            onClick={() => setActiveTab('scheduler')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'scheduler'
                ? 'bg-white text-neutral-primary font-bold shadow-xs'
                : 'text-neutral-secondary hover:text-neutral-primary'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Bryntum Scheduler</span>
          </button>
          <button
            onClick={() => setActiveTab('chronology')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'chronology'
                ? 'bg-white text-neutral-primary font-bold shadow-xs'
                : 'text-neutral-secondary hover:text-neutral-primary'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Audit Chronology ({timeline.length})</span>
          </button>
        </div>
      </div>

      {/* Bryntum Scheduler View */}
      {activeTab === 'scheduler' ? (
        <div className="border border-neutral-border rounded-xl overflow-hidden bg-white">
          <div className="px-3.5 py-2 bg-[#FAFBFD] border-b border-neutral-border flex items-center justify-between text-[11px] text-neutral-secondary">
            <span>Visualizing phased progression & contractual claim window</span>
            <span className="font-mono text-neutral-primary">3 Specialized Resource Tracks</span>
          </div>
          <div className="h-64 w-full">
            {React.createElement(BryntumScheduler as any, {
              resources: schedulerResources,
              events: schedulerEvents,
              startDate: timeSpan.start,
              endDate: timeSpan.end,
              viewPreset: 'dayAndMonth',
              rowHeight: 48,
              barMargin: 4,
              columns: [
                {
                  text: 'Operational Resource Track',
                  field: 'name',
                  width: 200
                }
              ],
              timeRangesFeature: true,
              eventTooltipFeature: {
                template: (data: any) => {
                  const ev = data.eventRecord;
                  return `
                    <div class="p-1.5 text-xs">
                      <strong>${ev.name}</strong>
                      <div class="text-neutral-secondary mt-1">Start: ${new Date(ev.startDate).toLocaleString()}</div>
                      <div class="text-neutral-secondary">End: ${new Date(ev.endDate).toLocaleString()}</div>
                    </div>
                  `;
                }
              }
            })}
          </div>
        </div>
      ) : (
        /* Vertical Chronological Log */
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
          {timeline.map((event) => (
            <div key={event.id} className="relative group">
              {/* Timeline dot */}
              <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white border border-neutral-border flex items-center justify-center shadow-xs">
                {getPhaseIcon(event.phase)}
              </div>

              <div className="bg-white border border-neutral-border rounded-xl p-3.5 shadow-subtle hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <span className="text-xs font-bold text-neutral-primary">
                    {event.title}
                  </span>
                  <div className="flex items-center gap-2">
                    {getPhaseBadge(event.phase)}
                    <span className="text-[11px] font-mono text-neutral-secondary">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC
                    </span>
                  </div>
                </div>

                <p className="text-xs text-neutral-secondary leading-relaxed">
                  {event.description}
                </p>

                <div className="mt-2 pt-2 border-t border-neutral-border flex items-center justify-between text-[10px] text-neutral-muted">
                  <span>Actor / Source: <strong className="text-neutral-secondary">{event.actor}</strong></span>
                  <span className="font-mono">{new Date(event.timestamp).toISOString().split('T')[0]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
