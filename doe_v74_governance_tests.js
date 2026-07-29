const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_4_Engineering_Governance_Layer.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision/governance block not found');

const formValues = {
  objective: 'maximize',
  responseName: 'Seal Strength',
  responseUnit: 'N',
  confirmationActual: ''
};

const context = {
  state: {
    lang: 'en',
    analyzed: true,
    study: { target: '50' },
    factors: []
  },
  I18N: {
    en: {
      maximize: 'Maximize',
      minimize: 'Minimize',
      noDifference: 'No Clear Difference',
      noObserved: 'No clear direction was observed',
      highLevel: 'High',
      lowLevel: 'Low',
      highBetter: 'The high level has the better average response',
      lowBetter: 'The low level has the better average response',
      full: 'Full Factorial',
      screen: '8-Run Screening',
      randomized: 'Randomized',
      standard: 'Standard'
    }
  },
  $: id => ({ value: formValues[id] ?? '' }),
  t: key => context.I18N.en[key] || key,
  fmt: number => Number(number).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  formatP: p => p < 0.0001 ? '<0.0001' : Number(p).toLocaleString(undefined, { maximumFractionDigits: 4 }),
  esc: value => String(value).replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match]))
};

vm.createContext(context);
vm.runInContext(statMatch[1], context);
vm.runInContext(decisionMatch[1], context);

const factors = [
  { id: 'f1', name: 'Temperature', low: '100°C', high: '180°C', constraintMin: '80°C', constraintMax: '150°C', constraintType: 'hard' },
  { id: 'f2', name: 'Pressure', low: '2 bar', high: '3 bar', constraintMin: '1 bar', constraintMax: '4 bar', constraintType: 'hard' }
];
context.state.factors = factors;

{
  const result = context.constraintCheck([
    { factor: 'Temperature', value: '140°C' },
    { factor: 'Pressure', value: '3 bar' }
  ], factors);
  assert.strictEqual(result.status, 'PASSED');
  assert.strictEqual(result.rows[0].status, 'PASS');
}

{
  const result = context.constraintCheck([
    { factor: 'Temperature', value: '180°C' },
    { factor: 'Pressure', value: '3 bar' }
  ], factors);
  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.rows[0].status, 'FAIL');
  assert.match(result.rows[0].reason, /exceeds engineering limit/);
}

assert.strictEqual(context.targetCheck(55, '50 N', 'maximize').status, 'PASS');
assert.strictEqual(context.targetCheck(45, '50 N', 'maximize').status, 'FAIL');

assert.strictEqual(context.confirmationGate(100, 104, true).status, 'PASS');
assert.strictEqual(context.confirmationGate(100, 112, true).status, 'REVIEW');

assert.strictEqual(context.implementationReadinessGate({
  experimentCompleted: true,
  dataValidated: true,
  keyFactorsIdentified: true,
  evidenceAvailable: true,
  constraintPassed: true,
  targetAchieved: true,
  confirmationStatus: 'PASS'
}).status, 'READY FOR IMPLEMENTATION');

assert.strictEqual(context.implementationReadinessGate({
  experimentCompleted: true,
  dataValidated: true,
  keyFactorsIdentified: true,
  evidenceAvailable: true,
  constraintPassed: true,
  targetAchieved: true,
  confirmationStatus: 'Pending'
}).status, 'CONDITIONAL RELEASE');

assert.strictEqual(context.implementationReadinessGate({
  experimentCompleted: true,
  dataValidated: true,
  keyFactorsIdentified: true,
  evidenceAvailable: true,
  constraintPassed: false,
  targetAchieved: true,
  confirmationStatus: 'PASS'
}).status, 'REVIEW REQUIRED');

[
  'constraintBody',
  'constraintGateStatus',
  'targetGateStatus',
  'readinessGateStatus',
  'reportConstraintBody',
  'reportTargetBody',
  'reportImplementationBody'
].forEach(id => assert(html.includes(`id="${id}"`), `${id} missing from V7.4 UI/report structure`));

console.log(`DOE governance tests passed for ${targetFile}`);
