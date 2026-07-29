const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_8_Statistical_Evidence_Foundation.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision/statistical evidence block not found');

const context = {
  state: { lang: 'en', randomized: false, factors: [], design: null, anova: null },
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

function factors(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index + 1}`,
    name: ['Temperature', 'Pressure', 'Dwell'][index] || `F${index + 1}`,
    low: ['100°C', '2 bar', '0.8 s'][index] || 'Low',
    high: ['150°C', '3 bar', '1.2 s'][index] || 'High'
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
  const fs2 = factors(2);
  const design = { type: 'full_factorial', runs: fullFactorialRuns(fs2, 2, (x, _combo, rep) => 10 + 3 * x.f1 + 0.5 * x.f2 + (rep ? -0.1 : 0.1)) };
  const validation = context.validateDOEDataDetailed(design, fs2);
  const anova = context.computeFullFactorialAnova(design, fs2);
  context.state = { randomized: true, factors: fs2, design, anova };
  const effects = computeEffects(design, fs2);
  const foundation = context.buildStatisticalEvidenceFoundation(effects, validation, anova, design, fs2, { target: { status: 'PASS' }, constraints: { status: 'PASSED' } }, 'PASS');
  assert.strictEqual(foundation.observed[0].source, 'Experimental Data');
  assert.notStrictEqual(foundation.observed[0].observedEffect, foundation.evidence[0].status);
  assert.strictEqual(foundation.evidence[0].availability, 'ANOVA Available');
  assert.strictEqual(foundation.evidence[0].status, 'CONFIRMED');
  assert.strictEqual(foundation.readiness.statistics.status, 'PASS');
  assert.strictEqual(foundation.randomization.status, 'APPLIED');
}

{
  const fs3 = factors(3);
  const design = { type: 'full_factorial', runs: fullFactorialRuns(fs3, 1, x => 20 + 3 * x.f1 + 0.5 * x.f2 + 0.1 * x.f3) };
  const validation = context.validateDOEDataDetailed(design, fs3);
  const anova = context.computeFullFactorialAnova(design, fs3);
  context.state = { randomized: false, factors: fs3, design, anova };
  const effects = computeEffects(design, fs3);
  const foundation = context.buildStatisticalEvidenceFoundation(effects, validation, anova, design, fs3, { target: { status: 'NOT SET' }, constraints: { status: 'PASSED' } }, 'Pending');
  assert.strictEqual(foundation.evidence[0].status, 'OBSERVED ONLY');
  assert.strictEqual(foundation.evidence[0].availability, 'NOT AVAILABLE');
  assert.strictEqual(foundation.readiness.statistics.status, 'WARNING');
  assert.strictEqual(foundation.readiness.engineering.status, 'PENDING');
  assert.strictEqual(foundation.randomization.status, 'NOT APPLIED');
}

assert.strictEqual(context.recommendationState('Pending', undefined).label, 'Candidate Setting');
assert.strictEqual(context.recommendationState('PASS', undefined).label, 'Confirmed Setting');
assert.strictEqual(context.recommendationState('PASS', 'VERIFIED IMPROVEMENT').label, 'Validated Process Setting');

const invalidStatus = context.statisticalEvidenceStatus({ factor: { name: 'Temperature' } }, { valid: false }, null);
assert.strictEqual(invalidStatus.status, 'INSUFFICIENT');

assert(html.includes('Largest Observed Interaction Effect'));
assert(html.includes('Interaction Interpretation Restricted') || html.includes('Interaction conclusions are disabled for screening designs.'));
assert(html.includes('reportStatisticalEvidenceBody'));
assert(html.includes('observedEffectBody'));
assert(html.includes('statisticalEvidenceBody'));
assert(html.includes('dataReadinessStatus'));
assert(html.includes('Prediction Status'));

console.log('DOE V7.8 statistical evidence tests passed');
