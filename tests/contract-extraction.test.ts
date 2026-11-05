import { extractContractFromPdfBuffer } from '../src/lib/contractExtractor';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// Minimal valid PDF generator for test verification
function createMockSlaPdfBuffer(): Buffer {
  const text = `
    MASTER SERVICE LEVEL AGREEMENT
    between CloudPulse Systems and Acropora Cloud Infrastructure Inc.
    
    Section 3.1: Service Availability Commitment
    Provider covenants to maintain a monthly availability commitment of not less than 99.95% across all core transaction routing and ingestion APIs.
    
    Section 4.1: Measurement Period and Claim Window
    Availability shall be calculated across each calendar Monthly billing period. Any remedy claim must be submitted within 30 calendar days following the conclusion of the affected month.
    
    Section 4.3: Service Credit Remedy Escalation Schedule
    In the event monthly uptime falls below the target, customer is entitled to the following compensation tiers:
    - 99.50% to 99.94% : 10% credit
    - 99.00% to 99.49% : 25% credit
    - < 99.00% : 50% credit
    
    Section 4.5: Maximum Credit Limit
    The maximum credit compensation shall not exceed 50% of the total monthly recurring service fees.
    
    Section 5.1: Excluded Outages
    Downtime does not include pre-scheduled maintenance notified at least 5 business days in advance.
    Downtime does not include Force Majeure events beyond reasonable commercial control.
    
    Section 6.2: Electronic Remedy Disbursement
    Approved compensation credits shall be disbursed either via electronic refund or applied towards subsequent invoice.
  `;

  // Standard valid PDF header & stream object wrapping the text
  const streamContent = `BT /F1 12 Tf 50 750 Td (${text.replace(/\n/g, ') Tj T* (')}) ET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000242 00000 n 
0000000${(300 + streamLength).toString().padStart(3, '0')} 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

async function runExtractionTests() {
  console.log('\n--- EXECUTING PHASE 3: REAL CONTRACT EXTRACTION TESTS ---\n');

  // Test 1: Real PDF binary parsing
  const pdfBuffer = createMockSlaPdfBuffer();
  assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 200, 'Valid PDF binary buffer generated');

  const extracted = await extractContractFromPdfBuffer(pdfBuffer);

  assert(extracted.uptimeTarget === 99.95, `Extracted Uptime Target 99.95%, got ${extracted.uptimeTarget}%`);
  assert(extracted.measurementPeriod === 'Monthly', `Extracted Measurement Period Monthly, got ${extracted.measurementPeriod}`);
  assert(extracted.claimDeadlineDays === 30, `Extracted Claim Deadline 30 days, got ${extracted.claimDeadlineDays}`);
  assert(extracted.maxCompensationPercent === 50, `Extracted Max Cap 50%, got ${extracted.maxCompensationPercent}%`);
  assert(extracted.customerName.includes('Acropora Cloud Infrastructure Inc.'), `Extracted Customer Name Acropora, got ${extracted.customerName}`);
  assert(extracted.compensationTiers.length >= 3, `Extracted ${extracted.compensationTiers.length} Compensation Tiers`);
  assert(extracted.clauses.length >= 3, `Extracted ${extracted.clauses.length} Contract Clauses`);
  assert(extracted.clauses.every(c => c.status === 'ai_extracted' || c.status === 'requires_review'), 'All extracted clauses correctly tagged as AI Extracted / Requires Review (None falsely verified)');
  assert(extracted.clauses.some(c => c.sourceCitation?.exactMatchSnippet !== undefined), 'Extracted clauses retain verifiable source reference snippets');

  // Test 2: Error handling on corrupted / empty PDF
  let threw = false;
  try {
    await extractContractFromPdfBuffer(Buffer.from('NOT_A_VALID_PDF_STREAM'));
  } catch (err: any) {
    threw = true;
    assert(err.message.includes('PDF_PARSING_FAILED') || err.message.includes('PDF_EMPTY'), `Corrupted file rejected cleanly: ${err.message}`);
  }
  assert(threw, 'Corrupted / invalid binary file rejected with clear error');

  console.log('\n✅ ALL PHASE 3 REAL CONTRACT EXTRACTION TESTS PASSED!\n');
}

runExtractionTests();
