const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_3_Engineering_Decision_Layer.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision engine block not found');

const context = {
  state: {},
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
  $: id => ({ value: id === 'responseUnit' ? 'N' : 'Seal Strength' }),
  t: key => context.I18N.en[key] || key,
  fmt: number => Number(number).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  formatP: p => p < 0.0001 ? '<0.0001' : Number(p).toLocaleString(undefined, { maximumFractionDigits: 4 }),
  esc: value => String(value).replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match]))
};
vm.createContext(context);
vm.runInContext(statMatch[1], context);
vm.runInContext(decisionMatch[1], context);

function makeFactors(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index + 1}`,
    name: ['Temperature', 'Pressure', 'Dwell Time', 'Speed', 'Cooling', 'Lot'][index],
    low: ['160°C', '2.0 bar', '0.8 s', 'Slow', 'Low', 'A'][index],
    high: ['180°C', '3.0 bar', '1.2 s', 'Fast', 'High', 'B'][index]
  }));
}

function fullFactorialRuns(factors, replicates, responseFn) {
  const combos = factors.reduce((rows, factor) => rows.flatMap(row => [
    { ...row, [factor.id]: factor.low },
    { ...row, [factor.id]: factor.high }
  ]), [{}]);
  const runs = [];
  combos.forEach((settings, comboIndex) => {
    for (let rep = 0; rep < replicates; rep++) {
      const coded = Object.fromEntries(factors.map(factor => [
        factor.id,
        settings[factor.id] === factor.high ? 1 : -1
      ]));
      runs.push({
        id: `r${runs.length + 1}`,
        standardOrder: comboIndex + 1,
        runOrder: runs.length + 1,
        settings,
        response: responseFn(coded, comboIndex, rep)
      });
    }
  });
  return runs;
}

function computeEffects(design, factors) {
  return factors.map(factor => {
    const lows = design.runs.filter(run => run.settings[factor.id] === factor.low).map(run => run.response);
    const highs = design.runs.filter(run => run.settings[factor.id] === factor.high).map(run => run.response);
    const averageLow = context.statMean(lows);
    const averageHigh = context.statMean(highs);
    const effect = averageHigh - averageLow;
    return { factor, averageLow, averageHigh, effect, abs: Math.abs(effect) };
  }).sort((a, b) => b.abs - a.abs);
}

{
  const factors = makeFactors(2);
  const design = { type: 'full_factorial', runs: fullFactorialRuns(factors, 2, (x, _combo, rep) => 10 + 2 * x.f1 + 0.5 * x.f2 + (rep ? -0.1 : 0.1)) };
  context.state = { lang: 'en', design, factors };
  context.state.anova = context.computeFullFactorialAnova(design, factors);
  const validation = context.validateDOEDataDetailed(design, factors);
  const effects = computeEffects(design, factors);
  const decision = context.buildDecisionSummary(effects, 'maximize', validation);
  assert.strictEqual(decision.confidence, 'HIGH');
  assert.match(decision.evidence, /p=/);
  assert.match(decision.keyFactor, /Temperature/);
  assert(Number.isFinite(decision.predicted));
}

{
  const factors = makeFactors(3);
  const design = { type: 'full_factorial', runs: fullFactorialRuns(factors, 1, x => 20 + 3 * x.f1 + 0.5 * x.f2 + 0.25 * x.f3) };
  context.state = { lang: 'en', design, factors };
  context.state.anova = context.computeFullFactorialAnova(design, factors);
  const validation = context.validateDOEDataDetailed(design, factors);
  const effects = computeEffects(design, factors);
  const decision = context.buildDecisionSummary(effects, 'maximize', validation);
  assert.strictEqual(context.state.anova.valid, false);
  assert.strictEqual(decision.confidence, 'MEDIUM');
  assert.match(decision.evidence, /Descriptive effect analysis only/);
}

{
  const factors = makeFactors(5);
  const design = { type: 'screening_8_run', runs: fullFactorialRuns(factors, 1, x => 10 + x.f1).slice(0, 8) };
  context.state = { lang: 'en', design, factors, anova: { valid: false } };
  const effects = computeEffects(design, factors);
  assert.strictEqual(context.confidenceForEffect(effects[0], effects), 'LOW');
  assert(html.includes('Interaction conclusions are disabled for screening designs.'));
}

assert.strictEqual(context.confirmationGate(100, 104, true).status, 'PASS');
assert.strictEqual(context.confirmationGate(100, 112, true).status, 'REVIEW');
assert.strictEqual(context.confirmationGate(100, NaN, true).status, 'Pending');
assert.strictEqual(context.confirmationGate(100, 100, false).status, 'Pending');

[
  'reportExperimentBody',
  'reportDesignBody',
  'reportDesignMatrixBody',
  'reportValidationBody',
  'reportAnalysisBody',
  'reportDecisionBody',
  'decisionObjective',
  'decisionEvidence',
  'decisionValidation'
].forEach(id => assert(html.includes(`id="${id}"`), `${id} missing from V7.3 report structure`));

console.log(`DOE decision tests passed for ${targetFile}`);
