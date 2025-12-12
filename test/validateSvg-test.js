import { validateSvg, ValidationSeverity } from '../src/svg-toolbox.js';

async function testValidateSvg() {
  console.log('Testing validateSvg function...\n');

  // Test 1: Valid SVG
  const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
  const validResult = await validateSvg(validSvg);
  console.log('Test 1 - Valid SVG:');
  console.log(`  isValid: ${validResult.isValid}`);
  console.log(`  errorCount: ${validResult.errorCount}`);
  console.log(`  warningCount: ${validResult.warningCount}`);
  console.log();

  // Test 2: SVG with issues
  const invalidSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100">
    <circle cx="50" cy="50" r="40" fill="red" opacity="1.5"/>
    <use href="#missing"/>
    <rect x="10" y="10" width="80" height="80" fill="notacolor"/>
  </svg>`;
  const invalidResult = await validateSvg(invalidSvg);
  console.log('Test 2 - Invalid SVG:');
  console.log(`  isValid: ${invalidResult.isValid}`);
  console.log(`  errorCount: ${invalidResult.errorCount}`);
  console.log(`  warningCount: ${invalidResult.warningCount}`);
  console.log('  Issues:');
  for (const issue of invalidResult.issues) {
    console.log(`    [${issue.severity}] Line ${issue.line}:${issue.column} - ${issue.type}: ${issue.reason}`);
  }
  console.log();

  // Test 3: SVG with meshgradient (SVG 2.0 - should NOT be flagged)
  const svg2Svg = '<svg xmlns="http://www.w3.org/2000/svg"><meshgradient id="mesh1"><meshpatch/></meshgradient></svg>';
  const svg2Result = await validateSvg(svg2Svg);
  console.log('Test 3 - SVG 2.0 meshgradient (should NOT be flagged as unknown):');
  console.log(`  isValid: ${svg2Result.isValid}`);
  console.log(`  issues found: ${svg2Result.issues.length}`);
  const meshIssues = svg2Result.issues.filter(i => i.element === 'meshgradient' || i.element === 'meshpatch');
  console.log(`  meshgradient/meshpatch issues: ${meshIssues.length} (should be 0)`);
  console.log();

  // Test 4: errorsOnly option
  const errorsOnlyResult = await validateSvg(invalidSvg, { errorsOnly: true });
  console.log('Test 4 - errorsOnly option:');
  console.log(`  Total issues (unfiltered): ${invalidResult.issues.length}`);
  console.log(`  Errors only: ${errorsOnlyResult.issues.length}`);
  console.log();

  // Test 5: Export to JSON
  const jsonResult = await validateSvg(validSvg, {
    outputFile: '/tmp/svg-validation-report.json',
    outputFormat: 'json'
  });
  console.log('Test 5 - Export to JSON:');
  console.log(`  outputFile: ${jsonResult.outputFile || 'N/A'}`);
  console.log();

  console.log('All tests completed!');
}

testValidateSvg().catch(console.error);
