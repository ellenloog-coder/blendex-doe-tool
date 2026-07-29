const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_Model_Trust_Layer.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision/model trust block not found');

const context = {
  state: { lang: 'en', randomized: true, factors: [], design: null, anova: null },
  I18N: { en: { maximize: 'Maximize', minimize: 'Minimize', noDifference: 'No Clear Difference', highLevel: 'High', lowLevel: 'Low' } },
  $: id => ({ value: id === 'objective' ? 'maximize' : '' }),
  t: key => context.I18N.en[key] || key,
  fmt: number => Number(number).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  formatP: p => p < 0.0001 ? '<0.0001' : Number(p).toLocaleString(undefined, { maximumFractionDigits: 4 }),
  esc: value => String(value).replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match]))
};
vm.createContext(context);
vm.runInContext(statMatch[1], context);
vm.runInContext(decisionMatch[1], context);

const factors = [
  { id: 'f1', name: 'Temperature', low: '100°C', high: '150°C', constraintType: 'none' },
  { id: 'f2', name: 'Pressure', low: '2 bar', high: '3 bar', constraintType: 'none' }
];

function fullFactorialRuns(replicates, responseFn) {
  const combos = [
    { f1: factors[0].low, f2: factors[1].low },
    { f1: factors[0].low, f2: factors[1].high },
    { f1: factors[0].high, f2: factors[1].low },
    { f1: factors[0].high, f2: factors[1].high }
  ];
  const runs = [];
  combos.forEach((settings, comboIndex) => {
    for (let rep = 0; rep < replicates; rep++) {
      const coded = {
        f1: settings.f1 === factors[0].high ? 1 : -1,
        f2: settings.f2 === factors[1].high ? 1 : -1
      };
      runs.push({
        id: `r${runs.length + 1}`,
        standardOrder: comboIndex + 1,
        runOrder: runs.length + 1,
        settings,
        response: responseFn(coded, rep)
      });
    }
  });
  return runs;
}

function computeEffects(design) {
  return factors.map(factor => {
    const lows = design.runs.filter(run => run.settings[factor.id] === factor.low).map(run => run.response);
    const highs = design.runs.filter(run => run.settings[factor.id] === factor.high).map(run => run.response);
    const averageLow = context.statMean(lows);
    const averageHigh = context.statMean(highs);
    const effect = averageHigh - averageLow;
    return { factor, averageLow, averageHigh, effect, abs: Math.abs(effect) };
  }).sort((a, b) => b.abs - a.abs);
}

const design = { type: 'full_factorial', runs: fullFactorialRuns(3, (x, rep) => 30 + 5 * x.f1 + 0.5 * x.f2 + [0.05, -0.05, 0][rep]) };
const validation = context.validateDOEDataDetailed(design, factors);
const anova = context.computeFullFactorialAnova(design, factors);
const effects = computeEffects(design);
const governance = { constraints: { status: 'PASSED' }, target: { status: 'PASS' } };
const foundation = context.buildStatisticalEvidenceFoundation(effects, validation, anova, design, factors, governance, 'Pending');
const decision = {
  settings: [
    { factor: 'Temperature', value: '150°C' },
    { factor: 'Pressure', value: '3 bar' }
  ]
};
const modelTrust = context.buildModelTrustLayer(decision, foundation, governance, validation, anova, design, factors);

assert.strictEqual(modelTrust.assessment.modelType, 'First-order coded model');
assert(Number.isFinite(modelTrust.assessment.r2), 'R² should be calculated');
assert(Number.isFinite(modelTrust.assessment.adjustedR2), 'Adjusted R² should be calculated');
assert.strictEqual(modelTrust.assessment.predictionStatus, 'Available');
assert(modelTrust.assessment.supports.includes('Factor direction interpretation'));
assert(modelTrust.assessment.supports.includes('Engineering discussion'));

const insideBoundary = context.predictionBoundaryCheck(decision.settings, factors);
assert.strictEqual(insideBoundary.status, 'WITHIN TESTED REGION');
assert(insideBoundary.rows.every(row => row.status === 'WITHIN TESTED REGION'));

const outsideBoundary = context.predictionBoundaryCheck([
  { factor: 'Temperature', value: '175°C' },
  { factor: 'Pressure', value: '3 bar' }
], factors);
assert.strictEqual(outsideBoundary.status, 'OUTSIDE TESTED REGION');
assert.strictEqual(outsideBoundary.warning, 'Prediction reliability is reduced outside tested conditions.');

const outsideTrust = context.buildModelTrustLayer(
  { settings: [{ factor: 'Temperature', value: '175°C' }, { factor: 'Pressure', value: '3 bar' }] },
  foundation,
  governance,
  validation,
  anova,
  design,
  factors
);
assert.strictEqual(outsideTrust.trust.decision, 'Additional experiment required');
assert.strictEqual(outsideTrust.trust.status, 'REVIEW REQUIRED');

assert(modelTrust.limitations.includes('Based on tested DOE range'));
assert(modelTrust.limitations.includes('Additional confirmation may be required'));
assert(modelTrust.limitations.includes('External validation needed before sustained implementation'));

assert(html.includes('V7.9 Model Trust'));
assert(html.includes('reportModelTrustBody'));
assert(html.includes('modelAssessmentBody'));
assert(html.includes('predictionBoundaryBody'));
assert(html.includes('modelLimitationsBody'));

console.log('DOE V7.9 model trust tests passed');
