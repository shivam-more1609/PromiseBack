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
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.reason }, { status: 401 });
    }

    const body = await request.json();
    const { clauseId, status, verifiedBy, notes } = body;

    if (!clauseId || !status) {
      return NextResponse.json({ success: false, error: 'clauseId and status are required' }, { status: 400 });
    }

    const updated = store.updateClauseVerification(
      params.id,
      clauseId,
      status,
      verifiedBy || 'Auditor',
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
