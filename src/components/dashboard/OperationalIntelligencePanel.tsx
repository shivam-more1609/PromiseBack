import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowRight, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import Button from '../ui/Button';

interface OperationalIntelligencePanelProps {
  breachedIncidentsCount: number;
  casesRequiringReviewCount: number;
  creditsOwed: number;
}

export default function OperationalIntelligencePanel({
  breachedIncidentsCount,
  casesRequiringReviewCount,
  creditsOwed
}: OperationalIntelligencePanelProps) {
  return (
    <div className="bg-gradient-to-r from-[#FFF9F2] via-[#FFFDF9] to-white border border-[#FFE7BA] rounded-card p-5 shadow-subtle">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[#FFF5E5] border border-[#FFD591] text-[#D99124] rounded-lg shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-neutral-primary tracking-tight">
                Operational Recovery Intelligence
              </h3>
              <span className="text-[10px] font-mono bg-[#FFE2B3] text-[#925B0E] px-2 py-0.5 rounded-full font-semibold">
                Action Required
              </span>
            </div>
            <p className="text-xs text-neutral-secondary mt-1 max-w-2xl leading-relaxed">
              <strong className="text-neutral-primary font-semibold">{breachedIncidentsCount} incidents</strong> breached contractual service commitments. {' '}
              <strong className="text-neutral-primary font-semibold">{casesRequiringReviewCount} customer entitlement cases</strong> require human review before remedy execution. {' '}
              Total estimated contractual liability: <strong className="text-primary font-bold">${creditsOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link href="/compensation-review">
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Review Compensations
            </Button>
          </Link>

          <Link href="/incidents">
            <Button
              variant="outline"
              size="sm"
              icon={<AlertTriangle className="w-3.5 h-3.5 text-warning" />}
            >
              Investigate Incidents
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
