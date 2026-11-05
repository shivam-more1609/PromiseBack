import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = (body.query || '').trim().toLowerCase();

    const entitlements = store.getEntitlements() || [];
    const incidents = store.getIncidents() || [];
    const refunds = store.getRefunds() || [];
    const customers = store.getCustomers() || [];

    // Financial Guardrail Notice
    const FINANCIAL_GUARDRAIL_NOTICE = 
      'AI Financial Security Guardrail Enforced: Studio Agent provides analytical and query intelligence only. Direct financial disbursement, refund creation, and approval bypass are strictly prohibited. All financial transactions require human dual-approval authorization in the Compensation Review workbench.';

    // Intent 1: "Show customers with the highest compensation exposure in the current billing period"
    if (
      query.includes('highest') || 
      query.includes('compensation exposure') || 
      query.includes('highest exposure') ||
      query.includes('top customer')
    ) {
      // Calculate exposure per customer
      const exposureMap: Record<string, {
        customerId: string;
        customerName: string;
        plan: string;
        totalLiability: number;
        casesCount: number;
        cases: Array<{ caseNumber: string; incidentNumber: string; service: string; amount: number; status: string }>;
      }> = {};

      entitlements.forEach(e => {
        if (!exposureMap[e.customerId]) {
          exposureMap[e.customerId] = {
            customerId: e.customerId,
            customerName: e.customerName,
            plan: e.customerPlan || 'Enterprise Tier 1',
            totalLiability: 0,
            casesCount: 0,
            cases: []
          };
        }
        exposureMap[e.customerId].totalLiability += e.eligibleCredit;
        exposureMap[e.customerId].casesCount += 1;
        exposureMap[e.customerId].cases.push({
          caseNumber: e.caseNumber,
          incidentNumber: e.incidentNumber,
          service: e.incidentNumber,
          amount: e.eligibleCredit,
          status: e.status
        });
      });

      const rankedCustomers = Object.values(exposureMap)
        .sort((a, b) => b.totalLiability - a.totalLiability);

      const totalPeriodLiability = rankedCustomers.reduce((sum, c) => sum + c.totalLiability, 0);

      return NextResponse.json({
        success: true,
        intent: 'CUSTOMER_COMPENSATION_EXPOSURE',
        agentRole: 'Studio Financial Intelligence Agent',
        guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
        summary: `Identified ${rankedCustomers.length} enterprise customers with active SLA liability in the current billing period. Total contractual compensation exposure is $${totalPeriodLiability.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        data: {
          billingPeriod: 'Current Billing Period (January 2026)',
          totalExposure: totalPeriodLiability,
          rankedCustomers: rankedCustomers.slice(0, 5),
          recommendedAction: 'Review top cases in Compensation Review queue for dual-approval sign-off.',
          highlightCustomerId: rankedCustomers[0]?.customerId || null,
          highlightCustomerName: rankedCustomers[0]?.customerName || null
        }
      });
    }

    // Intent 2: "Which microservice caused the most contractual downtime minutes?"
    if (query.includes('microservice') || query.includes('downtime') || query.includes('service')) {
      const serviceDowntime: Record<string, { service: string; downtimeMinutes: number; incidentsCount: number; breachesCount: number }> = {};

      incidents.forEach(inc => {
        if (!serviceDowntime[inc.service]) {
          serviceDowntime[inc.service] = {
            service: inc.service,
            downtimeMinutes: 0,
            incidentsCount: 0,
            breachesCount: 0
          };
        }
        serviceDowntime[inc.service].downtimeMinutes += inc.durationMinutes;
        serviceDowntime[inc.service].incidentsCount += 1;
        if (inc.slaBreached) serviceDowntime[inc.service].breachesCount += 1;
      });

      const rankedServices = Object.values(serviceDowntime).sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);

      return NextResponse.json({
        success: true,
        intent: 'SERVICE_DOWNTIME_ANALYSIS',
        agentRole: 'Studio Telemetry Analytics Agent',
        guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
        summary: `Analysis of microservice reliability reveals ${rankedServices[0]?.service || 'N/A'} experienced the highest downtime (${rankedServices[0]?.downtimeMinutes || 0} minutes across ${rankedServices[0]?.incidentsCount || 0} outages).`,
        data: {
          rankedServices,
          topBreachService: rankedServices[0]?.service || null
        }
      });
    }

    // Intent 3: "What is our total pending PayPal refund liability?"
    if (query.includes('refund') || query.includes('pending') || query.includes('paypal')) {
      const pendingCases = entitlements.filter(e => e.status === 'pending_approval' || e.status === 'approved');
      const pendingTotal = pendingCases.reduce((sum, e) => sum + e.eligibleCredit, 0);
      const executedRefunds = refunds.filter(r => r.status === 'completed');
      const executedTotal = executedRefunds.reduce((sum, r) => sum + (r.refundAmount || 0), 0);

      return NextResponse.json({
        success: true,
        intent: 'REFUND_STATUS_QUERY',
        agentRole: 'Studio PayPal Reconciliation Agent',
        guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
        summary: `Total pending refund liability is $${pendingTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${pendingCases.length} eligible cases. Executed PayPal Sandbox refunds total $${executedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        data: {
          pendingLiability: pendingTotal,
          pendingCasesCount: pendingCases.length,
          executedRefundsTotal: executedTotal,
          executedRefundsCount: executedRefunds.length
        }
      });
    }

    // Default general query response with live stats
    const totalExposure = entitlements.reduce((sum, e) => sum + e.eligibleCredit, 0);
    return NextResponse.json({
      success: true,
      intent: 'GENERAL_ASSISTANCE',
      agentRole: 'Studio Lead Coordinator Agent',
      guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE,
      summary: `PromiseBack Studio monitors ${customers.length} customer contracts and ${incidents.length} system outages. Current total calculated compensation liability stands at $${totalExposure.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      data: {
        totalLiability: totalExposure,
        totalCustomers: customers.length,
        totalIncidents: incidents.length,
        suggestedQueries: [
          'Show customers with the highest compensation exposure in the current billing period.',
          'Which microservice caused the most contractual downtime minutes?',
          'What is our total pending PayPal refund liability?'
        ]
      }
    });

  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Studio agent evaluation error'
    }, { status: 500 });
  }
}
