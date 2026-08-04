const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const targetFile = process.argv[2] || 'DOE Engineering Decision Support Tool V7.9.2.html';
const html = fs.readFileSync(targetFile, 'utf8');
const block = (start, end) => {
  const from = html.indexOf(start), to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} block missing`);
  return html.slice(from + start.length, to);
};
const slice = (start, end) => {
  const from = html.indexOf(start), to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} slice missing`);
  return html.slice(from, to);
};

const form = { objective: 'target', responseTarget: '50', responseName: 'Y', responseUnit: '' };
const context = {
  state: { lang: 'en', study: { target: '50' }, factors: [], design: null, regressionModel: null, anova: null },
  I18N: { en: { highLevel: 'High', lowLevel: 'Low', noDifference: 'No Difference', noObserved: 'None', highBetter: 'High', lowBetter: 'Low', responseValue: 'Response' } },
  $: id => ({ value: form[id] ?? '' }),
  t: key => context.I18N.en[key] || key,
  uiText: value => value,
  uiValue: value => value,
  fmt: value => String(Number(value)),
  formatP: value => String(value),
  esc: value => String(value),
  cartesian: arrays => arrays.reduce((rows, values) => rows.flatMap(row => values.map(value => [...row, value])), [[]])
};
vm.createContext(context);
vm.runInContext(block('/* STAT_ENGINE_START */', '/* STAT_ENGINE_END */'), context);
vm.runInContext(block('/* DECISION_ENGINE_START */', '/* DECISION_ENGINE_END */'), context);
vm.runInContext(slice('function validatePlan(show=true)', 'function generate()'), context);
vm.runInContext(slice('function computeEffects(', '/* DECISION_ENGINE_START */'), context);
vm.runInContext(slice('function calculateInteractions()', 'function renderInteractionAnalysis()'), context);

const factors = [
  { id: 'a', name: 'A', type: 'numeric', low: '10', high: '20' },
  { id: 'b', name: 'B', type: 'numeric', low: '100', high: '200' },
  { id: 'c', name: 'C', type: 'numeric', low: '1', high: '5' }
];
const combos = context.cartesian(factors.map(factor => [factor.low, factor.high]));
const approx = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const code = (run, factor) => run.runType === 'center' ? 0 : String(run.settings[factor.id]) === String(factor.high) ? 1 : -1;
const responseMain = run => 50 + 10 * code(run, factors[0]);
const responseInteraction = run => 50 + 10 * code(run, factors[0]) - 5 * code(run, factors[1]) + 4 * code(run, factors[0]) * code(run, factors[1]);

function designWith({ centers = 0, replicateIndexes = [], response = responseMain } = {}) {
  const runs = context.buildDesignRuns(combos, factors, { canEnhance: centers > 0 || replicateIndexes.length > 0, centerPoints: centers, independentReplicates: 0 });
  replicateIndexes.forEach(sourceIndex => {
    const source = runs[sourceIndex];
    const order = runs.length + 1;
    runs.push(context.makeRunRecord({ id: `run_${order}`, standardOrder: order, runOrder: order, settings: { ...source.settings }, runType: 'replicate', replicateOf: source.id }));
  });
  runs.forEach(run => context.setRunResponses(run, [response(run)]));
  return { type: 'full_factorial', runs };
}

function assertMainModel(design, label) {
  const model = context.fitDoeRegressionModel(design, factors);
  assert.equal(model.valid, true, `${label}: ${model.reason}`);
  approx(model.coefficientByKey.intercept, 50);
  approx(model.coefficientByKey['main:a'], 10);
  approx(model.coefficientByKey['main:b'], 0);
  approx(model.coefficientByKey['main:c'], 0);
  const low = factors.map(factor => ({ factor: factor.name, value: factor.low }));
  const high = factors.map(factor => ({ factor: factor.name, value: factor.high }));
  approx(context.predictDoeRegressionModel(model, low, factors), 40);
  approx(context.predictDoeRegressionModel(model, { a: '15', b: '150', c: '3' }, factors, 'center'), 50);
  approx(context.predictDoeRegressionModel(model, high, factors), 60);
  return model;
}

assertMainModel(designWith(), 'balanced full factorial');
assertMainModel(designWith({ centers: 4 }), 'full factorial + centers');
assertMainModel(designWith({ centers: 4, replicateIndexes: [0, 7, 1, 6] }), 'centers + dispersed non-balanced replicates');
assertMainModel(designWith({ replicateIndexes: [0, 0, 3, 7, 7, 7] }), 'arbitrary non-balanced replicates');

{
  const design = designWith({ centers: 3, replicateIndexes: [0, 7, 1, 6], response: responseInteraction });
  const model = context.fitDoeRegressionModel(design, factors);
  assert.equal(model.valid, true);
  approx(model.coefficientByKey.intercept, 50);
  approx(model.coefficientByKey['main:a'], 10);
  approx(model.coefficientByKey['main:b'], -5);
  approx(model.coefficientByKey['interaction:a:b'], 4);
  context.state.factors = factors;
  context.state.design = design;
  context.state.regressionModel = model;
  const effects = context.computeEffects(model);
  const interactions = context.calculateInteractions();
  approx(interactions.find(item => item.a.id === 'a' && item.b.id === 'b').effect, 8);
  const settings = [
    { factor: 'A', value: '20' },
    { factor: 'B', value: '100' },
    { factor: 'C', value: '1' }
  ];
  approx(context.predictionForSettings(effects, settings, model), 61);
}

{
  const repeated = Array.from({ length: 8 }, (_, index) => context.makeRunRecord({
    id: `bad_${index}`, standardOrder: index + 1, runOrder: index + 1,
    settings: { a: '10', b: '100', c: '1' }, rawResponses: [50]
  }));
  const model = context.fitDoeRegressionModel({ type: 'full_factorial', runs: repeated }, factors);
  assert.equal(model.valid, false);
  assert.ok(model.unestimableTerms.length > 0);
  assert.match(model.reason, /rank deficient/);
  assert.ok(html.includes('DOE model cannot be estimated:'), 'Analyze path must stop with an explicit rank/model error');
}

{
  const design = designWith({ centers: 4, replicateIndexes: [0, 7, 1, 6], response: run => 50 + 10 * code(run, factors[0]) + 7 * code(run, factors[1]) + 4 * code(run, factors[2]) });
  context.state.factors = factors;
  context.state.design = design;
  context.state.regressionModel = context.fitDoeRegressionModel(design, factors);
  const effects = context.computeEffects(context.state.regressionModel);
  const candidates = context.enumeratePredictionCandidates(effects, context.state.regressionModel);
  assert.equal(candidates.length, 8);
  const selected = context.selectPredictionCandidate(candidates, 'target', 50);
  assert.equal(selected.tieCount, 2);
  assert.equal(selected.equivalentCandidates.length, 2);
  assert.ok(selected.equivalentCandidates.every(candidate => Math.abs(candidate.loss - 1) < 1e-9));
}

assert.deepEqual(Array.from(context.dispersedReplicateIndexes(8, 12)), [0, 7, 1, 6, 2, 5, 3, 4, 0, 7, 1, 6]);
const unequal = designWith();
context.setRunResponses(unequal.runs[0], [1, 2, 3]);
assert.match(context.measurementCountWarning(unequal), /number of valid measurements differs/);
unequal.runs.forEach(run => context.setRunResponses(run, [1, 2]));
assert.equal(context.measurementCountWarning(unequal), null);
assert.ok(html.includes('This version does not automatically perform a formal curvature significance test.'));

console.log(`DOE OLS and integrity tests passed for ${targetFile}`);
