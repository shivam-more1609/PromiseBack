import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';
import { 
  createPayPalSandboxOrder, 
  getPayPalSandboxOrderDetails, 
  capturePayPalSandboxOrder,
  isPayPalSandboxConfigured,
  getPayPalGatewayStatus
} from '@/lib/paypal';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderIdParam = searchParams.get('orderId');

    // If querying details for a specific order:
    if (orderIdParam) {
      const orderDetails = await getPayPalSandboxOrderDetails(orderIdParam);
      return NextResponse.json({
        success: orderDetails.success,
        orderId: orderDetails.orderId,
        status: orderDetails.status,
        intent: orderDetails.intent,
        purchaseUnits: orderDetails.purchaseUnits,
        error: orderDetails.error
      });
    }

    store.syncFromDisk();
    const sandboxConfigured = isPayPalSandboxConfigured();
    const gatewayStatus = getPayPalGatewayStatus();
    const genuineCaptures = store.getGenuineCaptures();
    const customers = store.getCustomers().map(c => ({
      id: c.id,
      name: c.name,
      plan: c.plan,
      currency: c.currency || 'USD',
      paypalCaptureId: c.paypalCaptureId,
      refundableBalance: c.refundableBalance ?? c.monthlySpend
    }));

    const captureReadiness = {
      ready: sandboxConfigured,
      hasGenuineCaptures: genuineCaptures.length > 0,
      genuineCapturesCount: genuineCaptures.length,
      status: sandboxConfigured 
        ? (genuineCaptures.length > 0 ? 'READY_AND_MAPPED' : 'READY_AWAITING_CAPTURE')
        : 'CREDENTIALS_REQUIRED'
    };

    return NextResponse.json({
      success: true,
      sandboxConfigured,
      gatewayStatus,
      captureReadiness,
      genuineCaptures,
      customers
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. Enforce Operator Authentication
    const auth = validateMutationAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.reason }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    // Phase 1: Create Authentic Sandbox Order
    if (action === 'create_order') {
      const { amount, currency = 'USD', customerId } = body;
      const numAmount = parseFloat(amount);

      if (!numAmount || numAmount <= 0) {
        return NextResponse.json({ success: false, error: 'INVALID_AMOUNT: Amount must be greater than $0.00.' }, { status: 400 });
      }

      const customer = store.getCustomerById(customerId || 'cust-101');
      if (!customer) {
        return NextResponse.json({ success: false, error: `Customer not found for ID: ${customerId}` }, { status: 404 });
      }

      const result = await createPayPalSandboxOrder({
        amount: numAmount,
        currency,
        customerId: customer.id,
        customerName: customer.name
      });

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error,
          rawResponse: result.rawResponse
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        status: result.status,
        approvalUrl: result.approvalUrl,
        customerId: customer.id,
        customerName: customer.name,
        amount: numAmount,
        currency
      });
    }

    // Inspect Order Status
    if (action === 'get_order') {
      const { orderId } = body;
      if (!orderId) {
        return NextResponse.json({ success: false, error: 'orderId is required.' }, { status: 400 });
      }

      const result = await getPayPalSandboxOrderDetails(orderId);
      return NextResponse.json({ success: result.success, order: result });
    }

    // Phase 3 & 4: Capture Approved Order & Map Genuine Capture ID
    if (action === 'capture_order') {
      const { orderId, customerId } = body;

      if (!orderId) {
        return NextResponse.json({ success: false, error: 'orderId is required for capture.' }, { status: 400 });
      }

      const targetCustomerId = customerId || 'cust-101';
      const customer = store.getCustomerById(targetCustomerId);
      if (!customer) {
        return NextResponse.json({ success: false, error: `Target customer not found: ${targetCustomerId}` }, { status: 404 });
      }

      // 1. Prevent duplicate capture of an already captured order in store
      const existingCapture = store.getGenuineCaptures().find(c => c.paypalOrderId === orderId);
      if (existingCapture) {
        return NextResponse.json({
          success: false,
          orderId,
          captureId: existingCapture.paypalCaptureId,
          error: `ORDER_ALREADY_CAPTURED: Order ${orderId} has already been captured into PromiseBack (Capture ID: ${existingCapture.paypalCaptureId}). Duplicate captures are prohibited.`
        }, { status: 400 });
      }

      // 2. Enforce buyer approval on backend: verify order status directly on PayPal Sandbox
      const orderDetails = await getPayPalSandboxOrderDetails(orderId);
      if (!orderDetails.success) {
        return NextResponse.json({
          success: false,
          error: `PAYPAL_ORDER_VERIFICATION_FAILED: Could not inspect order on PayPal Sandbox (${orderDetails.error})`
        }, { status: 400 });
      }

      if (orderDetails.status === 'COMPLETED') {
        return NextResponse.json({
          success: false,
          orderId,
          orderStatus: orderDetails.status,
          error: `ORDER_ALREADY_COMPLETED: Order ${orderId} has already been captured and completed on PayPal Sandbox. A second capture cannot be executed.`
        }, { status: 400 });
      }

      if (orderDetails.status !== 'APPROVED') {
        return NextResponse.json({
          success: false,
          orderId,
          orderStatus: orderDetails.status,
          error: `BUYER_APPROVAL_REQUIRED: Order ${orderId} has status "${orderDetails.status}". PayPal requires the buyer to log in and approve the order before capture.`
        }, { status: 400 });
      }

      // 3. Execute capture against PayPal Orders v2 endpoint: POST /v2/checkout/orders/{id}/capture
      const result = await capturePayPalSandboxOrder({ orderId });

      if (!result.success || result.status !== 'COMPLETED') {
        return NextResponse.json({
          success: false,
          orderId,
          error: result.error || `ORDER_NOT_COMPLETED: Order status is "${result.status}". Capture requires verified buyer approval.`,
          rawResponse: result.rawResponse
        }, { status: 400 });
      }

      // Map genuine capture to Customer
      const captureRecord = store.recordGenuineSandboxCapture({
        customerId: customer.id,
        orderId: result.orderId || orderId,
        captureId: result.captureId!,
        amount: result.amount || 10.00,
        currency: result.currency || 'USD',
        status: result.status || 'COMPLETED',
        capturedAt: result.createTime,
        rawPayload: result.rawResponse
      });

      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        captureId: result.captureId,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        customerId: customer.id,
        customerName: customer.name,
        newRefundableBalance: customer.refundableBalance,
        captureRecord
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid checkout action specified.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
