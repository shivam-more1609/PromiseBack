import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // 1. Enforce Authentication
    const auth = validateMutationAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.reason }, { status: 401 });
    }

    const body = await request.json();
    const { entitlementId, decision, reviewedBy, role, notes, threshold } = body;

    if (!entitlementId || !decision) {
      return NextResponse.json({ success: false, error: 'entitlementId and decision are required' }, { status: 400 });
    }

    if (!['approved', 'rejected', 'review_requested'].includes(decision)) {
      return NextResponse.json({ success: false, error: 'Invalid decision type' }, { status: 400 });
    }

    const result = store.processApproval({
      entitlementId,
      decision,
      reviewedBy: reviewedBy || 'Senior Finance Officer',
      role,
      notes,
      threshold
    });

    return NextResponse.json({
      success: true,
      stage: result.stage,
      entitlement: result.entitlement,
      refundRecord: result.refundRecord,
      serviceCredit: result.serviceCredit
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
