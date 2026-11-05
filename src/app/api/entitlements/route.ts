import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customer = searchParams.get('customer');
    const incident = searchParams.get('incident');

    let entitlements = store.getEntitlements();

    if (status && status !== 'all') {
      entitlements = entitlements.filter(e => e.status === status);
    }

    if (customer) {
      entitlements = entitlements.filter(e => e.customerName.toLowerCase().includes(customer.toLowerCase()));
    }

    if (incident) {
      entitlements = entitlements.filter(e => e.incidentNumber.toLowerCase().includes(incident.toLowerCase()));
    }

    return NextResponse.json({ success: true, entitlements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
