'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Users,
  Calculator,
  CheckCircle2,
  CreditCard,
  FileCheck,
  Settings,
  ChevronDown,
  ShieldCheck,
  Building2,
  ExternalLink,
  BarChart3
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAVIGATION: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }
    ]
  },
  {
    title: 'MONITORING',
    items: [
      { name: 'SLA Contracts', href: '/contracts', icon: FileText },
      { name: 'Incidents', href: '/incidents', icon: AlertTriangle },
      { name: 'Customers', href: '/customers', icon: Users }
    ]
  },
  {
    title: 'FINANCIAL OPERATIONS',
    items: [
      { name: 'Financial Studio', href: '/studio', icon: BarChart3, badge: 'AG Studio' },
      { name: 'Entitlements', href: '/entitlements', icon: Calculator },
      { name: 'Compensation Review', href: '/compensation-review', icon: CheckCircle2 },
      { name: 'Refunds & Credits', href: '/refunds', icon: CreditCard }
    ]
  },
  {
    title: 'MANAGEMENT',
    items: [
      { name: 'Audit Trail', href: '/audit', icon: FileCheck },
      { name: 'Settings', href: '/settings', icon: Settings }
    ]
  }
];

export default function Sidebar({ onCloseMobile }: { onCloseMobile?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-sidebar text-slate-300 flex flex-col h-full border-r border-[#1E293B] select-none">
      {/* Brand & Workspace */}
      <div className="p-4 border-b border-[#1E293B] shrink-0">
        <Link 
          href="/dashboard"
          className="flex items-center gap-2.5 px-1 py-1 group"
          onClick={onCloseMobile}
        >
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-base shadow-sm group-hover:bg-[#4338CA] transition-colors">
            PB
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-white">PROMISEBACK</span>
              <span className="text-[10px] bg-[#1E293B] text-primary-light px-1.5 py-0.5 rounded font-mono font-medium">SLA</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Contract Recovery Engine</p>
          </div>
        </Link>

        {/* Workspace Switcher */}
        <div className="mt-3.5 bg-[#192231] hover:bg-[#202B3C] border border-[#27354A] rounded-lg p-2.5 flex items-center justify-between cursor-pointer transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-primary-light shrink-0" />
            <div className="truncate">
              <span className="text-xs font-medium text-white block truncate">CloudPulse Tech</span>
              <span className="text-[10px] text-slate-400 block truncate">Production • US-East</span>
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAVIGATION.map((section) => (
          <div key={section.title}>
            <div className="px-2.5 mb-1.5 text-[10px] font-bold text-slate-400 tracking-wider">
              {section.title}
            </div>
            <nav className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={clsx(
                      'flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors group',
                      isActive
                        ? 'bg-primary text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={clsx(
                          'w-4 h-4 shrink-0',
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                        )}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0',
                          isActive
                            ? 'bg-white/20 text-white'
                            : item.badge === 'Action' || item.badge === 'P1'
                            ? 'bg-[#DC5555]/20 text-[#FFA4A4]'
                            : 'bg-[#1E293B] text-slate-400 group-hover:text-slate-200'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* SLA Protection Status Badge */}
      <div className="p-3 mx-3 mb-2 bg-[#192231] border border-[#27354A] rounded-lg">
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span className="text-[11px] font-semibold text-white">SLA Ingestion Live</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-tight">
          Monitoring 5 tenants • 99.88% actual vs 99.95% target
        </p>
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-[#1E293B] bg-[#0E1420] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#374151] border border-[#4B5563] text-white flex items-center justify-center font-semibold text-xs shrink-0">
              ER
            </div>
            <div className="truncate">
              <span className="text-xs font-semibold text-white block truncate">Elena Rostova</span>
              <span className="text-[10px] text-slate-400 block truncate">Legal & Compliance Lead</span>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-success shrink-0" title="Active" />
        </div>
      </div>
    </aside>
  );
}
