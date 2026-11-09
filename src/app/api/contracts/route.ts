import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';
import { extractContractFromPdfBuffer } from '@/lib/contractExtractor';
import { Contract } from '@/types';

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
        return NextResponse.json({ success: false, error: 'NO_FILE_PROVIDED: Please select a valid PDF file.' }, { status: 400 });
      }

      fileName = file.name;
      fileSize = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract real clauses and covenants from binary PDF
      const extracted = await extractContractFromPdfBuffer(buffer, customerNameInput);

      contractData = {
        customerName: customerNameInput || extracted.customerName,
        slaName: extracted.slaName,
        uptimeTarget: extracted.uptimeTarget,
        measurementPeriod: extracted.measurementPeriod,
        claimDeadlineDays: extracted.claimDeadlineDays,
        maxCompensationPercent: extracted.maxCompensationPercent,
        compensationTiers: extracted.compensationTiers,
        maintenanceExclusions: extracted.maintenanceExclusions,
        extractedConfidence: extracted.extractedConfidence,
        clauses: extracted.clauses,
        fileName,
        fileSize,
        rawTextPreview: extracted.rawTextPreview
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
        customerName,
        slaName: slaName || `${customerName} SLA`,
        uptimeTarget: target,
        measurementPeriod: 'Monthly',
        claimDeadlineDays: 30,
        maxCompensationPercent: 50,
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
        fileSize: body.fileSize || fileSize
      };
    }

    const id = `contract-${Date.now()}`;
    const contractNumber = `SLA-2026-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

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
      maxCompensationPercent: contractData.maxCompensationPercent || 50,
      effectiveStartDate: new Date().toISOString().split('T')[0],
      effectiveEndDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      status: 'requires_review', // Strictly requires human compliance verification
      extractedConfidence: contractData.extractedConfidence || 0.92,
      uploadedAt: new Date().toISOString(),
      fileName: contractData.fileName || fileName,
      fileSize: contractData.fileSize || fileSize,
      clauses: contractData.clauses || [],
      rawTextPreview: contractData.rawTextPreview
    };

    const created = store.addContract(newContract);
    return NextResponse.json({ success: true, contract: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
