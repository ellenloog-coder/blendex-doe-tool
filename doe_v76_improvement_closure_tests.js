const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_6_Improvement_Verification_Closure.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision/improvement block not found');

const formValues = {
  objective: 'maximize',
  responseName: 'Seal Strength',
  responseUnit: 'N',
  confirmationActual: '64'
};

const context = {
  state: {
    lang: 'en',
    analyzed: true,
    study: { target: '50' },
    factors: [],
    design: null,
    validation: { valid: true },
    evidenceSeparation: true
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
  { id: 'f1', name: 'Temperature', low: '100°C', high: '150°C', constraintMin: '80°C', constraintMax: '150°C', constraintType: 'hard' },
  { id: 'f2', name: 'Pressure', low: '2 bar', high: '3 bar', constraintMin: '1 bar', constraintMax: '4 bar', constraintType: 'hard' }
];
const runs = [
  { id: 'r1', standardOrder: 1, runOrder: 1, settings: { f1: '100°C', f2: '2 bar' }, response: 42 },
  { id: 'r2', standardOrder: 2, runOrder: 2, settings: { f1: '100°C', f2: '3 bar' }, response: 45 },
  { id: 'r3', standardOrder: 3, runOrder: 3, settings: { f1: '150°C', f2: '2 bar' }, response: 53 },
  { id: 'r4', standardOrder: 4, runOrder: 4, settings: { f1: '150°C', f2: '3 bar' }, response: 55 }
];
context.state.factors = factors;
context.state.design = { type: 'full_factorial', runs };

const metrics = context.improvementCalculation(50, 65, 5, 3, 'maximize');
assert.strictEqual(metrics.meanImprovement, 30);
assert.strictEqual(metrics.variationReduction, 40);
assert.strictEqual(metrics.improvementObserved, true);

const noImprovement = context.improvementCalculation(50, 45, 5, 6, 'maximize');
assert.strictEqual(noImprovement.improvementObserved, false);

const decision = {
  settings: [
    { factor: 'Temperature', value: '150°C', label: 'High' },
    { factor: 'Pressure', value: '3 bar', label: 'High' }
  ],
  predicted: 55.2
};
const governance = context.buildGovernance(decision, { valid: true }, 'PASS');
assert.strictEqual(governance.target.status, 'PASS');
assert.strictEqual(governance.constraints.status, 'PASSED');

const evidence = context.buildEvidenceSeparation([], {
  ...decision,
  objectiveText: 'Maximize Seal Strength',
  keyFactor: 'Temperature is dominant.',
  evidence: 'Descriptive',
  direction: 'Increase Temperature.',
  validation: 'Confirmation required.',
  confidence: 'MEDIUM'
}, governance, { status: 'PASS' });
const measuredBefore = evidence.measured.response;
const confirmationBefore = formValues.confirmationActual;

const improvement = context.buildImprovementVerification({
  baselineMean: '50',
  baselineStd: '5',
  baselineN: '20',
  improvedMean: '65',
  improvedStd: '3',
  improvedN: '20'
}, governance, 'PASS');

assert.strictEqual(improvement.baseline.source, 'Historical / Pre-DOE Process Data');
assert.strictEqual(improvement.improved.source, 'Post-Implementation Verification Data');
assert.strictEqual(improvement.decision.status, 'VERIFIED IMPROVEMENT');
assert.strictEqual(improvement.capability.status, 'READY FOR CAPABILITY ANALYSIS');
assert.strictEqual(improvement.closure.status, 'CLOSED');

improvement.improved.mean = 70;
assert.strictEqual(evidence.measured.response, measuredBefore, 'Improvement data must not mutate DOE measured evidence');
assert.strictEqual(formValues.confirmationActual, confirmationBefore, 'Improvement data must not mutate confirmation result');

const partial = context.improvementVerificationDecision(metrics, 'FAIL', 'PASS');
assert.strictEqual(partial.status, 'PARTIAL IMPROVEMENT');

const notVerified = context.improvementVerificationDecision(noImprovement, 'PASS', 'PASS');
assert.strictEqual(notVerified.status, 'NOT VERIFIED');

assert.strictEqual(context.studyClosureGate({
  experimentCompleted: true,
  dataValidated: true,
  evidenceReviewed: true,
  recommendationImplemented: true,
  improvementVerified: true,
  capabilityConfirmed: false
}).status, 'CLOSED');

assert.strictEqual(context.studyClosureGate({
  experimentCompleted: true,
  dataValidated: true,
  evidenceReviewed: true,
  recommendationImplemented: false,
  improvementVerified: true,
  capabilityConfirmed: false
}).status, 'OPEN - Additional Action Required');

[
  'improvementVerification',
  'baselineMean',
  'improvedMean',
  'meanImprovementValue',
  'variationImprovementValue',
  'improvementDecisionValue',
  'capabilityVerification',
  'studyClosure',
  'reportImprovementBody',
  'reportClosureBody'
].forEach(id => assert(html.includes(`id="${id}"`), `${id} missing from V7.6 UI/report structure`));

assert(html.includes('Historical / Pre-DOE Process Data'));
assert(html.includes('Post-Implementation Verification Data'));
assert(html.includes('Process Capability Verification'));

console.log('DOE V7.6 improvement closure tests passed');
