'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  Lock,
  User,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  LogOut,
  Building2
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/settings';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ user: string; role: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if session is already active
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setCurrentUser({ user: data.user, role: data.role });
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both your administrator username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCurrentUser({ user: data.user, role: data.role });
        router.push(returnUrl);
      } else {
        setError(data.error || 'Authentication failed. Check your credentials in server .env.local.');
      }
    } catch (err: any) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
      setCurrentUser(null);
      setError(null);
    } catch (err) {}
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-border shadow-card p-6 sm:p-8 space-y-6">
      <div className="border-b border-neutral-border pb-4">
        <h2 className="text-base font-bold text-neutral-primary flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          <span>Administrator Authentication</span>
        </h2>
        <p className="text-xs text-neutral-secondary mt-1">
          Sign in with server-configured administrator credentials to access financial actions and PayPal gateways.
        </p>
      </div>

      {/* Active Session Notice */}
      {currentUser ? (
        <div className="p-4 bg-success-bg border border-[#C3EAD9] rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-success font-medium text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Active Administrator Session Detected</span>
          </div>
          <div className="text-xs text-neutral-primary space-y-1">
            <p>Authenticated user: <strong className="font-semibold">{currentUser.user}</strong></p>
            <p>Assigned role: <Badge variant="success" size="sm">{currentUser.role}</Badge></p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => router.push(returnUrl)}
              icon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Continue to Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign Out
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 bg-danger-bg border border-[#FBCACA] rounded-lg text-danger text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-primary mb-1">
              Administrator Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter admin username"
                className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-primary mb-1">
              Administrator Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              loading={loading}
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              Sign In as Administrator
            </Button>
          </div>

          <div className="p-3 bg-[#FAFBFD] rounded-lg border border-neutral-border text-[11px] text-neutral-secondary space-y-1">
            <span className="font-semibold text-neutral-primary block">Zero Exposure Security Policy</span>
            <p>
              Authentication uses constant-time cryptographic comparison against <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> in <code>.env.local</code>. Successful sign-in issues an <code>HttpOnly</code> session cookie with 24h validity.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-white font-bold text-xl shadow-md mb-2">
            PB
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-xl font-bold tracking-tight text-neutral-primary">PROMISEBACK</h1>
            <span className="text-[10px] bg-[#1E293B] text-primary-light px-1.5 py-0.5 rounded font-mono font-medium">SLA</span>
          </div>
          <p className="text-xs text-neutral-secondary">
            Enterprise Contract Recovery & Financial Governance Platform
          </p>
        </div>

        <Suspense fallback={<div className="bg-white rounded-2xl p-8 border border-neutral-border text-center text-xs text-neutral-secondary">Loading authentication interface...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
