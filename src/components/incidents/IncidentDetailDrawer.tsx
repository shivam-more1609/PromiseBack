'use client';

import React, { useState, useEffect } from 'react';
import Drawer from '../ui/Drawer';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import IncidentTimeline from './IncidentTimeline';
import AiIntelligencePanel from '../ui/AiIntelligencePanel';
import { Incident } from '@/types';
import {
  AlertTriangle,
  Clock,
  Globe,
  Users,
  Activity,
  Cpu,
  ShieldAlert,
  CheckCircle2,
  Server
} from 'lucide-react';

interface IncidentDetailDrawerProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function IncidentDetailDrawer({
  incident,
  isOpen,
  onClose
}: IncidentDetailDrawerProps) {
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (incident && isOpen) {
      setLoadingAi(true);
      fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'incident', entityId: incident.id })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setAiAnalysis(data.analysis);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingAi(false));
    }
  }, [incident, isOpen]);

  if (!incident) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={incident.incidentNumber}
      subtitle={incident.service}
      width="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-xs text-neutral-secondary">
            <Server className="w-4 h-4 text-primary" />
            <span>Telemetry Source: Synthetic Monitor & Aurora Engine</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Drawer
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Top Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Severity</span>
            <Badge 
              variant={incident.severity.includes('P1') ? 'danger' : 'warning'} 
              size="sm" 
              className="mt-1"
            >
              {incident.severity}
            </Badge>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Downtime Duration</span>
            <span className="text-base font-bold text-neutral-primary font-mono">{incident.durationMinutes} mins</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">Impacted Tenants</span>
            <span className="text-base font-bold text-primary font-mono">{incident.affectedCustomersCount} Accounts</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-border">
            <span className="text-[11px] text-neutral-secondary block">SLA Covenant Status</span>
            <Badge 
              variant={incident.slaBreached ? 'danger' : 'success'} 
              size="sm" 
              className="mt-1"
            >
              {incident.slaBreached ? 'Breach Confirmed' : 'Within Limits'}
            </Badge>
          </div>
        </div>

        {/* Root Cause & Summary */}
        <div className="bg-white p-4 rounded-xl border border-neutral-border space-y-3">
          <div>
            <span className="text-xs font-semibold text-neutral-secondary uppercase tracking-wider">
              Outage Summary
            </span>
            <p className="text-sm font-medium text-neutral-primary mt-1">
              {incident.summary}
            </p>
          </div>

          <div className="pt-3 border-t border-neutral-border">
            <span className="text-xs font-semibold text-neutral-secondary uppercase tracking-wider">
              Verified Root Cause
            </span>
            <p className="text-xs text-neutral-primary mt-1 bg-[#FAFBFD] p-3 rounded-lg border border-neutral-border font-mono">
              {incident.rootCause}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div>
              <span className="text-neutral-secondary">Affected Regions:</span>
              <p className="font-mono font-medium text-neutral-primary mt-0.5">
                {incident.affectedRegions.join(', ')}
              </p>
            </div>
            <div>
              <span className="text-neutral-secondary">Detection to Resolution:</span>
              <p className="font-mono text-neutral-primary mt-0.5">
                {new Date(incident.detectedAt).toLocaleTimeString()} → {new Date(incident.resolvedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>

        {/* AI Correlation Assessment */}
        {aiAnalysis && (
          <AiIntelligencePanel
            analysis={aiAnalysis}
            loading={loadingAi}
          />
        )}

        {/* Telemetry Metrics Table */}
        {incident.telemetry && incident.telemetry.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-border overflow-hidden">
            <div className="px-4 py-3 bg-[#FAFBFD] border-b border-neutral-border flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span>Synthetic Telemetry Telemetry Points</span>
              </h4>
              <span className="text-[11px] text-neutral-secondary font-mono">Sampling: 5-minute ticks</span>
            </div>
            <div className="p-4">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-neutral-border text-neutral-secondary">
                    <th className="py-2">Timestamp</th>
                    <th className="py-2 text-right">Availability</th>
                    <th className="py-2 text-right">p99 Latency</th>
                    <th className="py-2 text-right">Error Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border">
                  {incident.telemetry.map((pt, idx) => (
                    <tr key={idx} className="hover:bg-[#F8FAFC]">
                      <td className="py-2 text-neutral-primary">{pt.time}</td>
                      <td className={`py-2 text-right font-bold ${pt.availability < 99 ? 'text-danger' : 'text-success'}`}>
                        {pt.availability.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right text-neutral-primary">{pt.latencyMs} ms</td>
                      <td className={`py-2 text-right font-bold ${pt.errorRate > 5 ? 'text-danger' : 'text-neutral-secondary'}`}>
                        {pt.errorRate.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chronological Event Timeline */}
        {incident.timeline && incident.timeline.length > 0 && (
          <IncidentTimeline timeline={incident.timeline} incident={incident} />
        )}
      </div>
    </Drawer>
  );
}
