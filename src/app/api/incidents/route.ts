import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';
import { Incident } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let incidents = store.getIncidents();

    if (severity && severity !== 'all') {
      incidents = incidents.filter(i => i.severity.toLowerCase().includes(severity.toLowerCase()));
    }

    if (status && status !== 'all') {
      incidents = incidents.filter(i => i.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      incidents = incidents.filter(i => 
        i.incidentNumber.toLowerCase().includes(q) ||
        i.service.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ success: true, incidents });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. Enforce Authentication
    const auth = validateMutationAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.reason }, { status: 401 });
    }

    const body = await request.json();
    const { service, severity, summary, rootCause, durationMinutes, affectedRegions, affectedCustomerIds, isPlannedMaintenance } = body;

    if (!service || !summary) {
      return NextResponse.json({ success: false, error: 'Service and summary are required fields.' }, { status: 400 });
    }

    const duration = parseInt(durationMinutes, 10);
    if (isNaN(duration) || duration <= 0) {
      return NextResponse.json({ success: false, error: 'durationMinutes must be a positive integer.' }, { status: 400 });
    }

    const now = new Date();
    const started = new Date(now.getTime() - duration * 60000).toISOString();

    const newIncident: Incident = {
      id: `inc-${Date.now()}`,
      incidentNumber: `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      service,
      severity: severity || 'P2 - Major',
      status: 'resolved',
      summary,
      rootCause: rootCause || 'Incident root cause investigation completed.',
      startedAt: started,
      detectedAt: new Date(now.getTime() - (duration - 2) * 60000).toISOString(),
      mitigatedAt: new Date(now.getTime() - 5 * 60000).toISOString(),
      resolvedAt: now.toISOString(),
      durationMinutes: duration,
      affectedRegions: affectedRegions || ['us-east-1'],
      affectedCustomerIds: affectedCustomerIds || ['cust-101', 'cust-102'],
      affectedCustomersCount: (affectedCustomerIds || ['cust-101', 'cust-102']).length,
      slaBreached: duration > 21, // Over 21.6 min is a breach for 99.95% in 30 days
      slaImpactAnalysis: `Duration of ${duration} minutes evaluated against active SLAs within customer measurement scope.`,
      isPlannedMaintenance: !!isPlannedMaintenance,
      telemetry: [
        { time: 'T-30m', availability: 100.0, latencyMs: 45, errorRate: 0.01 },
        { time: 'T-20m', availability: 62.0, latencyMs: 2900, errorRate: 46.2 },
        { time: 'T-10m', availability: 85.0, latencyMs: 1400, errorRate: 15.0 },
        { time: 'T-0m', availability: 100.0, latencyMs: 42, errorRate: 0.02 }
      ],
      timeline: [
        {
          id: `tl-${Date.now()}-1`,
          timestamp: started,
          title: 'Incident Detected via Synthetic Probe',
          description: `Synthetic probe detected downtime on ${service}.`,
          phase: 'detection',
          actor: 'Synthetic Ingestion Probe'
        },
        {
          id: `tl-${Date.now()}-2`,
          timestamp: now.toISOString(),
          title: 'Incident Resolved',
          description: 'Telemetry verified nominal baseline recovery.',
          phase: 'resolved',
          actor: 'SRE Automation'
        }
      ]
    };

    const { incident, createdEntitlements } = store.addIncident(newIncident);
    return NextResponse.json({ success: true, incident, createdEntitlements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
