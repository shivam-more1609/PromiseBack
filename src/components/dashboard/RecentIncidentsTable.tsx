import React from 'react';
import Link from 'next/link';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Incident } from '@/types';
import { AlertCircle, ArrowUpRight, Clock } from 'lucide-react';

interface RecentIncidentsTableProps {
  incidents: Incident[];
}

export default function RecentIncidentsTable({ incidents }: RecentIncidentsTableProps) {
  const getSeverityBadge = (severity: Incident['severity']) => {
    if (severity.includes('P1')) return <Badge variant="danger" size="sm" dot>P1 - Critical</Badge>;
    if (severity.includes('P2')) return <Badge variant="warning" size="sm" dot>P2 - Major</Badge>;
    return <Badge variant="neutral" size="sm">P3 - Minor</Badge>;
  };

  return (
    <Card
      title="Recent Monitored Incidents"
      subtitle="Outage events cross-referenced with tenant SLA agreements"
      action={
        <Link href="/incidents">
          <Button variant="ghost" size="sm" icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
            View All Incidents
          </Button>
        </Link>
      }
      padding="none"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#FAFBFD] border-b border-neutral-border text-neutral-secondary font-semibold">
              <th className="py-3 px-4">Incident ID</th>
              <th className="py-3 px-4">Service</th>
              <th className="py-3 px-4">Severity</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">SLA Impact</th>
              <th className="py-3 px-4">Affected Tenants</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-border">
            {incidents.slice(0, 5).map((inc) => (
              <tr key={inc.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="py-3 px-4 font-mono font-medium text-neutral-primary">
                  <Link href={`/incidents?selected=${inc.id}`} className="hover:text-primary hover:underline">
                    {inc.incidentNumber}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <span className="font-semibold text-neutral-primary block">{inc.service}</span>
                  <span className="text-[11px] text-neutral-secondary block truncate max-w-xs">{inc.summary}</span>
                </td>
                <td className="py-3 px-4">
                  {getSeverityBadge(inc.severity)}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  <div className="flex items-center gap-1 text-neutral-primary">
                    <Clock className="w-3.5 h-3.5 text-neutral-muted" />
                    <span>{inc.durationMinutes} mins</span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {inc.slaBreached ? (
                    <Badge variant="danger" size="sm">Breach Confirmed</Badge>
                  ) : (
                    <Badge variant="success" size="sm">Within Limits / Excluded</Badge>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="font-semibold text-neutral-primary">{inc.affectedCustomersCount} customers</span>
                  <span className="text-[11px] text-neutral-secondary block">{inc.affectedRegions.join(', ')}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
