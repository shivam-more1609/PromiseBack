import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const incident = store.getIncidentById(params.id);
    if (!incident) {
      return NextResponse.json({ success: false, error: 'Incident not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, incident });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
