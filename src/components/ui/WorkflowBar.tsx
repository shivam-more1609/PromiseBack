'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  Search,
  AlertTriangle,
  Clock,
  Users,
  Calculator,
  ShieldCheck,
  CheckCircle,
  CreditCard,
  FileCheck
} from 'lucide-react';

const WORKFLOW_STEPS = [
  { id: 'contracts', label: '1. SLA Contract', href: '/contracts', icon: FileText },
  { id: 'intelligence', label: '2. Contract Intel', href: '/contracts', icon: Search },
  { id: 'incidents', label: '3. Ingestion', href: '/incidents', icon: AlertTriangle },
  { id: 'downtime', label: '4. Downtime Calc', href: '/incidents', icon: Clock },
  { id: 'mapping', label: '5. Mapping', href: '/customers', icon: Users },
  { id: 'entitlements', label: '6. Entitlements', href: '/entitlements', icon: Calculator },
  { id: 'evidence', label: '7. Evidence', href: '/compensation-review', icon: ShieldCheck },
  { id: 'approval', label: '8. Approval', href: '/compensation-review', icon: CheckCircle },
  { id: 'refund', label: '9. PayPal / Credit', href: '/refunds', icon: CreditCard },
  { id: 'audit', label: '10. Audit Record', href: '/audit', icon: FileCheck },
];

export default function WorkflowBar() {
  const pathname = usePathname();

  const getActiveIndex = () => {
    if (pathname.includes('/contracts')) return 1;
    if (pathname.includes('/incidents')) return 3;
    if (pathname.includes('/customers')) return 4;
    if (pathname.includes('/entitlements')) return 5;
    if (pathname.includes('/compensation-review')) return 7;
    if (pathname.includes('/refunds')) return 8;
    if (pathname.includes('/audit')) return 9;
    return -1;
  };

  const activeIndex = getActiveIndex();

  return (
    <div className="bg-white border-b border-neutral-border px-6 py-2.5 overflow-x-auto shadow-xs">
      <div className="flex items-center justify-between min-w-[980px]">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-neutral-muted uppercase tracking-wider mr-2">
            RECOVERY LIFECYCLE
          </span>
          <div className="flex items-center gap-1.5">
            {WORKFLOW_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isCurrent = activeIndex === idx || (idx === 0 && activeIndex === 1) || (idx === 2 && activeIndex === 3) || (idx === 6 && activeIndex === 7);
              const isPassed = activeIndex > idx;

              return (
                <React.Fragment key={step.id}>
                  <Link
                    href={step.href}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      isCurrent
                        ? 'bg-primary text-white shadow-xs font-semibold'
                        : isPassed
                        ? 'bg-[#E8F7F1] text-[#0D684F] hover:bg-[#D5EFE4]'
                        : 'bg-[#F8FAFC] text-neutral-secondary hover:bg-[#EEF2F6] hover:text-neutral-primary'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{step.label}</span>
                  </Link>

                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <span className="text-neutral-muted text-xs">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
