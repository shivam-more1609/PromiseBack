import '@/lib/serverlessPolyfills';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';
import { extractContractFromPdfBuffer } from '@/lib/contractExtractor';
import { Contract } from '@/types';

// Explicitly configure Node.js serverless runtime for Vercel / AWS Lambda
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let contracts = store.getContracts();

    if (status && status !== 'all') {
      contracts = contracts.filter(c => c.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      contracts = contracts.filter(c => 
        c.customerName.toLowerCase().includes(q) ||
        c.contractNumber.toLowerCase().includes(q) ||
        c.slaName.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ success: true, contracts });
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

    const contentType = request.headers.get('content-type') || '';
    let contractData: Partial<Contract> = {};
    let fileName = 'Contract_Agreement.pdf';
    let fileSize = '1.0 MB';

    // Real PDF Binary Parsing via multipart/form-data
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const customerNameInput = (formData.get('customerName') as string) || undefined;

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'NO_FILE_PROVIDED: Please select a valid PDF file.' },
          { status: 400 }
        );
      }

      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: 'FILE_EMPTY: The uploaded PDF file is empty (0 bytes).' },
          { status: 400 }
        );
      }

      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: 'FILE_TOO_LARGE: The uploaded file exceeds the 15MB limit.' },
          { status: 400 }
        );
      }

      const lowerName = (file.name || '').toLowerCase();
      if (!lowerName.endsWith('.pdf') && file.type !== 'application/pdf') {
        return NextResponse.json(
          { success: false, error: 'INVALID_FILE_TYPE: Only PDF documents (.pdf) are supported for contract ingestion.' },
          { status: 400 }
        );
      }

      fileName = file.name;
      fileSize = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract real clauses and covenants from binary PDF
      const extracted = await extractContractFromPdfBuffer(buffer, customerNameInput);

      contractData = {
        contractNumber: extracted.contractNumber || undefined,
        customerName: customerNameInput || extracted.customerName,
        slaName: extracted.slaName,
        uptimeTarget: extracted.uptimeTarget,
        measurementPeriod: extracted.measurementPeriod,
        claimDeadlineDays: extracted.claimDeadlineDays,
        maxCompensationPercent: extracted.maxCompensationPercent,
        maxRemedyCapText: extracted.maxRemedyCapText,
        explicitPercentageCap: extracted.explicitPercentageCap ?? extracted.maxCompensationPercent ?? null,
        contractualMonetaryCeiling: extracted.contractualMonetaryCeiling ?? null,
        contractualMonetaryCeilingText: extracted.contractualMonetaryCeilingText,
        maxServiceCreditTier: extracted.maxServiceCreditTier,
        isCashRefundAllowed: extracted.isCashRefundAllowed,
        disbursementMethodText: extracted.disbursementMethodText,
        nonCashRestrictionClause: extracted.nonCashRestrictionClause,
        effectiveStartDate: extracted.effectiveStartDate || undefined,
        effectiveEndDate: extracted.effectiveEndDate || undefined,
        compensationTiers: extracted.compensationTiers,
        maintenanceExclusions: extracted.maintenanceExclusions,
        extractedConfidence: extracted.extractedConfidence,
        clauses: extracted.clauses,
        fileName,
        fileSize,
        rawTextPreview: extracted.rawTextPreview,
        downtimeAllowanceMinutes: extracted.downtimeAllowanceMinutes,
        monthlyServiceFee: extracted.monthlyServiceFee
      };
    } else {
      // JSON body fallback
      const body = await request.json();
      const { customerName, slaName, uptimeTarget, uploaderName } = body;

      if (!customerName) {
        return NextResponse.json({ success: false, error: 'Customer name is required.' }, { status: 400 });
      }

      const target = Number(uptimeTarget) || 99.95;
      contractData = {
        contractNumber: body.contractNumber || undefined,
        customerName,
        slaName: slaName || `${customerName} SLA`,
        uptimeTarget: target,
        measurementPeriod: 'Monthly',
        claimDeadlineDays: 30,
        maxCompensationPercent: null,
        maxRemedyCapText: 'Not specified in source document',
        effectiveStartDate: body.effectiveStartDate || 'Not specified in source document',
        effectiveEndDate: body.effectiveEndDate || 'Not specified in source document',
        compensationTiers: [
          { uptimeThreshold: target, creditPercentage: 0, label: `≥ ${target}% Target Satisfied` },
          { uptimeThreshold: target, creditPercentage: 10, label: `${(target - 0.45).toFixed(2)}% - ${(target - 0.01).toFixed(2)}% (10% Credit)` },
          { uptimeThreshold: Number((target - 0.45).toFixed(2)), creditPercentage: 25, label: `${(target - 0.95).toFixed(2)}% - ${(target - 0.46).toFixed(2)}% (25% Credit)` },
          { uptimeThreshold: Number((target - 0.95).toFixed(2)), creditPercentage: 50, label: `< ${(target - 0.95).toFixed(2)}% Severe Outage (50% Credit)` }
        ],
        maintenanceExclusions: ['Scheduled Sunday maintenance with 72-hour notice'],
        extractedConfidence: 0.92,
        clauses: [
          {
            id: `clause-${Date.now()}-1`,
            section: 'Section 3.1',
            title: 'Monthly Availability Covenant',
            content: `Provider commits to maintaining monthly availability of at least ${target}% across core ingestion APIs.`,
            confidence: 0.94,
            status: 'ai_extracted'
          }
        ],
        fileName: body.fileName || fileName,
        fileSize: body.fileSize || fileSize,
        rawTextPreview: body.rawTextPreview || ''
      };
    }

    const id = `contract-${Date.now()}`;
    const contractNumber = contractData.contractNumber || `SLA-2026-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const newContract: Contract = {
      id,
      contractNumber,
      customerId: `cust-${Date.now()}`,
      customerName: contractData.customerName || 'Enterprise Partner',
      slaName: contractData.slaName || 'Enterprise SLA Agreement',
      uptimeTarget: contractData.uptimeTarget || 99.95,
      measurementPeriod: contractData.measurementPeriod || 'Monthly',
      claimDeadlineDays: contractData.claimDeadlineDays || 30,
      compensationTiers: contractData.compensationTiers || [],
      maintenanceExclusions: contractData.maintenanceExclusions || [],
      maxCompensationPercent: typeof contractData.maxCompensationPercent === 'number' ? contractData.maxCompensationPercent : null,
      maxRemedyCapText: contractData.maxRemedyCapText || (typeof contractData.maxCompensationPercent === 'number' ? `${contractData.maxCompensationPercent}%` : 'Not specified in source document'),
      explicitPercentageCap: typeof contractData.explicitPercentageCap === 'number' ? contractData.explicitPercentageCap : (typeof contractData.maxCompensationPercent === 'number' ? contractData.maxCompensationPercent : null),
      contractualMonetaryCeiling: typeof contractData.contractualMonetaryCeiling === 'number' ? contractData.contractualMonetaryCeiling : (contractData.monthlyServiceFee || null),
      contractualMonetaryCeilingText: contractData.contractualMonetaryCeilingText,
      maxServiceCreditTier: contractData.maxServiceCreditTier,
      isCashRefundAllowed: contractData.isCashRefundAllowed,
      disbursementMethodText: contractData.disbursementMethodText,
      nonCashRestrictionClause: contractData.nonCashRestrictionClause,
      effectiveStartDate: contractData.effectiveStartDate || 'Not specified in source document',
      effectiveEndDate: contractData.effectiveEndDate || 'Not specified in source document',
      status: 'requires_review', // Strictly requires human compliance verification
      extractedConfidence: contractData.extractedConfidence || 0.92,
      uploadedAt: new Date().toISOString(),
      fileName: contractData.fileName || fileName,
      fileSize: contractData.fileSize || fileSize,
      clauses: contractData.clauses || [],
      rawTextPreview: contractData.rawTextPreview,
      downtimeAllowanceMinutes: contractData.downtimeAllowanceMinutes,
      monthlyServiceFee: contractData.monthlyServiceFee,
      isDemo: false
    };

    const created = store.addContract(newContract);
    return NextResponse.json({ success: true, contract: created });
  } catch (error: any) {
    const errorMsg = error?.message || 'Internal contract processing error.';
    const isClientError =
      errorMsg.includes('NO_FILE') ||
      errorMsg.includes('FILE_EMPTY') ||
      errorMsg.includes('FILE_TOO_LARGE') ||
      errorMsg.includes('INVALID_FILE_TYPE') ||
      errorMsg.includes('PDF_PARSING_FAILED') ||
      errorMsg.includes('PDF_EMPTY_OR_UNREADABLE') ||
      errorMsg.includes('required');

    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: isClientError ? 400 : 500 }
    );
  }
}
