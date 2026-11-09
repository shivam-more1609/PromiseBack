import { NextRequest, NextResponse } from 'next/server';
import { runFinancialIntelligenceAgent, FINANCIAL_GUARDRAIL_NOTICE } from '@/lib/ai/financialAgent';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = (body.query || '').trim();

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Query parameter is required.',
          guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE
        },
        { status: 400 }
      );
    }

    // Run genuine multi-tool Financial Intelligence Agent
    const agentResponse = await runFinancialIntelligenceAgent(query);

    return NextResponse.json({
      success: true,
      ...agentResponse
    });
  } catch (err: any) {
    console.error('Error in /api/studio/agent:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        guardrailNotice: FINANCIAL_GUARDRAIL_NOTICE
      },
      { status: 500 }
    );
  }
}
