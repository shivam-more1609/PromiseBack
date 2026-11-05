'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  Menu,
  ChevronRight,
  Command,
  CheckCircle,
  AlertTriangle,
  CreditCard,
  FileText,
  X,
  Lock,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export default function Header({ onOpenMobileMenu }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);

  // Keyboard shortcut Command+K or Ctrl+K for global search
  const [sessionUser, setSessionUser] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setSessionUser(data.user);
        } else {
          setSessionUser(null);
        }
      })
      .catch(() => setSessionUser(null));
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
      setSessionUser(null);
      router.refresh();
    } catch (err) {}
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute breadcrumbs
  const getBreadcrumbs = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return ['Overview', 'Dashboard'];
    
    const formatted = parts.map(part => {
      return part
        .replace('-', ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    });

    return formatted;
  };

  const breadcrumbs = getBreadcrumbs();

  const mockSearchResults = [
    { type: 'contract', title: 'Apex Fintech Master SLA 2026', subtitle: 'Target: 99.95% • Gold SLA', href: '/contracts' },
    { type: 'incident', title: 'INC-2026-0314 (Core Transaction API)', subtitle: '38m outage • P1 Critical', href: '/incidents' },
    { type: 'entitlement', title: 'Case ENT-2026-0881 ($3,625.00)', subtitle: 'Apex Fintech • Pending Dual-Approval', href: '/compensation-review' },
    { type: 'refund', title: 'REF-2026-PAYPAL-991 ($4,400.00)', subtitle: 'QuantVanguard • Payout Completed', href: '/refunds' },
  ].filter(item => 
    searchQuery === '' || 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-14 bg-white border-b border-neutral-border px-4 lg:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30">
      {/* Left side: Hamburger + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 text-neutral-secondary hover:text-neutral-primary hover:bg-[#F1F4F9] rounded-md transition-colors"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav className="flex items-center text-xs font-medium text-neutral-secondary">
          <span className="text-neutral-muted">PromiseBack</span>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-neutral-muted" />
              <span className={idx === breadcrumbs.length - 1 ? 'text-neutral-primary font-semibold' : ''}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right side: Search, Live Status, Notifications */}
      <div className="flex items-center gap-3">
        {/* Global Search Button */}
        <button
          onClick={() => setShowSearchModal(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#F6F8FC] hover:bg-[#EEF2F6] border border-neutral-border rounded-lg text-xs text-neutral-secondary transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-neutral-muted" />
          <span className="text-neutral-secondary">Search contracts, incidents...</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-white border border-[#CBD5E1] rounded text-neutral-secondary font-mono">
            ⌘K
          </kbd>
        </button>

        {/* PayPal Status Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-[#EEEDFF] border border-[#D5D3FF] rounded-md text-[11px] font-medium text-primary">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>PayPal Sandbox Ready</span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-neutral-secondary hover:text-neutral-primary hover:bg-[#F1F4F9] rounded-lg transition-colors relative"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-white" />
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-border rounded-xl shadow-elevated z-50 p-0 overflow-hidden animate-in fade-in duration-100">
              <div className="px-4 py-3 border-b border-neutral-border flex items-center justify-between bg-[#FAFBFC]">
                <span className="text-xs font-semibold text-neutral-primary">Operational Alerts</span>
                <Badge variant="danger" size="sm">2 Urgent</Badge>
              </div>
              <div className="divide-y divide-[#F1F4F9] max-h-80 overflow-y-auto">
                <div 
                  className="p-3 hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                  onClick={() => { setShowNotifications(false); router.push('/compensation-review'); }}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-neutral-primary">Pending Dual-Approval</p>
                      <p className="text-[11px] text-neutral-secondary mt-0.5">
                        Apex Fintech ($3,625.00) breached Gold SLA (INC-2026-0314). Review required.
                      </p>
                      <span className="text-[10px] text-neutral-muted mt-1 block">15 minutes ago</span>
                    </div>
                  </div>
                </div>

                <div 
                  className="p-3 hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                  onClick={() => { setShowNotifications(false); router.push('/refunds'); }}
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-neutral-primary">PayPal Payout Completed</p>
                      <p className="text-[11px] text-neutral-secondary mt-0.5">
                        Disbursed $4,400.00 to QuantVanguard Asset Partners via PayPal Batch #771892.
                      </p>
                      <span className="text-[10px] text-neutral-muted mt-1 block">1 hour ago</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-2 border-t border-neutral-border bg-[#FAFBFC] text-center">
                <button 
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Dismiss all
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Administrator Session Status / Login Control */}
        <div className="flex items-center gap-2 pl-2 border-l border-neutral-border">
          {sessionUser ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-success-bg border border-[#C3EAD9] rounded-md text-[11px] font-medium text-success">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline font-semibold">{sessionUser}</span>
                <span className="md:hidden font-semibold">Admin</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-neutral-secondary hover:text-danger hover:bg-neutral-light rounded-md transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push(`/login?returnUrl=${encodeURIComponent(pathname)}`)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary hover:bg-primary-hover text-white rounded-md text-[11px] font-medium transition-colors shadow-xs"
            >
              <Lock className="w-3 h-3" />
              <span>Admin Login</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Search Modal */}
      <Modal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search contracts, incidents, customers, entitlements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#F8FAFC] border border-neutral-border rounded-lg text-sm text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-neutral-secondary uppercase tracking-wider block mb-1">
              Quick Suggestions
            </span>
            {mockSearchResults.length > 0 ? (
              mockSearchResults.map((res, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setShowSearchModal(false);
                    router.push(res.href);
                  }}
                  className="p-2.5 rounded-lg hover:bg-[#F1F4F9] cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    {res.type === 'contract' && <FileText className="w-4 h-4 text-primary" />}
                    {res.type === 'incident' && <AlertTriangle className="w-4 h-4 text-warning" />}
                    {res.type === 'entitlement' && <CheckCircle className="w-4 h-4 text-success" />}
                    {res.type === 'refund' && <CreditCard className="w-4 h-4 text-indigo" />}
                    <div>
                      <span className="text-xs font-semibold text-neutral-primary block">{res.title}</span>
                      <span className="text-[11px] text-neutral-secondary block">{res.subtitle}</span>
                    </div>
                  </div>
                  <Badge variant="outline" size="sm">{res.type}</Badge>
                </div>
              ))
            ) : (
              <p className="text-xs text-neutral-secondary py-4 text-center">No matching entities found.</p>
            )}
          </div>
        </div>
      </Modal>
    </header>
  );
}
