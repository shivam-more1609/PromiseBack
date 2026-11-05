import { store } from '../src/lib/store';
import { validateMutationAuth } from '../src/lib/auth';
import { executePayPalCaptureRefund, isPayPalSandboxConfigured } from '../src/lib/paypal';
import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runSecurityTests() {
  console.log('\n--- EXECUTING PHASE 2: FINANCIAL SECURITY & INVARIANTS TESTS ---\n');

  // TEST 1: API Authentication Guard
  {
    const unauthReq = new Request('http://localhost:3000/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const res1 = validateMutationAuth(unauthReq);
    assert(res1.authorized === false, 'Mutation request without API key is rejected (UNAUTHORIZED)');

    const authReq = new Request('http://localhost:3000/api/approvals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'pb_sec_dev_88921a4f09c73d9e2b10a4f5'
      }
    });
    const res2 = validateMutationAuth(authReq);
    assert(res2.authorized === true, 'Mutation request with valid x-api-key is authorized');

    const forgedWebConsoleReq = new Request('http://localhost:3000/api/approvals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-promiseback-client': 'promiseback-web-console'
      }
    });
    const res3 = validateMutationAuth(forgedWebConsoleReq);
    assert(res3.authorized === false, 'Forged x-promiseback-client header is strictly rejected (UNAUTHORIZED)');

    // Verify server-validated session cookie authorization
    const { createSessionToken } = require('../src/lib/auth');
    const validSessionToken = createSessionToken({ username: 'Security Auditor', role: 'financial_controller' });
    const sessionReq = new Request('http://localhost:3000/api/approvals', {
      method: 'POST',
      headers: {
        'cookie': `promiseback_session=${validSessionToken}`
      }
    });
    const res4 = validateMutationAuth(sessionReq);
    assert(res4.authorized === true, 'Valid server-signed session cookie is authorized');
  }

  // TEST 2: Financial Approval Invariant (Frontend is NOT the authority)
  {
    const pendingEntitlements = store.getEntitlements().filter(e => e.status === 'pending_approval');
    if (pendingEntitlements.length > 0) {
      const unapprovedCase = pendingEntitlements[0];
      const dummyRefundId = `ref-dummy-${Date.now()}`;
      const dummyRefund = {
        id: dummyRefundId,
        refundNumber: 'REF-TEST-UNAPPROVED',
        entitlementId: unapprovedCase.id,
        customerId: unapprovedCase.customerId,
        customerName: unapprovedCase.customerName,
        paypalAccount: 'test@customer.com',
        paypalCaptureId: '2GG10928AB778901C',
        refundAmount: unapprovedCase.eligibleCredit,
        currency: 'USD',
        idempotencyRequestId: 'idemp-unapproved-test',
        feeAmount: 0,
        status: 'approved' as const,
        createdAt: new Date().toISOString()
      };
      (store as any).refunds.unshift(dummyRefund);

      let threw = false;
      try {
        await (store as any).executePayPalCaptureRefundAction({ refundId: dummyRefundId });
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('UNAUTHORIZED_FINANCIAL_ACTION'), `Unapproved case refund attempt rejected with security invariant: ${err.message}`);
      }
      assert(threw, 'Execution of refund on unapproved entitlement strictly rejected');

      // Clean up
      (store as any).refunds = (store as any).refunds.filter((r: any) => r.id !== dummyRefundId);
    }
  }

  // TEST 3: Insufficient Refundable Balance Rejection
  {
    const customer = store.getCustomers()[0];
    const originalBalance = customer.refundableBalance || 14500;

    const excessiveRefundId = `ref-excess-${Date.now()}`;
    const excessiveRefund = {
      id: excessiveRefundId,
      refundNumber: 'REF-TEST-EXCESS',
      entitlementId: 'ent-801',
      customerId: customer.id,
      customerName: customer.name,
      paypalAccount: customer.paypalEmail,
      paypalCaptureId: customer.paypalCaptureId || '2GG10928AB778901C',
      refundAmount: originalBalance + 10000,
      currency: 'USD',
      idempotencyRequestId: 'idemp-excess-test',
      feeAmount: 0,
      status: 'approved' as const,
      createdAt: new Date().toISOString()
    };
    (store as any).refunds.unshift(excessiveRefund);

    // Ensure entitlement ent-801 is approved and has sufficient credit cap for this balance test
    const ent801 = store.getEntitlementById('ent-801');
    const prevStatus = ent801?.status;
    const prevCredit = ent801?.eligibleCredit;
    if (ent801) {
      ent801.status = 'approved';
      ent801.eligibleCredit = 50000;
    }

    let threwBalanceCheck = false;
    try {
      await (store as any).executePayPalCaptureRefundAction({ refundId: excessiveRefundId });
    } catch (err: any) {
      threwBalanceCheck = true;
      assert(err.message.includes('INSUFFICIENT_REFUNDABLE_BALANCE'), `Excessive refund amount rejected: ${err.message}`);
    }
    assert(threwBalanceCheck, 'Refund exceeding customer refundable balance strictly rejected');

    // Restore
    if (ent801 && prevStatus) ent801.status = prevStatus;
    if (ent801 && prevCredit) ent801.eligibleCredit = prevCredit;
    (store as any).refunds = (store as any).refunds.filter((r: any) => r.id !== excessiveRefundId);
  }

  // TEST 4: Transparent Handling of PayPal Sandbox Credentials (No Mock Responses)
  {
    const prevId = process.env.PAYPAL_SANDBOX_CLIENT_ID;
    const prevSec = process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
    delete process.env.PAYPAL_SANDBOX_CLIENT_ID;
    delete process.env.PAYPAL_SANDBOX_CLIENT_SECRET;

    assert(!isPayPalSandboxConfigured(), 'isPayPalSandboxConfigured correctly reports false when credentials absent');

    const result = await executePayPalCaptureRefund({
      captureId: '2GG10928AB778901C',
      amount: 1450.00,
      currency: 'USD',
      note: 'Audit Test',
      idempotencyRequestId: 'idemp-audit-test'
    });

    assert(result.success === false, 'Refund without Sandbox credentials does NOT falsely simulate success');
    assert(result.requiresSandboxConfig === true, 'Returns explicit requiresSandboxConfig requirement');
    assert(result.error?.includes('PAYPAL_SANDBOX_NOT_CONFIGURED'), 'Explicit error message provided to user');

    // Restore env
    if (prevId) process.env.PAYPAL_SANDBOX_CLIENT_ID = prevId;
    if (prevSec) process.env.PAYPAL_SANDBOX_CLIENT_SECRET = prevSec;
  }

  // TEST 5: Durable File Persistence
  {
    const dataFilePath = path.join(process.cwd(), 'data', 'store.json');
    assert(fs.existsSync(dataFilePath), `Durable store file exists at ${dataFilePath}`);
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
    const parsed = JSON.parse(fileContent);
    assert(Array.isArray(parsed.contracts) && parsed.contracts.length > 0, 'Durable store contains persistent contracts');
    assert(Array.isArray(parsed.auditEvents) && parsed.auditEvents.length > 0, 'Durable store contains persistent audit events');
  }

  console.log('\n✅ ALL PHASE 2 FINANCIAL SECURITY & PERSISTENCE TESTS PASSED!\n');
}

runSecurityTests();
