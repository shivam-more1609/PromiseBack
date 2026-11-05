'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  Filter,
  X,
  ExternalLink,
  Layers,
  ChevronRight,
  Database,
  ArrowUpRight,
  RefreshCw,
  SlidersHorizontal,
  Bot
} from 'lucide-react';

// Recharts components for custom Studio widgets
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';

// Dynamically import AgStudio from ag-studio-react with fallback
const AgStudio = dynamic(
  () => import('ag-studio-react').then((m) => m.AgStudio),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 w-full flex items-center justify-center bg-slate-50 border border-neutral-border rounded-xl text-xs text-neutral-secondary animate-pulse">
        <RefreshCw className="w-5 h-5 mr-2 text-primary animate-spin" />
        <span>Initializing AG Studio Embedded Canvas...</span>
      </div>
    )
  }
);

interface StudioData {
  entitlements: any[];
  incidents: any[];
  refunds: any[];
  availabilityTrends: any[];
  customers: any[];
}

export default function FinancialIntelligenceStudio() {
  const [data, setData] = useState<StudioData>({
    entitlements: [],
    incidents: [],
    refunds: [],
    availabilityTrends: [],
    customers: []
  });
  const [loading, setLoading] = useState(true);
  const [studioMode, setStudioMode] = useState<'view' | 'edit'>('view');

  // Cross-filtering state
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Studio Agent Framework State
  const [agentQuery, setAgentQuery] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentResponse, setAgentResponse] = useState<any>(null);
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'agent'; text: string; data?: any; guardrail?: string }>>([
    {
      role: 'agent',
      text: 'Welcome to PromiseBack Financial Intelligence Studio. I coordinate with our Data and Widget Agents to analyze SLA breach exposure and refund liabilities.',
      guardrail: 'AI cannot execute or disburse PayPal refunds directly. Authorization requires human dual-approval.'
    }
  ]);

  // Fetch real backend data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, entRes, incRes, refRes] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/entitlements').then((r) => r.json()),
        fetch('/api/incidents').then((r) => r.json()),
        fetch('/api/refunds').then((r) => r.json())
      ]);

      setData({
        entitlements: entRes.entitlements || [],
        incidents: incRes.incidents || [],
        refunds: refRes.refunds || [],
        availabilityTrends: statsRes.stats?.availabilityTrend || [],
        customers: statsRes.stats?.topCustomers || []
      });
    } catch (err) {
      console.error('Failed to load studio data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Format data into AG Studio data sources
  const studioDataSources = useMemo(() => {
    return {
      tables: [
        {
          tableName: 'entitlements',
          data: data.entitlements.map((e) => ({
            case_number: e.caseNumber,
            customer_name: e.customerName,
            contract_number: e.contractNumber,
            incident_number: e.incidentNumber,
            eligible_credit: e.eligibleCredit,
            status: e.status,
            uptime_actual: e.uptimeActual || 99.912
          }))
        },
        {
          tableName: 'incidents',
          data: data.incidents.map((i) => ({
            incident_number: i.incidentNumber,
            service: i.service,
            severity: i.severity,
            duration_minutes: i.durationMinutes,
            sla_breached: i.slaBreached ? 1 : 0
          }))
        },
        {
          tableName: 'refunds',
          data: data.refunds.map((r) => ({
            refund_id: r.id,
            customer_name: r.customerName,
            amount: r.refundAmount || r.amount || 0,
            status: r.status,
            channel: r.channel || 'PayPal Capture'
          }))
        }
      ]
    };
  }, [data]);

  // Cross-filtered entitlements
  const filteredEntitlements = useMemo(() => {
    return data.entitlements.filter((e) => {
      if (selectedCustomer && e.customerName !== selectedCustomer) return false;
      if (selectedService) {
        const inc = data.incidents.find((i) => i.incidentNumber === e.incidentNumber);
        if (inc && inc.service !== selectedService) return false;
      }
      return true;
    });
  }, [data.entitlements, data.incidents, selectedCustomer, selectedService]);

  // Cross-filtered incidents
  const filteredIncidents = useMemo(() => {
    return data.incidents.filter((i) => {
      if (selectedService && i.service !== selectedService) return false;
      return true;
    });
  }, [data.incidents, selectedService]);

  // Total liabilities
  const totalLiability = useMemo(() => {
    return filteredEntitlements.reduce((sum, e) => sum + e.eligibleCredit, 0);
  }, [filteredEntitlements]);

  // Customer compensation ranking
  const customerExposure = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEntitlements.forEach((e) => {
      map[e.customerName] = (map[e.customerName] || 0) + e.eligibleCredit;
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredEntitlements]);

  // SLA breach downtime by service
  const serviceDowntime = useMemo(() => {
    const map: Record<string, number> = {};
    filteredIncidents.forEach((i) => {
      map[i.service] = (map[i.service] || 0) + i.durationMinutes;
    });
    return Object.entries(map).map(([service, minutes]) => ({ service, minutes }));
  }, [filteredIncidents]);

  // Pending approvals
  const pendingApprovals = useMemo(() => {
    return filteredEntitlements.filter((e) => e.status === 'pending_approval' || e.status === 'approved');
  }, [filteredEntitlements]);

  // Refund history breakdown
  const refundBreakdown = useMemo(() => {
    const completed = data.refunds
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + (r.refundAmount || r.amount || 0), 0);
    const pending = pendingApprovals.reduce((sum, e) => sum + e.eligibleCredit, 0);
    return {
      completed,
      pending,
      count: data.refunds.length
    };
  }, [data.refunds, pendingApprovals]);

  // Handle Studio Agent Framework Query
  const handleRunAgentQuery = async (queryText?: string) => {
    const q = queryText || agentQuery;
    if (!q.trim()) return;

    setAgentLoading(true);
    setChatHistory((prev) => [...prev, { role: 'user', text: q }]);
    setAgentQuery('');

    try {
      const res = await fetch('/api/studio/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const result = await res.json();

      if (result.success) {
        setAgentResponse(result);
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'agent',
            text: result.summary,
            data: result.data,
            guardrail: result.guardrailNotice
          }
        ]);

        // Auto cross-filter if the agent highlighted a customer
        if (result.data?.highlightCustomerName) {
          setSelectedCustomer(result.data.highlightCustomerName);
        }
      }
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: 'agent', text: 'Encountered error evaluating query with Studio Agent.' }
      ]);
    } finally {
      setAgentLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary text-white rounded-lg shadow-sm">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-neutral-primary flex items-center gap-2">
                PromiseBack Financial Intelligence Studio
                <Badge variant="indigo" size="sm">
                  Powered by AG Studio 3.1
                </Badge>
              </h1>
              <p className="text-xs text-neutral-secondary mt-0.5">
                Embedded analytics, multi-dimensional SLA cross-filtering, and autonomous Studio Agent orchestration.
              </p>
            </div>
          </div>
        </div>

        {/* Studio Controls */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-[#F1F4F9] p-0.5 rounded-lg border border-neutral-border">
            <button
              onClick={() => setStudioMode('view')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                studioMode === 'view'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              Executive View Mode
            </button>
            <button
              onClick={() => setStudioMode('edit')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                studioMode === 'edit'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-neutral-secondary hover:text-neutral-primary'
              }`}
            >
              Studio Builder (Edit)
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Sync Telemetry
          </Button>
        </div>
      </div>

      {/* Cross-Filtering Active Bar */}
      {(selectedCustomer || selectedService) && (
        <div className="bg-primary-light border border-[#C7C5FF] p-3 rounded-xl flex items-center justify-between text-xs text-primary">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <span className="font-bold">Active Studio Cross-Filter:</span>
            {selectedCustomer && (
              <span className="bg-white px-2.5 py-0.5 rounded-full border border-primary/30 font-semibold">
                Customer: {selectedCustomer}
              </span>
            )}
            {selectedService && (
              <span className="bg-white px-2.5 py-0.5 rounded-full border border-primary/30 font-semibold">
                Service: {selectedService}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setSelectedService(null);
            }}
            className="flex items-center gap-1 font-bold hover:underline"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>
      )}

      {/* Main Studio Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Financial Intelligence Dashboards */}
        <div className="lg:col-span-2 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-neutral-border shadow-subtle">
              <span className="text-[11px] text-neutral-secondary font-medium">Calculated Compensation Exposure</span>
              <div className="text-2xl font-bold text-neutral-primary font-mono mt-1">
                ${totalLiability.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-danger font-medium flex items-center gap-1 mt-1">
                <TrendingDown className="w-3 h-3" />
                Across {filteredEntitlements.length} Active SLA Cases
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-border shadow-subtle">
              <span className="text-[11px] text-neutral-secondary font-medium">Pending Dual-Approval Sign-off</span>
              <div className="text-2xl font-bold text-warning font-mono mt-1">
                ${refundBreakdown.pending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-neutral-secondary font-medium block mt-1">
                {pendingApprovals.length} Cases Awaiting CFO Review
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-border shadow-subtle">
              <span className="text-[11px] text-neutral-secondary font-medium">Executed PayPal Sandbox Refunds</span>
              <div className="text-2xl font-bold text-success font-mono mt-1">
                ${refundBreakdown.completed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-success font-medium flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3 h-3" />
                Verified via Capture API
              </span>
            </div>
          </div>

          {/* Studio Mode: View Dashboard vs AG Studio Builder */}
          {studioMode === 'edit' ? (
            <div className="bg-white border border-neutral-border rounded-xl p-4 shadow-subtle space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-border pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-neutral-primary">
                    AG Studio Embedded Builder (Drag & Drop Canvas)
                  </span>
                </div>
                <Badge variant="indigo" size="sm">Edit Mode Active</Badge>
              </div>
              <div className="h-[460px] w-full border border-dashed border-slate-300 rounded-lg overflow-hidden">
                {React.createElement(AgStudio as any, {
                  data: studioDataSources,
                  mode: 'edit',
                  style: { height: '100%', width: '100%' }
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Dashboard Row 1: Compensation Exposure by Customer & SLA Breaches */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Widget 1: Customer Compensation Exposure */}
                <Card
                  title="Customer Compensation Exposure"
                  subtitle="Ranked liability per enterprise tenant (Click bar to cross-filter)"
                  badge={<Badge variant="danger" size="sm">Covenant Liability</Badge>}
                >
                  <div className="h-60 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={customerExposure} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                        <Tooltip
                          formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Liability']}
                        />
                        <Bar
                          dataKey="amount"
                          fill="#5146E5"
                          radius={[0, 4, 4, 0]}
                          onClick={(entry) => setSelectedCustomer(entry.name)}
                          cursor="pointer"
                        >
                          {customerExposure.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={selectedCustomer === entry.name ? '#139B76' : '#5146E5'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Widget 2: SLA Breach Downtime by Service */}
                <Card
                  title="SLA Breach Analysis"
                  subtitle="Cumulative downtime minutes across microservices"
                  badge={<Badge variant="warning" size="sm">Downtime Minutes</Badge>}
                >
                  <div className="h-60 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serviceDowntime}>
                        <XAxis dataKey="service" tick={{ fontSize: 9 }} interval={0} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => [`${v} mins`, 'Downtime']} />
                        <Bar
                          dataKey="minutes"
                          fill="#DC5555"
                          radius={[4, 4, 0, 0]}
                          onClick={(entry) => setSelectedService(entry.service)}
                          cursor="pointer"
                        >
                          {serviceDowntime.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={selectedService === entry.service ? '#139B76' : '#DC5555'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* Dashboard Row 2: Service Availability Trends */}
              <Card
                title="Service Availability Trends vs Contractual SLA Covenant"
                subtitle="Daily telemetry time-series measured against 99.95% target threshold"
                badge={<Badge variant="success" size="sm">30-Day Window</Badge>}
              >
                <div className="h-60 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.availabilityTrends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[99.8, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(val: any) => [`${Number(val).toFixed(3)}%`, 'Availability']} />
                      <Area
                        type="monotone"
                        dataKey="actualAvailability"
                        stroke="#5146E5"
                        fill="#EEEDFF"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="slaThreshold"
                        stroke="#DC5555"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Dashboard Row 3: Pending Approvals & Compensation Cases */}
              <Card
                title="Pending Dual-Approval Queue"
                subtitle="Cases awaiting human compliance review prior to PayPal remedy execution"
                action={
                  <Link href="/compensation-review">
                    <Button variant="primary" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                      Open Approval Queue
                    </Button>
                  </Link>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-border text-neutral-secondary font-semibold">
                        <th className="py-2.5">Case #</th>
                        <th className="py-2.5">Customer</th>
                        <th className="py-2.5">Outage Incident</th>
                        <th className="py-2.5 text-right">Eligible Credit</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-border">
                      {pendingApprovals.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-neutral-secondary">
                            No pending cases awaiting approval under current cross-filter.
                          </td>
                        </tr>
                      ) : (
                        pendingApprovals.slice(0, 5).map((e) => (
                          <tr key={e.id} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 font-mono font-bold text-neutral-primary">{e.caseNumber}</td>
                            <td className="py-2.5 font-semibold text-neutral-primary">{e.customerName}</td>
                            <td className="py-2.5 font-mono text-neutral-secondary">{e.incidentNumber}</td>
                            <td className="py-2.5 text-right font-mono font-bold text-primary">
                              ${e.eligibleCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5">
                              <Badge variant="warning" size="sm" dot>Pending Dual-Approval</Badge>
                            </td>
                            <td className="py-2.5 text-right">
                              <Link href={`/compensation-review?caseId=${e.id}`}>
                                <button className="px-2.5 py-1 bg-primary text-white rounded font-medium hover:bg-[#4338CA] transition-colors">
                                  Authorize
                                </button>
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Right 1 Column: Studio Agent Framework Assistant */}
        <div className="space-y-4">
          <Card
            title="Studio Agent Framework"
            subtitle="Autonomous multi-agent query coordination & financial analytics"
            badge={<Badge variant="indigo" size="sm">Studio Agent 3.1</Badge>}
            className="flex flex-col h-[780px]"
          >
            {/* Multi-Agent Architecture Badges */}
            <div className="grid grid-cols-3 gap-1.5 pb-3 border-b border-neutral-border text-[10px] text-center">
              <div className="bg-[#FAFBFD] p-1.5 rounded border border-neutral-border">
                <span className="font-bold text-primary block">Lead Agent</span>
                <span className="text-neutral-secondary text-[9px]">Routing</span>
              </div>
              <div className="bg-[#FAFBFD] p-1.5 rounded border border-neutral-border">
                <span className="font-bold text-success block">Data Agent</span>
                <span className="text-neutral-secondary text-[9px]">Live Tables</span>
              </div>
              <div className="bg-[#FAFBFD] p-1.5 rounded border border-neutral-border">
                <span className="font-bold text-warning block">Widget Agent</span>
                <span className="text-neutral-secondary text-[9px]">Cross-Filter</span>
              </div>
            </div>

            {/* AI Financial Guardrail Alert */}
            <div className="bg-[#FFF5E5] border border-[#FFE2B3] p-2.5 rounded-lg text-[11px] text-[#925B0E] flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <strong className="block">Financial Security Guardrail:</strong>
                Studio Agent analyzes and filters data. AI cannot execute PayPal refunds directly.
              </div>
            </div>

            {/* Chat History Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-2">
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] p-3 rounded-xl text-xs ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-none'
                        : 'bg-[#F8FAFC] border border-neutral-border text-neutral-primary rounded-bl-none shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold mb-1 text-[11px]">
                      {msg.role === 'user' ? (
                        <span>Finance Operator</span>
                      ) : (
                        <>
                          <Bot className="w-3.5 h-3.5 text-primary" />
                          <span>Studio Agent</span>
                        </>
                      )}
                    </div>
                    <p className="leading-relaxed">{msg.text}</p>

                    {/* Agent Data Highlights */}
                    {msg.data?.rankedCustomers && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-secondary">
                          Ranked Customer Exposure:
                        </span>
                        {msg.data.rankedCustomers.map((c: any, cIdx: number) => (
                          <div
                            key={cIdx}
                            onClick={() => setSelectedCustomer(c.customerName)}
                            className="bg-white p-2 rounded border border-neutral-border hover:border-primary cursor-pointer transition-colors flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-neutral-primary block">{c.customerName}</span>
                              <span className="text-[10px] text-neutral-secondary">{c.plan}</span>
                            </div>
                            <span className="font-mono font-bold text-danger text-xs">
                              ${c.totalLiability.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {agentLoading && (
                <div className="flex items-center gap-2 text-xs text-neutral-secondary p-2 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>Data Agent querying live store tables...</span>
                </div>
              )}
            </div>

            {/* Prompt Starters */}
            <div className="pt-2 border-t border-neutral-border space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-secondary block">
                Suggested Studio Queries:
              </span>
              <button
                onClick={() => handleRunAgentQuery('Show customers with the highest compensation exposure in the current billing period.')}
                className="w-full text-left text-[11px] p-2 bg-[#F6F8FC] hover:bg-primary-light hover:text-primary rounded-lg border border-neutral-border transition-colors truncate block"
              >
                👉 "Show customers with highest compensation exposure"
              </button>
              <button
                onClick={() => handleRunAgentQuery('Which microservice caused the most contractual downtime minutes?')}
                className="w-full text-left text-[11px] p-2 bg-[#F6F8FC] hover:bg-primary-light hover:text-primary rounded-lg border border-neutral-border transition-colors truncate block"
              >
                👉 "Which microservice caused the most downtime?"
              </button>
            </div>

            {/* Agent Input Bar */}
            <div className="pt-2 flex items-center gap-2">
              <input
                type="text"
                placeholder="Ask Studio Agent about SLA breach exposure..."
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunAgentQuery()}
                className="flex-1 bg-[#F8FAFC] border border-neutral-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleRunAgentQuery()}
                disabled={agentLoading || !agentQuery.trim()}
                icon={<Send className="w-3.5 h-3.5" />}
              >
                Ask
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
