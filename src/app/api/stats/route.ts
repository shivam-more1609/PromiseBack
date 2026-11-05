import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET() {
  try {
    const stats = store.getDashboardStats();
    const timeSeries = store.getAvailabilityTimeSeries();
    return NextResponse.json({ success: true, stats, timeSeries });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
