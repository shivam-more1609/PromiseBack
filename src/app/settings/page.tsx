'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  Settings,
  CreditCard,
  ShieldCheck,
  Key,
  Webhook,
  CheckCircle2,
  Lock,
  Building2,
  AlertTriangle,
  Info,
  RefreshCw,
  ExternalLink,
  ShoppingBag,
  ArrowRight,
  Check,
  Clock,
  LogOut,
  User
} from 'lucide-react';

export default function SettingsPage() {
  const [sandboxConfigured, setSandboxConfigured] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [dualApprovalThreshold, setDualApprovalThreshold] = useState('2500');

  // Administrator Session State
  const [session, setSession] = useState<{ authenticated: boolean; user?: string; role?: string } | null>(null);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Gateway Connection Statuses
  const [gatewayStatus, setGatewayStatus] = useState<{
    oauthConfigured: boolean;
    webhookConfigured: boolean;
    webhookId: string | null;
    maskedClientId: string | null;
    environment: 'sandbox' | 'live';
  }>({
    oauthConfigured: false,
    webhookConfigured: false,
    webhookId: null,
    maskedClientId: null,
    environment: 'sandbox'
  });

  const [captureReadiness, setCaptureReadiness] = useState<{
    ready: boolean;
    hasGenuineCaptures: boolean;
    genuineCapturesCount: number;
    status: string;
  }>({
    ready: false,
    hasGenuineCaptures: false,
    genuineCapturesCount: 0,
    status: 'CREDENTIALS_REQUIRED'
  });

  // Sandbox Live Checkout & Capture State
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('cust-101');
  const [testAmount, setTestAmount] = useState('10.00');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [verifyingApproval, setVerifyingApproval] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [genuineCaptures, setGenuineCaptures] = useState<any[]>([]);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
        setSession({ authenticated: true, user: data.user, role: data.role });
      } else {
        setSession({ authenticated: false });
      }
    } catch (err) {
      setSession({ authenticated: false });
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword) {
      setAuthError('Please enter both username and password.');
      return;
    }
    setAuthenticating(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername.trim(), password: adminPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSession({ authenticated: true, user: data.user, role: data.role });
        setAdminPassword('');
        setCaptureMessage(`Authenticated successfully as ${data.user} (${data.role}). Sandbox mutation actions unlocked.`);
      } else {
        setAuthError(data.error || 'Authentication failed. Check credentials in .env.local.');
      }
    } catch (err: any) {
      setAuthError(`Network error: ${err.message}`);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
      setSession({ authenticated: false });
      setCaptureMessage('Signed out. Mutating actions disabled.');
    } catch (err) {}
  };

  const fetchCheckoutData = async () => {
    try {
      const res = await fetch('/api/checkout', { credentials: 'include' });
      const data = await res.json();
      if (data.customers) setCustomers(data.customers);
      if (data.genuineCaptures) setGenuineCaptures(data.genuineCaptures);
      if (data.gatewayStatus) setGatewayStatus(data.gatewayStatus);
      if (data.captureReadiness) setCaptureReadiness(data.captureReadiness);
      setSandboxConfigured(!!data.sandboxConfigured);
    } catch (err) {}
  };

  const checkGatewayStatus = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/checkout', { credentials: 'include' });
      const data = await res.json();
      setSandboxConfigured(!!data.sandboxConfigured);
      if (data.gatewayStatus) setGatewayStatus(data.gatewayStatus);
      if (data.captureReadiness) setCaptureReadiness(data.captureReadiness);
      if (data.genuineCaptures) setGenuineCaptures(data.genuineCaptures);

      if (data.sandboxConfigured && data.gatewayStatus?.webhookConfigured) {
        setCheckResult(`PayPal Sandbox OAuth and Webhook (${data.gatewayStatus.webhookId}) verified active in server environment.`);
      } else if (data.sandboxConfigured) {
        setCheckResult('PayPal Sandbox OAuth active. Webhook ID needs configuration.');
      } else {
        setCheckResult('PayPal Sandbox credentials missing in .env.local.');
      }
    } catch (err: any) {
      setCheckResult(`Error checking gateway: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  const CHECKOUT_STORAGE_KEY = 'promiseback_sandbox_checkout';

  const saveCheckoutState = (state: {
    orderId: string;
    customerId: string;
    amount: string;
    approvalUrl: string | null;
    status: string;
  }) => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({
          ...state,
          timestamp: Date.now()
        }));
      }
    } catch {}
  };

  const clearCheckoutState = () => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      }
    } catch {}
  };

  const handleResetCheckout = () => {
    clearCheckoutState();
    setActiveOrderId(null);
    setApprovalUrl(null);
    setOrderStatus(null);
    setCaptureMessage('Checkout state reset. You may generate a fresh order.');
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleCreateOrder = async () => {
    setCreatingOrder(true);
    setCaptureMessage(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'create_order',
          customerId: selectedCustomerId,
          amount: parseFloat(testAmount) || 10.00,
          currency: 'USD'
        })
      });
      const data = await res.json();
      if (data.success) {
        setActiveOrderId(data.orderId);
        setApprovalUrl(data.approvalUrl);
        setOrderStatus(data.status || 'CREATED');
        saveCheckoutState({
          orderId: data.orderId,
          customerId: selectedCustomerId,
          amount: testAmount,
          approvalUrl: data.approvalUrl,
          status: data.status || 'CREATED'
        });
        setCaptureMessage(`Order ${data.orderId} created (Status: CREATED). Click "Open Buyer Approval" to sign in with a Sandbox Personal buyer account, then click "Verify Approval".`);
      } else {
        setCaptureMessage(`Order creation error: ${data.error}`);
      }
    } catch (err: any) {
      setCaptureMessage(`Error: ${err.message}`);
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleVerifyApproval = async (orderIdToVerify?: string) => {
    const id = orderIdToVerify || activeOrderId;
    if (!id) return;
    setVerifyingApproval(true);
    try {
      const res = await fetch(`/api/checkout?orderId=${encodeURIComponent(id)}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.status) {
        setOrderStatus(data.status);
        if (data.status === 'APPROVED') {
          setCaptureMessage(`Buyer approval verified on PayPal Sandbox! Order ${id} is APPROVED. Capture Payment is now unlocked.`);
          saveCheckoutState({
            orderId: id,
            customerId: selectedCustomerId,
            amount: testAmount,
            approvalUrl: approvalUrl || `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
            status: 'APPROVED'
          });
        } else if (data.status === 'CREATED') {
          setCaptureMessage(`Order ${id} is still in "CREATED" status. Please complete the purchase in the PayPal Sandbox popup window, then re-verify.`);
        } else if (data.status === 'COMPLETED') {
          setCaptureMessage(`Order ${id} is already COMPLETED and captured.`);
        } else {
          setCaptureMessage(`Order status: ${data.status}`);
        }
      } else {
        setCaptureMessage(`Verification error: ${data.error || 'Failed to retrieve order status from PayPal.'}`);
      }
    } catch (err: any) {
      setCaptureMessage(`Verification network error: ${err.message}`);
    } finally {
      setVerifyingApproval(false);
    }
  };

  const handleCaptureOrder = async () => {
    if (!activeOrderId) return;
    setCapturing(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'capture_order',
          orderId: activeOrderId,
          customerId: selectedCustomerId
        })
      });
      const data = await res.json();
      if (data.success) {
        setOrderStatus('COMPLETED');
        clearCheckoutState();
        setCaptureMessage(`SUCCESS! Genuine PayPal Sandbox capture ${data.captureId} completed ($${data.amount?.toFixed(2)} USD). Securely mapped to ${data.customerName} in PromiseBack ledger.`);
        fetchCheckoutData();
      } else {
        if (data.orderStatus) {
          setOrderStatus(data.orderStatus);
        }
        setCaptureMessage(`Capture rejected: ${data.error}`);
      }
    } catch (err: any) {
      setCaptureMessage(`Error: ${err.message}`);
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => {
    fetchSession();
    checkGatewayStatus();
    fetchCheckoutData();

    // Phase 4: Order ID Recovery from PayPal return parameters & persistent state restoration
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      const payerIdParam = urlParams.get('PayerID');
      const approvedParam = urlParams.get('order_approved');
      const cancelledParam = urlParams.get('order_cancelled');

      let orderToVerify: string | null = null;
      let customerToRestore: string = selectedCustomerId;

      if (tokenParam) {
        orderToVerify = tokenParam.trim();
        setActiveOrderId(orderToVerify);
        setApprovalUrl(`https://www.sandbox.paypal.com/checkoutnow?token=${orderToVerify}`);
      } else {
        // Restore from sessionStorage across navigation
        try {
          const savedRaw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
          if (savedRaw) {
            const saved = JSON.parse(savedRaw);
            if (saved.orderId && Date.now() - (saved.timestamp || 0) < 4 * 60 * 60 * 1000) {
              orderToVerify = saved.orderId;
              setActiveOrderId(saved.orderId);
              if (saved.customerId) {
                setSelectedCustomerId(saved.customerId);
                customerToRestore = saved.customerId;
              }
              if (saved.amount) setTestAmount(saved.amount);
              if (saved.approvalUrl) setApprovalUrl(saved.approvalUrl);
              if (saved.status) setOrderStatus(saved.status);
            }
          }
        } catch {}
      }

      if (cancelledParam === 'true') {
        if (orderToVerify) setActiveOrderId(orderToVerify);
        setOrderStatus('CANCELLED');
        setCaptureMessage(`⚠️ Buyer cancelled checkout on PayPal Sandbox for order ${orderToVerify || ''}.`);
      } else if (orderToVerify) {
        // Perform Server-Side Approval Verification
        setVerifyingApproval(true);
        setCaptureMessage(`Restored order ${orderToVerify} from redirect. Verifying approval status with PayPal Sandbox...`);

        fetch(`/api/checkout?orderId=${encodeURIComponent(orderToVerify)}`, { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.status) {
              setOrderStatus(data.status);
              if (data.status === 'APPROVED') {
                setCaptureMessage(`✅ Buyer approval verified on PayPal Sandbox! Order ${orderToVerify} is APPROVED${payerIdParam ? ` (Payer ID: ${payerIdParam})` : ''}. Step 3 (Capture Payment) is now unlocked.`);
                saveCheckoutState({
                  orderId: orderToVerify!,
                  customerId: customerToRestore,
                  amount: testAmount,
                  approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderToVerify}`,
                  status: 'APPROVED'
                });
              } else if (data.status === 'COMPLETED') {
                setCaptureMessage(`Order ${orderToVerify} is already COMPLETED and captured on PayPal Sandbox.`);
              } else if (data.status === 'CREATED') {
                setCaptureMessage(`Order ${orderToVerify} restored (Status: CREATED). Awaiting buyer approval in Step 2.`);
              } else {
                setCaptureMessage(`Order ${orderToVerify} status on PayPal Sandbox: ${data.status}`);
              }
            } else {
              setCaptureMessage(`Verification notice: ${data.error || 'Failed to inspect order on PayPal Sandbox.'}`);
            }
          })
          .catch(err => {
            setCaptureMessage(`Network error verifying order: ${err.message}`);
          })
          .finally(() => {
            setVerifyingApproval(false);
          });
      }
    }
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Gateway & Security Configuration
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            PayPal Sandbox OAuth integration, dual-approval financial rules, and telemetry webhooks.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={checkGatewayStatus}
          loading={checking}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Verify Sandbox Gateway
        </Button>
      </div>

      {checkResult && (
        <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
          sandboxConfigured ? 'bg-success-bg border border-[#C3EAD9] text-success' : 'bg-warning-bg border border-[#FFE2B3] text-[#925B0E]'
        }`}>
          {sandboxConfigured ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
          <span>{checkResult}</span>
        </div>
      )}

      {/* Section 1: PayPal Gateway & Security Configuration */}
      <Card
        title="PayPal Sandbox Capture Refunds Gateway"
        subtitle="Server-side OAuth 2.0 and capture reversal endpoint (POST /v2/payments/captures/{id}/refund)"
        badge={sandboxConfigured ? <Badge variant="success" size="sm" dot>Sandbox Connected</Badge> : <Badge variant="warning" size="sm" dot>Credentials Needed</Badge>}
        padding="md"
      >
        <div className="space-y-4 text-xs">
          {/* Separate Connection Statuses: OAuth, Webhook, Capture Readiness */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. PayPal OAuth */}
            <div className="p-3 bg-[#FAFBFD] border border-neutral-border rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-secondary uppercase tracking-wider">PayPal OAuth 2.0</span>
                {gatewayStatus.oauthConfigured ? (
                  <Badge variant="success" size="sm" dot>Connected</Badge>
                ) : (
                  <Badge variant="warning" size="sm" dot>Disconnected</Badge>
                )}
              </div>
              <p className="text-xs font-semibold text-neutral-primary">
                {gatewayStatus.oauthConfigured ? 'Client Credentials Active' : 'Credentials Missing'}
              </p>
              <p className="text-[10px] text-neutral-secondary font-mono">
                API Base: api-m.sandbox.paypal.com
              </p>
            </div>

            {/* 2. Webhook Registration */}
            <div className="p-3 bg-[#FAFBFD] border border-neutral-border rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-secondary uppercase tracking-wider">Webhook Registration</span>
                {gatewayStatus.webhookConfigured ? (
                  <Badge variant="success" size="sm" dot>Registered</Badge>
                ) : (
                  <Badge variant="warning" size="sm" dot>Unregistered</Badge>
                )}
              </div>
              <p className="text-xs font-mono font-semibold text-neutral-primary truncate" title={gatewayStatus.webhookId || 'None'}>
                {gatewayStatus.webhookId ? gatewayStatus.webhookId : 'Not Configured'}
              </p>
              <p className="text-[10px] text-neutral-secondary">
                {gatewayStatus.webhookConfigured ? 'Signature verification enabled' : 'Missing PAYPAL_SANDBOX_WEBHOOK_ID'}
              </p>
            </div>

            {/* 3. Capture Readiness */}
            <div className="p-3 bg-[#FAFBFD] border border-neutral-border rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-secondary uppercase tracking-wider">Capture Readiness</span>
                {captureReadiness.ready ? (
                  <Badge variant="indigo" size="sm" dot>Ready</Badge>
                ) : (
                  <Badge variant="neutral" size="sm">Awaiting Config</Badge>
                )}
              </div>
              <p className="text-xs font-semibold text-neutral-primary">
                {genuineCaptures.length > 0 
                  ? `${genuineCaptures.length} Genuine Capture${genuineCaptures.length > 1 ? 's' : ''} Mapped`
                  : (gatewayStatus.oauthConfigured ? 'Orders V2 Pipeline Ready' : 'OAuth Required')}
              </p>
              <p className="text-[10px] text-neutral-secondary font-mono">
                POST /v2/checkout/orders/&#123;id&#125;/capture
              </p>
            </div>
          </div>

          {/* Zero Client Secret Exposure Architecture */}
          <div className="p-3 bg-[#EEEDFF] border border-[#D5D3FF] rounded-lg text-[#3730A3] space-y-1">
            <span className="font-semibold block flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero Client Secret Exposure Architecture</span>
            </span>
            <p className="text-[11px] leading-relaxed">
              In accordance with financial security standards, PayPal Client Secrets are never rendered or transmitted to browser frontend code. All OAuth client credential exchanges execute strictly on the server.
            </p>
          </div>

          {/* Server Environment Configuration */}
          <div className="bg-[#FAFBFD] p-4 rounded-xl border border-neutral-border space-y-2.5">
            <span className="font-semibold text-neutral-primary block">Server Environment Configuration (.env.local):</span>
            <div className="font-mono text-xs bg-white p-3 rounded-lg border border-neutral-border space-y-1 text-slate-800">
              <p><span className="text-neutral-secondary"># PayPal Developer Sandbox (Loaded securely from server)</span></p>
              <p>PAYPAL_SANDBOX_CLIENT_ID={gatewayStatus.maskedClientId || (sandboxConfigured ? '••••••••••••••••••••••••' : '<your_client_id_here>')}</p>
              <p>PAYPAL_SANDBOX_CLIENT_SECRET=•••••••••••••••••••••••• <span className="text-[10px] text-neutral-secondary font-sans font-medium">(Hidden - Server Only)</span></p>
              <p>PAYPAL_SANDBOX_WEBHOOK_ID={gatewayStatus.webhookId || '<not_configured_in_env>'}</p>
            </div>
            <p className="text-[11px] text-neutral-secondary">
              Credentials are loaded securely on the server from <code>.env.local</code>. Never commit secrets to version control.
            </p>
          </div>
        </div>
      </Card>

      {/* Section 2: Live PayPal Sandbox Checkout (Clearly Labelled Testing Utility) */}
      <Card
        title="Live PayPal Sandbox Checkout & Capture Generator"
        subtitle="Administrator Testing Utility for Sandbox Validation — Not for Production Customer Billing"
        badge={<Badge variant="warning" size="sm">Testing Utility</Badge>}
        padding="md"
      >
        <div className="space-y-4 text-xs">
          {/* Explicit Testing Utility Banner */}
          <div className="p-3 bg-[#FFF8EE] border border-[#FFE2B3] rounded-lg text-[#925B0E] space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#D99124]" />
              <span>Administrator Testing Utility Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              This sandbox checkout workflow is an internal administrative testing tool used to generate authentic PayPal Sandbox orders and test captures. It is <strong>not</strong> a customer-facing payment portal and does not process real money or production payments.
            </p>
          </div>

          {/* Operator Authentication State Banner / Inline Login */}
          {session?.authenticated ? (
            <div className="p-3 bg-success-bg border border-[#C3EAD9] rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-success shrink-0" />
                <span className="text-xs text-neutral-primary">
                  Operator Authenticated: <strong className="font-semibold text-success">{session.user}</strong> ({session.role})
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAdminLogout}
                icon={<LogOut className="w-3 h-3" />}
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-neutral-primary font-semibold text-xs">
                  <Lock className="w-4 h-4 text-primary" />
                  <span>Administrator Sign-In Required for Order & Capture Actions</span>
                </div>
                <Badge variant="warning" size="sm">Session Required</Badge>
              </div>
              <p className="text-[11px] text-neutral-secondary">
                To prevent unauthorized mutations, executing orders or captures requires a signed HttpOnly session cookie. Sign in using your server administrator credentials:
              </p>
              {authError && (
                <div className="p-2.5 bg-danger-bg border border-[#FBCACA] rounded-lg text-danger text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}
              <form onSubmit={handleAdminLogin} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Admin Username"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-neutral-border rounded-lg text-xs text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
                <input
                  type="password"
                  placeholder="Admin Password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-neutral-border rounded-lg text-xs text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={authenticating}
                  icon={<Key className="w-3.5 h-3.5" />}
                >
                  Authenticate
                </Button>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#FAFBFD] rounded-xl border border-neutral-border">
            <div>
              <label className="block text-neutral-secondary font-medium mb-1">Target Customer Account</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs font-medium text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id}) - Current Balance: ${c.refundableBalance?.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-neutral-secondary font-medium mb-1">Deposit Amount ($ USD)</label>
              <input
                type="number"
                step="0.01"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs font-mono text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Action Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {/* Step 1: Create Order */}
            <div className="p-3 bg-white border border-neutral-border rounded-xl space-y-2">
              <span className="font-semibold text-neutral-primary flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center">1</span>
                <span>Create Sandbox Order</span>
              </span>
              <p className="text-[11px] text-neutral-secondary">
                Dispatches <code>POST /v2/checkout/orders</code> with intent CAPTURE.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={handleCreateOrder}
                loading={creatingOrder}
                disabled={!sandboxConfigured || !session?.authenticated}
              >
                Generate PayPal Order
              </Button>
              {!session?.authenticated && (
                <p className="text-[10px] text-warning font-medium text-center">Sign in above to enable.</p>
              )}
            </div>

            {/* Step 2: Buyer Approval & Status Verification */}
            <div className={`p-3 border rounded-xl space-y-2 ${approvalUrl ? 'bg-[#EEEDFF] border-[#D5D3FF]' : 'bg-[#F8FAFC] border-neutral-border opacity-70'}`}>
              <span className="font-semibold text-neutral-primary flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center">2</span>
                <span>Buyer Approval</span>
              </span>
              <p className="text-[11px] text-neutral-secondary">
                {activeOrderId ? (
                  <span>Order <strong className="font-mono text-primary">{activeOrderId}</strong>: Status <Badge variant={orderStatus === 'APPROVED' ? 'success' : 'neutral'} size="sm">{orderStatus || 'CREATED'}</Badge></span>
                ) : 'Awaiting Order creation in Step 1.'}
              </p>
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-white text-primary border-primary/30 hover:bg-primary/5"
                  onClick={() => approvalUrl && window.open(approvalUrl, '_blank')}
                  disabled={!approvalUrl}
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                >
                  Open Buyer Approval
                </Button>
                {activeOrderId && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-white text-neutral-primary border-neutral-border hover:bg-neutral-light"
                      onClick={() => handleVerifyApproval()}
                      loading={verifyingApproval}
                      icon={<RefreshCw className="w-3.5 h-3.5" />}
                    >
                      Verify Approval Status
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-[11px] text-neutral-secondary border-dashed border-neutral-border hover:text-error hover:border-error/30"
                      onClick={handleResetCheckout}
                    >
                      Clear / Reset Order
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Step 3: Capture & Map ID (Disabled until APPROVED & Authenticated) */}
            <div className={`p-3 border rounded-xl space-y-2 ${orderStatus === 'APPROVED' && session?.authenticated ? 'bg-[#EBF7F2] border-[#C3EAD9]' : 'bg-[#F8FAFC] border-neutral-border'}`}>
              <span className="font-semibold text-neutral-primary flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center ${
                  orderStatus === 'APPROVED' && session?.authenticated ? 'bg-success/10 text-success' : 'bg-neutral-muted/10 text-neutral-secondary'
                }`}>3</span>
                <span>Capture & Map ID</span>
              </span>
              <p className="text-[11px] text-neutral-secondary">
                {orderStatus === 'APPROVED' 
                  ? 'Buyer approved! Ready to execute capture.' 
                  : (orderStatus === 'COMPLETED' ? 'Order captured and mapped.' : 'Disabled: Requires buyer approval in Step 2.')}
              </p>
              <Button
                variant="primary"
                size="sm"
                className={`w-full ${orderStatus === 'APPROVED' && session?.authenticated ? 'bg-success hover:bg-success-dark text-white' : ''}`}
                onClick={handleCaptureOrder}
                loading={capturing}
                disabled={!activeOrderId || orderStatus !== 'APPROVED' || !session?.authenticated || capturing}
                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              >
                {orderStatus === 'COMPLETED' ? 'Captured & Mapped' : 'Capture Payment'}
              </Button>
            </div>
          </div>

          {/* Status Message */}
          {captureMessage && (
            <div className={`p-3 rounded-lg text-xs font-mono leading-relaxed border ${
              orderStatus === 'COMPLETED' 
                ? 'bg-success-bg border-[#C3EAD9] text-success' 
                : (orderStatus === 'APPROVED' 
                  ? 'bg-[#EBF7F2] border-[#C3EAD9] text-success'
                  : 'bg-[#F0F4FF] border-[#D0E0FF] text-[#1E3A8A]')
            }`}>
              {captureMessage}
            </div>
          )}

          {/* Genuine Captures Table */}
          {genuineCaptures.length > 0 && (
            <div className="pt-2 border-t border-neutral-border space-y-2">
              <span className="font-semibold text-neutral-primary block">
                Genuine Mapped Sandbox Captures ({genuineCaptures.length})
              </span>
              <div className="border border-neutral-border rounded-lg overflow-hidden">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-[#FAFBFD] border-b border-neutral-border text-neutral-secondary font-medium">
                    <tr>
                      <th className="px-3 py-2">Capture ID</th>
                      <th className="px-3 py-2">Order ID</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-border">
                    {genuineCaptures.map((cap: any) => (
                      <tr key={cap.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-3 py-2 font-mono font-medium text-primary">{cap.paypalCaptureId}</td>
                        <td className="px-3 py-2 font-mono text-neutral-secondary">{cap.paypalOrderId}</td>
                        <td className="px-3 py-2 font-medium text-neutral-primary">{cap.customerName}</td>
                        <td className="px-3 py-2 font-mono font-semibold">${cap.amount?.toFixed(2)} {cap.currency}</td>
                        <td className="px-3 py-2">
                          <Badge variant="success" size="sm">{cap.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-neutral-secondary">
                          {new Date(cap.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Section 3: Dual-Approval Governance */}
      <Card
        title="Dual-Approval Financial Governance"
        subtitle="Enforce multi-party authorization thresholds for SLA compensation disbursements"
        badge={<Badge variant="success" size="sm">Compliant</Badge>}
        padding="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              Executive Dual-Approval Threshold ($ USD)
            </label>
            <input
              type="number"
              value={dualApprovalThreshold}
              onChange={(e) => setDualApprovalThreshold(e.target.value)}
              className="w-full max-w-xs px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs font-mono text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[11px] text-neutral-secondary block mt-1">
              Any SLA remedy exceeding this threshold requires sign-off by both a Finance Director and Legal Counsel.
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-neutral-border text-neutral-secondary">
            <Lock className="w-4 h-4 text-primary" />
            <span>Audit trail SHA-256 chaining and durable disk persistence are active by default.</span>
          </div>
        </div>
      </Card>

      {/* Ingestion Webhook URL */}
      <Card
        title="Incident Ingestion Webhooks"
        subtitle="Receive Prometheus, Datadog and PagerDuty incident alerts automatically"
        padding="md"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              PromiseBack Webhook Ingestion URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value="https://angled-clang-kiln.ngrok-free.dev/api/webhooks/paypal"
                className="w-full px-3 py-2 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs font-mono text-neutral-primary select-all"
              />
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText('https://angled-clang-kiln.ngrok-free.dev/api/webhooks/paypal')}>
                Copy
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
