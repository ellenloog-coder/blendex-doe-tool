const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_7_Experiment_Strategy_Feasibility.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision/strategy block not found');

const context = {
  state: { lang: 'en', factors: [], study: {}, design: null },
  I18N: { en: { maximize: 'Maximize', minimize: 'Minimize', full: 'Full Factorial', screen: '8-Run Screening' } },
  $: id => ({ value: id === 'objective' ? 'maximize' : '' }),
  t: key => context.I18N.en[key] || key,
  fmt: number => Number(number).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  formatP: p => p < 0.0001 ? '<0.0001' : Number(p).toLocaleString(undefined, { maximumFractionDigits: 4 }),
  esc: value => String(value).replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match]))
};
vm.createContext(context);
vm.runInContext(statMatch[1], context);
vm.runInContext(decisionMatch[1], context);

{
  const assessment = context.buildStrategyAssessment({
    factorCount: 4,
    factorType: 'continuous',
    knowledge: 'high',
    objective: 'optimization',
    availableRuns: 20,
    costPerRun: 100,
    timePerRun: 0.5,
    timeConstraint: 20,
    sampleAvailability: 40
  });
  assert.strictEqual(assessment.feasibility.fullRuns, 16);
  assert.strictEqual(assessment.feasibility.status, 'FEASIBLE');
}

{
  const assessment = context.buildStrategyAssessment({
    factorCount: 10,
    factorType: 'mixed',
    knowledge: 'low',
    objective: 'screening',
    availableRuns: 16,
    costPerRun: 100,
    timePerRun: 1,
    timeConstraint: 20,
    sampleAvailability: 20
  });
  assert.strictEqual(assessment.feasibility.fullRuns, 1024);
  assert.strictEqual(assessment.feasibility.status, 'HIGH EXPERIMENT SCALE RISK');
  assert.strictEqual(assessment.recommendation.strategy, 'Screening DOE');
}

{
  const assessment = context.buildStrategyAssessment({
    factorCount: 1,
    factorType: 'continuous',
    knowledge: 'high',
    objective: 'confirmation',
    availableRuns: 8,
    costPerRun: 50,
    timePerRun: 1,
    timeConstraint: 8,
    sampleAvailability: 8
  });
  assert.strictEqual(assessment.feasibility.status, 'DOE NECESSITY WARNING');
  assert.match(assessment.feasibility.warnings.join(' '), /DOE may not be required/);
}

{
  const assessment = context.buildStrategyAssessment({
    factorCount: 8,
    factorType: 'mixed',
    knowledge: 'low',
    objective: 'screening',
    availableRuns: 16,
    costPerRun: 100,
    timePerRun: 0.5,
    timeConstraint: 10,
    sampleAvailability: 24
  });
  assert.strictEqual(assessment.recommendation.strategy, 'Screening DOE');
  assert.match(assessment.recommendation.loss, /interactions may not be independently estimated/i);
}

{
  const assessment = context.buildStrategyAssessment({
    factorCount: 3,
    factorType: 'continuous',
    knowledge: 'high',
    objective: 'optimization',
    availableRuns: 16,
    costPerRun: 200,
    timePerRun: 0.25,
    timeConstraint: 10,
    sampleAvailability: 24
  });
  assert.strictEqual(assessment.recommendation.strategy, 'Full Factorial DOE');
  assert.strictEqual(assessment.selectedImpact.runs, 8);
  assert.strictEqual(assessment.selectedImpact.cost, 1600);
  assert.strictEqual(assessment.selectedImpact.durationDays, 2);
}

{
  const assessment = context.buildStrategyAssessment({
    factorCount: 6,
    factorType: 'continuous',
    knowledge: 'medium',
    objective: 'optimization',
    availableRuns: 16,
    costPerRun: 100,
    timePerRun: 1,
    timeConstraint: 20,
    sampleAvailability: 20
  });
  assert.strictEqual(assessment.recommendation.strategy, 'Screening DOE');
  assert.match(assessment.recommendation.reason, /factor identification|resources/i);
}

const impact = context.costImpact(256, 100, 0.15625);
assert.strictEqual(impact.runs, 256);
assert.strictEqual(impact.cost, 25600);
assert.strictEqual(impact.durationDays, 40);

[
  'experimentStrategy',
  'strategyFactorCount',
  'feasibilityStatus',
  'strategyRecommendation',
  'strategyCostImpact',
  'strategyTraceBody',
  'reportStrategyBody',
  'acceptStrategyBtn'
].forEach(id => assert(html.includes(`id="${id}"`), `${id} missing from V7.7 UI/report structure`));

console.log('DOE V7.7 strategy tests passed');
