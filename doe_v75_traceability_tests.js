const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_5_Evidence_Separation_Traceability.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision/evidence block not found');

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
    factors: [],
    design: null,
    validation: { valid: true }
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
context.state.anova = { valid: false, rows: [] };

const decision = {
  objectiveText: 'Maximize Seal Strength',
  keyFactor: 'Temperature is dominant.',
  evidence: 'Descriptive effect analysis only.',
  direction: 'Increase Temperature.',
  settings: [
    { factor: 'Temperature', value: '150°C', label: 'High' },
    { factor: 'Pressure', value: '3 bar', label: 'High' }
  ],
  validation: 'Confirmation required.',
  confidence: 'MEDIUM',
  predicted: 55.2
};

context.state.decision = decision;
context.state.governance = context.buildGovernance(decision, { valid: true }, 'Pending');
const evidence = context.buildEvidenceSeparation([], decision, context.state.governance, { status: 'Pending' });

assert.strictEqual(evidence.measured.source, 'Experimental Run Data');
assert.strictEqual(evidence.measured.response, 55);
assert.strictEqual(evidence.model.source, 'DOE Model');
assert.strictEqual(evidence.model.predictedResponse, 55.2);
assert.strictEqual(evidence.engineeringDecision.source, 'Engineering Evaluation');
assert.notStrictEqual(evidence.measured.response, evidence.model.predictedResponse);

assert(evidence.trace.measuredResult.includes('55'));
assert(evidence.trace.modelPrediction.includes('55.2'));
assert(evidence.trace.target.includes('PASS'));
assert(evidence.trace.constraint.includes('PASSED'));
assert.strictEqual(evidence.trace.confirmation, 'Pending');
assert.strictEqual(evidence.trace.finalStatus, 'CONDITIONAL RELEASE');

const originalMeasured = evidence.measured.response;
evidence.model.predictedResponse = 60;
assert.strictEqual(evidence.measured.response, originalMeasured, 'Changing prediction must not mutate measured result');

const passGate = context.confirmationGate(55.2, 54.8, true);
const passGovernance = context.buildGovernance(decision, { valid: true }, passGate.status);
const passEvidence = context.buildEvidenceSeparation([], decision, passGovernance, passGate);
assert.strictEqual(passEvidence.trace.confirmation, 'PASS');
assert.strictEqual(passEvidence.engineeringDecision.status, 'READY FOR IMPLEMENTATION');

const reviewGate = context.confirmationGate(55.2, 40, true);
const reviewGovernance = context.buildGovernance(decision, { valid: true }, reviewGate.status);
const reviewEvidence = context.buildEvidenceSeparation([], decision, reviewGovernance, reviewGate);
assert.strictEqual(reviewEvidence.trace.confirmation, 'REVIEW');
assert.strictEqual(reviewEvidence.engineeringDecision.status, 'REVIEW REQUIRED');

[
  'measuredLayerBody',
  'modelLayerBody',
  'decisionLayerBody',
  'decisionTraceBody',
  'reportMeasuredEvidenceBody',
  'reportModelOutputBody',
  'reportEngineeringDecisionBody',
  'reportDecisionTraceBody'
].forEach(id => assert(html.includes(`id="${id}"`), `${id} missing from V7.5 UI/report structure`));

assert(html.includes('Measured · Source: Experimental Run Data'));
assert(html.includes('Predicted · Source: DOE Model'));
assert(html.includes('Decision · Source: Engineering Evaluation'));

console.log(`DOE traceability tests passed for ${targetFile}`);
