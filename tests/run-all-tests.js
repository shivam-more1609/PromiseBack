const { spawnSync } = require('child_process');

const testSuites = [
  'tests/sla-calculation.test.ts',
  'tests/financial-security.test.ts',
  'tests/contract-extraction.test.ts',
  'tests/paypal-integration.test.ts',
  'tests/e2e-workflow.test.ts',
  'tests/second-review.test.ts',
  'tests/third-review.test.ts',
  'tests/sponsor-integrations.test.ts',
  'tests/webhook-reconciliation.test.ts',
  'tests/redirect-persistence.test.ts',
  'tests/ledger-reconciliation.test.ts',
  'tests/dual-approval-governance.test.ts',
  'tests/ai-intelligence-layer.test.ts'
];

console.log(`=== RUNNING ALL ${testSuites.length} TEST SUITES ===\n`);
let passedSuites = 0;

for (const suite of testSuites) {
  process.stdout.write(`Executing: ${suite} ... `);
  const result = spawnSync('npx', ['tsx', suite], { encoding: 'utf8', shell: true });
  if (result.status === 0) {
    console.log('✅ PASSED');
    passedSuites++;
  } else {
    console.log('❌ FAILED');
    console.error(result.stdout);
    console.error(result.stderr);
  }
}

console.log(`\n========================================`);
console.log(`TEST SUITE RESULTS: ${passedSuites}/${testSuites.length} PASSED`);
console.log(`========================================`);

if (passedSuites !== testSuites.length) {
  process.exit(1);
}
