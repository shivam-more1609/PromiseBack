import React from 'react';
import Card from '../ui/Card';
import clsx from 'clsx';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
    label: string;
  };
  highlight?: boolean;
}

export default function KpiCard({
  title,
  value,
  description,
  icon,
  trend,
  highlight = false,
}: KpiCardProps) {
  return (
    <Card
      padding="md"
      className={clsx(
        'relative overflow-hidden transition-all hover:border-slate-300',
        highlight && 'ring-1 ring-primary/20 border-primary/40'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-xs font-medium text-neutral-secondary">
            {title}
          </span>
          <div className="text-2xl font-bold tracking-tight text-neutral-primary font-mono">
            {value}
          </div>
        </div>
        <div className="p-2.5 bg-[#F6F8FC] border border-neutral-border rounded-lg text-primary shrink-0">
          {icon}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-neutral-border flex items-center justify-between text-xs">
        <span className="text-neutral-secondary truncate">
          {description}
        </span>

        {trend && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 font-medium shrink-0 ml-2',
              trend.isNeutral
                ? 'text-neutral-secondary'
                : trend.isPositive
                ? 'text-success'
                : 'text-danger'
            )}
          >
            {trend.isNeutral ? (
              <Minus className="w-3 h-3" />
            ) : trend.isPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {trend.value}
          </span>
        )}
      </div>
    </Card>
  );
}
