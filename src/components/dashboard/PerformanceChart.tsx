'use client';

import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { AvailabilityTimeSeriesPoint } from '@/types';

interface PerformanceChartProps {
  data: AvailabilityTimeSeriesPoint[];
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  const [mounted, setMounted] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<'7D' | '30D' | '90D'>('30D');

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredData = filterPeriod === '7D' 
    ? data.slice(-7) 
    : filterPeriod === '90D'
    ? data // all sample data
    : data.slice(-30);

  if (!mounted) {
    return (
      <Card
        title="SLA Performance Overview"
        subtitle="Actual availability vs contractual SLA threshold (Past 30 Days)"
        padding="md"
        className="h-80 flex items-center justify-center animate-pulse"
      >
        <div className="h-48 w-full bg-slate-100 rounded"></div>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as AvailabilityTimeSeriesPoint;
      return (
        <div className="bg-white border border-neutral-border rounded-lg shadow-elevated p-3 text-xs">
          <p className="font-semibold text-neutral-primary mb-1">{point.date}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-secondary">Actual Uptime:</span>
              <span className={`font-mono font-bold ${point.actualAvailability < point.slaThreshold ? 'text-danger' : 'text-success'}`}>
                {point.actualAvailability.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-secondary">SLA Threshold:</span>
              <span className="font-mono text-neutral-primary">{point.slaThreshold}%</span>
            </div>
            {point.isOutage && point.incidentName && (
              <div className="pt-1.5 mt-1 border-t border-neutral-border text-danger font-medium">
                Outage Event: {point.incidentName}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card
      title="SLA Performance Overview"
      subtitle="Actual system availability vs contractual SLA covenant threshold (99.95%)"
      badge={<Badge variant="success" size="sm" dot>Telemetry Real-Time Sync</Badge>}
      action={
        <div className="flex items-center gap-1 bg-[#F1F4F9] p-0.5 rounded-lg border border-neutral-border">
          {(['7D', '30D', '90D'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setFilterPeriod(period)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                filterPeriod === period
                  ? 'bg-white text-neutral-primary shadow-xs font-semibold'
                  : 'text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      }
      padding="none"
    >
      <div className="p-5 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs mb-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-primary rounded-full"></span>
              <span className="text-neutral-secondary">Actual Availability</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#DC5555] border-t border-dashed border-[#DC5555]"></span>
              <span className="text-neutral-secondary">SLA Threshold (99.95%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#DC5555] rounded-full"></span>
              <span className="text-neutral-secondary">Outage Breaches</span>
            </div>
          </div>
          <span className="text-neutral-secondary text-[11px] font-mono">
            MTD Average: <strong className="text-neutral-primary">99.88%</strong>
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="availGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5146E5" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#5146E5" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F4F9" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: '#64748B' }} 
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
              />
              <YAxis 
                domain={['dataMin - 0.02', 100.01]} 
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${Number(val).toFixed(2)}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine 
                y={99.95} 
                stroke="#DC5555" 
                strokeDasharray="4 4" 
                label={{ value: 'Target: 99.95%', position: 'insideTopLeft', fill: '#DC5555', fontSize: 10 }} 
              />
              <Area 
                type="monotone" 
                dataKey="actualAvailability" 
                stroke="#5146E5" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#availGradient)" 
              />
              <Line 
                type="monotone" 
                dataKey="actualAvailability" 
                stroke="#5146E5" 
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload.isOutage) {
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill="#DC5555"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    );
                  }
                  return <React.Fragment key={`dot-${cx}-${cy}`} />;
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
