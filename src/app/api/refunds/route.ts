import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';
import { isPayPalSandboxConfigured } from '@/lib/paypal';

export async function GET() {
  try {
    const refunds = store.getRefunds();
    const serviceCredits = store.getServiceCredits();
    const sandboxConfigured = isPayPalSandboxConfigured();
    return NextResponse.json({ success: true, refunds, serviceCredits, sandboxConfigured });
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
    const { action, id, actorName } = body;

    if (action === 'execute_paypal') {
      const { refund, result } = await store.executePayPalCaptureRefundAction({
        refundId: id,
        actorName: actorName || 'Disbursement Operations Lead'
      });

      if (!result.success) {
        return NextResponse.json({
          success: false,
          refund,
          error: result.error,
          requiresSandboxConfig: result.requiresSandboxConfig
        }, { status: 400 });
      }

      return NextResponse.json({ success: true, refund, result });
    }

    if (action === 'apply_credit') {
      const updated = store.applyServiceCredit(id, actorName || 'Billing Cycle Automation');
      return NextResponse.json({ success: true, serviceCredit: updated });
    }

    if (action === 'create_partial_refund') {
      const { entitlementId, amount, notes } = body;
      const newRefund = store.createPartialRefund({
        entitlementId,
        amount: parseFloat(amount),
        actorName: actorName || 'Disbursement Officer',
        notes
      });
      return NextResponse.json({ success: true, refund: newRefund });
    }

    return NextResponse.json({ success: false, error: 'Invalid action specified.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
