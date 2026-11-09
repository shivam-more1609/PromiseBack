import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const contract = store.getContractById(params.id);
    if (!contract) {
      return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, contract });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Enforce Server Authentication
    const auth = validateMutationAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({
        success: false,
        error: auth.reason || 'UNAUTHORIZED: A valid authenticated session is required to verify or flag clauses.'
      }, { status: 401 });
    }

    const body = await request.json();
    const { clauseId, status, notes } = body;

    if (!clauseId || !status) {
      return NextResponse.json({ success: false, error: 'clauseId and status are required' }, { status: 400 });
    }

    const validStatuses = ['human_verified', 'requires_review', 'unverified', 'ai_extracted', 'verified'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({
        success: false,
        error: `INVALID_STATUS: Status must be one of: ${validStatuses.join(', ')}`
      }, { status: 400 });
    }

    // Reviewer identity comes EXCLUSIVELY from the authenticated server-side session.
    // Client-supplied identities (such as body.verifiedBy) are strictly ignored and cannot override the session.
    const reviewerName = auth.user;

    const updated = store.updateClauseVerification(
      params.id,
      clauseId,
      status,
      reviewerName,
      notes
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Contract or clause not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, contract: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
