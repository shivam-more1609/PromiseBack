import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const actorType = searchParams.get('actorType');

    let events = store.getAuditEvents();

    if (category && category !== 'all') {
      events = events.filter(e => e.category === category);
    }

    if (actorType && actorType !== 'all') {
      events = events.filter(e => e.actor.type === actorType);
    }

    const integrity = store.verifyAuditIntegrity();

    return NextResponse.json({
      success: true,
      events,
      integrity
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
