/**
 * Serverless PDF Contract Extraction Test Suite
 *
 * Verifies that PDF contract extraction and /api/contracts logic run reliably
 * in headless Node.js serverless environments (e.g. AWS Lambda / Vercel Serverless Functions)
 * without requiring browser globals (DOMMatrix, ImageData, Path2D) or native canvas addons (@napi-rs/canvas).
 */

import { extractContractFromPdfBuffer } from '../src/lib/contractExtractor';
import '../src/lib/serverlessPolyfills';
import { GET, POST } from '../src/app/api/contracts/route';
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

function createSamplePdfBuffer(): Buffer {
  const text = `
    MASTER SERVICE LEVEL AGREEMENT
    between FinTech Global Services and Helios Payments Inc.
    
    Section 3.1: Service Availability Commitment
    Provider covenants to maintain a monthly availability commitment of not less than 99.90% across core transaction endpoints.
    
    Section 4.1: Measurement Period and Claim Window
    Availability shall be calculated across each calendar Monthly billing period.
    Any remedy claim must be submitted within 45 calendar days following the affected month.
    
    Section 4.3: Service Credit Remedy Escalation Schedule
    - 99.00% to 99.89% : 15% credit
    - < 99.00% : 30% credit
    
    Section 4.5: Maximum Credit Limit
    The maximum credit compensation shall not exceed 40% of the monthly recurring charges.
    
    Section 5.1: Excluded Outages
    Downtime does not include pre-scheduled maintenance with 72 hours prior notice.
    Downtime does not include third-party ISP routing disruptions beyond reasonable control.
    
    Section 6.2: Electronic Remedy Disbursement
    Approved credits shall be disbursed as direct electronic refund via PayPal or credit towards next billing invoice.
  `;

  const streamContent = `BT /F1 12 Tf 50 750 Td (${text.replace(/\n/g, ') Tj T* (')}) ET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamLength} >> stream
${streamContent}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000242 00000 n 
0000000${(300 + streamLength).toString().padStart(3, '0')} 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

// Multi-page PDF generator
function createMultiPagePdfBuffer(): Buffer {
  const page1 = `BT /F1 12 Tf 50 700 Td (MASTER SERVICE AGREEMENT - PAGE 1) Tj T* (between CloudCorp and AlphaPay LLC) Tj ET`;
  const page2 = `BT /F1 12 Tf 50 700 Td (Section 3.1: Service Availability Commitment) Tj T* (Target: not less than 99.95%) Tj ET`;
  const len1 = Buffer.byteLength(page1);
  const len2 = Buffer.byteLength(page2);

  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj
5 0 obj << /Length ${len1} >> stream
${page1}
endstream endobj
6 0 obj << /Length ${len2} >> stream
${page2}
endstream endobj
7 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000124 00000 n 
0000000251 00000 n 
0000000378 00000 n 
0000000${(450 + len1).toString().padStart(3, '0')} 00000 n 
0000000${(550 + len1 + len2).toString().padStart(3, '0')} 00000 n 
trailer << /Size 8 /Root 1 0 R >>
startxref
${650 + len1 + len2}
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

async function runServerlessPdfTests() {
  console.log('\n--- EXECUTING SERVERLESS PDF & DOMMATRIX VERIFICATION TESTS ---\n');

  // 1. Verify Polyfills Exist on globalThis
  assert(typeof (globalThis as any).DOMMatrix !== 'undefined', 'globalThis.DOMMatrix is polyfilled');
  assert(typeof (globalThis as any).Path2D !== 'undefined', 'globalThis.Path2D is polyfilled');
  assert(typeof (globalThis as any).ImageData !== 'undefined', 'globalThis.ImageData is polyfilled');
  assert(typeof (globalThis as any).navigator?.language === 'string', 'globalThis.navigator.language is polyfilled');

  // 2. Mathematical Verification of DOMMatrix
  const M = (globalThis as any).DOMMatrix;
  const mIdent = new M();
  assert(mIdent.isIdentity === true, 'DOMMatrix initial state has isIdentity === true');

  const mTrans = new M([1, 0, 0, 1, 10, 20]);
  assert(mTrans.isIdentity === false, 'DOMMatrix with translation has isIdentity === false');
  assert(mTrans.m41 === 10 && mTrans.m42 === 20, 'DOMMatrix m41 and m42 getters correctly mirror e and f');
  assert(mTrans.m11 === 1 && mTrans.m22 === 1, 'DOMMatrix m11 and m22 getters correctly mirror a and d');

  // Verify preMultiplySelf mathematical correctness: M_other * M_this
  // Let M_this = Translate(10, 20) = [1, 0, 0, 1, 10, 20]
  // Let M_other = Scale(2, 3) = [2, 0, 0, 3, 0, 0]
  // M_other * M_this: Scale(2, 3) * Translate(10, 20)
  // Expected: a=2, d=3, e=20 (2*10 + 0), f=60 (3*20 + 0)
  const mThis = new M([1, 0, 0, 1, 10, 20]);
  const mOther = new M([2, 0, 0, 3, 0, 0]);
  mThis.preMultiplySelf(mOther);
  assert(mThis.a === 2 && mThis.d === 3, 'preMultiplySelf calculates scale components accurately');
  assert(mThis.e === 20 && mThis.f === 60, `preMultiplySelf calculates translation components accurately (e=20, got ${mThis.e}; f=60, got ${mThis.f})`);

  // Verify invertSelf mathematical correctness: M * M^-1 = Identity
  const mInv = new M([2, 0, 0, 2, 10, 20]);
  mInv.invertSelf();
  assert(mInv.a === 0.5 && mInv.d === 0.5, 'invertSelf scales properly (2 -> 0.5)');
  assert(mInv.e === -5 && mInv.f === -10, 'invertSelf inverts translation accurately (10 -> -5, 20 -> -10)');

  // 3. ImageData Constructor Signatures
  const ImgData = (globalThis as any).ImageData;
  const img1 = new ImgData(10, 20);
  assert(img1.width === 10 && img1.height === 20 && img1.data.length === 800, 'ImageData(w, h) initializes Uint8ClampedArray correctly');
  const clamped = new Uint8ClampedArray(400);
  const img2 = new ImgData(clamped, 10, 10);
  assert(img2.width === 10 && img2.height === 10 && img2.data === clamped, 'ImageData(clampedArray, w, h) accepts existing buffer');

  // 4. Path2D Methods
  const P2D = (globalThis as any).Path2D;
  const p2d = new P2D();
  p2d.rect(0, 0, 100, 100);
  p2d.moveTo(10, 10);
  p2d.lineTo(50, 50);
  p2d.closePath();
  assert(typeof p2d.rect === 'function' && typeof p2d.addPath === 'function', 'Path2D polyfill implements canvas path API');

  // 5. Test Single-Page Real Contract Extraction
  const buffer = createSamplePdfBuffer();
  assert(Buffer.isBuffer(buffer) && buffer.length > 0, 'Generated valid binary PDF buffer');

  const result = await extractContractFromPdfBuffer(buffer, 'Helios Payments Inc.');
  assert(result.customerName.includes('Helios Payments Inc.'), `Extracted Customer Name: ${result.customerName}`);
  assert(result.uptimeTarget === 99.90, `Extracted Uptime Target: ${result.uptimeTarget}% (expected 99.90%)`);
  assert(result.claimDeadlineDays === 45, `Extracted Claim Deadline: ${result.claimDeadlineDays} days (expected 45)`);
  assert(result.maxCompensationPercent === 40, `Extracted Max Cap: ${result.maxCompensationPercent}% (expected 40%)`);
  assert(result.measurementPeriod === 'Monthly', `Extracted Measurement Period: ${result.measurementPeriod}`);
  assert(result.compensationTiers.length >= 2, `Extracted ${result.compensationTiers.length} compensation tiers`);
  assert(result.clauses.length >= 4, `Extracted ${result.clauses.length} structured SLA clauses`);
  assert(result.clauses.every(c => c.status === 'ai_extracted' || c.status === 'requires_review'), 'Clauses require compliance audit before activation');
  assert(typeof result.rawTextPreview === 'string' && result.rawTextPreview.length > 50, 'Raw text preview captured for Gemini AI Agent');

  // 6. Test Multi-Page PDF Extraction
  const multiPageBuffer = createMultiPagePdfBuffer();
  const multiResult = await extractContractFromPdfBuffer(multiPageBuffer, 'AlphaPay LLC');
  assert(multiResult.customerName.includes('AlphaPay LLC'), `Multi-page Customer: ${multiResult.customerName}`);
  assert(multiResult.uptimeTarget === 99.95, `Multi-page Target: ${multiResult.uptimeTarget}%`);
  assert(multiResult.rawTextPreview.includes('PAGE 1') && multiResult.rawTextPreview.includes('Section 3.1'), 'Multi-page text streams correctly extracted across all pages');

  // 6b. Test Real CloudPulse SLA Multi-Page Agreement (Phase 3 Requirement)
  const realPdfPath = path.join(process.cwd(), 'tests', 'fixtures', 'CloudPulse_Service_Level_Agreement.pdf');
  assert(fs.existsSync(realPdfPath), `Real test document exists at ${realPdfPath}`);
  const realPdfBuffer = fs.readFileSync(realPdfPath);
  assert(realPdfBuffer.length > 30000, `Real test document loaded (${realPdfBuffer.length} bytes)`);

  const realResult = await extractContractFromPdfBuffer(realPdfBuffer, 'CloudPulse Technologies');
  assert(realResult.contractNumber === 'SLA-2026-CP001', `Real PDF Contract ID: ${realResult.contractNumber} (expected SLA-2026-CP001)`);
  assert(realResult.effectiveStartDate === '1 October 2026', `Real PDF Effective Date: ${realResult.effectiveStartDate} (expected 1 October 2026)`);
  assert(realResult.effectiveEndDate === '30 September 2027', `Real PDF Expiry Date: ${realResult.effectiveEndDate} (expected 30 September 2027)`);
  assert(realResult.uptimeTarget === 99.95, `Real PDF SLA Availability extracted: ${realResult.uptimeTarget}% (expected 99.95%)`);
  assert(realResult.downtimeAllowanceMinutes === 21.6, `Real PDF Downtime Allowance extracted: ${realResult.downtimeAllowanceMinutes} minutes (expected 21.6)`);
  assert(realResult.monthlyServiceFee === 14500, `Real PDF Monthly Fee extracted: USD ${realResult.monthlyServiceFee} (expected 14500)`);
  assert(realResult.claimDeadlineDays === 30, `Real PDF Claim Deadline extracted: ${realResult.claimDeadlineDays} days (expected 30)`);
  assert(realResult.maxCompensationPercent === null, `Real PDF Max Remedy Cap: ${realResult.maxCompensationPercent} (expected null / Not specified)`);
  assert(realResult.maxRemedyCapText?.includes('Not specified') === true, `Real PDF Max Cap Text: ${realResult.maxRemedyCapText}`);
  assert(!realResult.clauses.some(c => c.section === 'Section 4.7'), 'Real PDF: Nonexistent Section 4.7 is NOT generated');
  assert(!realResult.clauses.some(c => c.section === 'Section 5.1'), 'Real PDF: Nonexistent Section 5.1 is NOT generated');
  assert(!realResult.clauses.some(c => c.title.toLowerCase().includes('electronic remedy disbursement')), 'Real PDF: Electronic Remedy Disbursement is NOT generated');

  // Verify quotation decimal precision is preserved without truncation
  const dtClause = realResult.clauses.find(c => c.exactSourceQuote?.includes('21.6 minutes'));
  assert(!!dtClause, 'Real PDF: Downtime quotation preserves exact 21.6 minutes (not truncated to 21.)');
  assert(!realResult.clauses.some(c => c.exactSourceQuote?.includes('maximum of 21.') && !c.exactSourceQuote?.includes('21.6')), 'Real PDF: No quotation truncated at decimal point');

  assert(realResult.compensationTiers.length >= 4, `Real PDF extracted ${realResult.compensationTiers.length} compensation tiers`);
  assert(realResult.compensationTiers.some(t => t.creditPercentage === 5), 'Real PDF extracted 5% compensation tier');
  assert(realResult.compensationTiers.some(t => t.creditPercentage === 10), 'Real PDF extracted 10% compensation tier');
  assert(realResult.compensationTiers.some(t => t.creditPercentage === 20), 'Real PDF extracted 20% compensation tier');
  assert(realResult.customerName.includes('Acropora'), `Real PDF Customer Name extracted: ${realResult.customerName}`);
  assert(realResult.clauses.length >= 4, `Real PDF extracted ${realResult.clauses.length} structured SLA clauses`);
  assert(realResult.clauses.every(c => c.status === 'ai_extracted' || c.status === 'requires_review'), 'Real PDF clauses are authentic and grounded in document text');
  assert(realResult.rawTextPreview.includes('CLOUDPULSE') && realResult.rawTextPreview.includes('SERVICE LEVEL AGREEMENT'), 'Real PDF text stream successfully extracted across all pages without fake worker failure');

  // 7. Error Handling: Empty & Corrupted Buffers
  let emptyErrorCaught = false;
  try {
    await extractContractFromPdfBuffer(Buffer.alloc(0));
  } catch (err: any) {
    emptyErrorCaught = true;
    assert(err.message.includes('PDF_EMPTY_OR_UNREADABLE'), `Empty buffer caught with expected error: ${err.message}`);
  }
  assert(emptyErrorCaught, 'Empty buffer rejected gracefully with structured error');

  let corruptErrorCaught = false;
  try {
    await extractContractFromPdfBuffer(Buffer.from('CORRUPTED_NON_PDF_PAYLOAD_BYTES'));
  } catch (err: any) {
    corruptErrorCaught = true;
    assert(err.message.includes('PDF_PARSING_FAILED'), `Corrupt buffer caught with expected error: ${err.message}`);
  }
  assert(corruptErrorCaught, 'Corrupted buffer rejected gracefully with structured error');

  // 8. Test /api/contracts Route JSON Error & Success Responses
  console.log('\n--- VERIFYING /api/contracts ROUTE JSON GUARANTEES ---');

  // 8a. GET /api/contracts returns JSON 200
  const getReq = new Request('http://localhost:3000/api/contracts');
  const getRes = await GET(getReq);
  assert(getRes.status === 200, `GET /api/contracts returned status 200 (got ${getRes.status})`);
  const getData = await getRes.json();
  assert(getData.success === true && Array.isArray(getData.contracts), 'GET /api/contracts returns structured JSON with contracts array');

  // 8b. POST with missing file returns JSON 400 (not HTML 500)
  const emptyFormData = new FormData();
  emptyFormData.append('customerName', 'Acme Corp');
  const emptyFormReq = new Request('http://localhost:3000/api/contracts', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer pb_sec_dev_88921a4f09c73d9e2b10a4f5'
    },
    body: emptyFormData
  });
  const noFileRes = await POST(emptyFormReq);
  assert(noFileRes.status === 400, `POST without file returns HTTP 400 (got ${noFileRes.status})`);
  const noFileData = await noFileRes.json();
  assert(noFileData.success === false && noFileData.error.includes('NO_FILE_PROVIDED'), `POST without file returns structured JSON: ${noFileData.error}`);

  // 8c. POST with empty (0 bytes) file returns JSON 400
  const zeroByteFormData = new FormData();
  const zeroByteBlob = new Blob([], { type: 'application/pdf' });
  zeroByteFormData.append('file', zeroByteBlob, 'empty.pdf');
  const zeroByteReq = new Request('http://localhost:3000/api/contracts', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer pb_sec_dev_88921a4f09c73d9e2b10a4f5'
    },
    body: zeroByteFormData
  });
  const zeroByteRes = await POST(zeroByteReq);
  assert(zeroByteRes.status === 400, `POST with empty file returns HTTP 400 (got ${zeroByteRes.status})`);
  const zeroByteData = await zeroByteRes.json();
  assert(zeroByteData.success === false && zeroByteData.error.includes('FILE_EMPTY'), `POST with 0-byte file returns structured JSON: ${zeroByteData.error}`);

  // 8d. POST with non-PDF file returns JSON 400
  const txtFormData = new FormData();
  const txtBlob = new Blob(['sample text'], { type: 'text/plain' });
  txtFormData.append('file', txtBlob, 'contract.txt');
  const txtReq = new Request('http://localhost:3000/api/contracts', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer pb_sec_dev_88921a4f09c73d9e2b10a4f5'
    },
    body: txtFormData
  });
  const txtRes = await POST(txtReq);
  assert(txtRes.status === 400, `POST with non-PDF returns HTTP 400 (got ${txtRes.status})`);
  const txtData = await txtRes.json();
  assert(txtData.success === false && txtData.error.includes('INVALID_FILE_TYPE'), `POST with non-PDF returns structured JSON: ${txtData.error}`);

  console.log('\n✅ ALL SERVERLESS PDF & DOMMATRIX VERIFICATION TESTS PASSED!\n');
}

runServerlessPdfTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
