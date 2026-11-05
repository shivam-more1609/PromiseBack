import { NextResponse } from 'next/server';
import { verifyPayPalWebhookSignature } from '@/lib/paypal';
import { store } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const headers = request.headers;
    const authAlgo = headers.get('paypal-auth-algo') || '';
    const certUrl = headers.get('paypal-cert-url') || '';
    const transmissionId = headers.get('paypal-transmission-id') || '';
    const transmissionSig = headers.get('paypal-transmission-sig') || '';
    const transmissionTime = headers.get('paypal-transmission-time') || '';
    const webhookId = process.env.PAYPAL_SANDBOX_WEBHOOK_ID || 'WH-SANDBOX-DEFAULT';

    const eventBody = await request.json();

    // Verify webhook signature with PayPal Sandbox
    const verification = await verifyPayPalWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookId,
      webhookEvent: eventBody
    });

    if (!verification.isValid) {
      return NextResponse.json({
        success: false,
        error: `WEBHOOK_SIGNATURE_INVALID: ${verification.error || 'Verification failed.'}`
      }, { status: 401 });
    }

    // Process & Reconcile verified webhook event idempotently
    const eventType = eventBody.event_type;
    const resource = eventBody.resource;

    const reconciliation = store.reconcileWebhookEvent({
      id: eventBody.id || transmissionId,
      event_type: eventType,
      resource: resource || {},
      create_time: eventBody.create_time || transmissionTime
    });

    return NextResponse.json({
      success: true,
      receivedEvent: eventType,
      resourceId: resource?.id,
      reconciliation
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
