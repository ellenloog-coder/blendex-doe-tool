const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE Engineering Decision Support Tool V7.9.2.html';
const html = fs.readFileSync(targetFile, 'utf8');
const statMatch = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
const decisionMatch = html.match(/\/\* DECISION_ENGINE_START \*\/([\s\S]*?)\/\* DECISION_ENGINE_END \*\//);
assert(statMatch, 'Stat engine block not found');
assert(decisionMatch, 'Decision engine block not found');

const formValues = {
  objective: 'maximize',
  responseTarget: '50',
  responseName: 'Response',
  responseUnit: 'unit'
};
const context = {
  state: { lang: 'en', study: { target: '50' }, factors: [], design: null, anova: null, analyzed: false },
  I18N: { en: {
    maximize: 'Maximize', minimize: 'Minimize', targetObjective: 'Approach Target',
    highLevel: 'High', lowLevel: 'Low', noDifference: 'No Clear Difference',
    noObserved: 'No clear direction', highBetter: 'High better', lowBetter: 'Low better',
    responseValue: 'Response'
  } },
  $: id => ({ value: formValues[id] ?? '' }),
  t: key => context.I18N.en[key] || key,
  uiText: value => value,
  uiValue: value => value,
  fmt: value => Number.isFinite(Number(value)) ? String(Number(value)) : '—',
  formatP: value => String(value),
  esc: value => String(value),
  cartesian: arrays => arrays.reduce((rows, values) => rows.flatMap(row => values.map(value => [...row, value])), [[]])
};
vm.createContext(context);
vm.runInContext(statMatch[1], context);
vm.runInContext(decisionMatch[1], context);

// 1–4. Maximize, minimize, approach-target, and missing-target behavior.
const candidates = [{ predicted: 40 }, { predicted: 49 }, { predicted: 60 }];
assert.strictEqual(context.selectPredictionCandidate(candidates, 'maximize', 50).predicted, 60);
assert.strictEqual(context.selectPredictionCandidate(candidates, 'minimize', 50).predicted, 40);
assert.strictEqual(context.selectPredictionCandidate(candidates, 'target', 50).predicted, 49);
assert.strictEqual(context.selectPredictionCandidate(candidates, 'target', null), null);
assert.strictEqual(context.targetCheck(49, '', 'target').status, 'NOT SET');
assert(html.includes('Approach Target mode requires a valid Target.'), 'Target validation guard is missing');

// 5–6. Budget enhancement and categorical center-point restriction.
const continuousFactors = [
  { id: 'f1', name: 'A', type: 'numeric', low: '0', high: '10' },
  { id: 'f2', name: 'B', type: 'numeric', low: '20 °C', high: '40 °C' },
  { id: 'f3', name: 'C', type: 'numeric', low: '1 bar', high: '3 bar' }
];
const continuousAssessment = context.buildStrategyAssessment({
  factorCount: 3, factorType: 'continuous', knowledge: 'high', objective: 'optimization',
  availableRuns: 16, costPerRun: 100, timePerRun: 0.5, timeConstraint: 20,
  sampleAvailability: 32, factorDefinitions: continuousFactors
});
assert.strictEqual(continuousAssessment.enhancement.baseRuns, 8);
assert.strictEqual(continuousAssessment.enhancement.remainingBudget, 8);
assert.strictEqual(continuousAssessment.enhancement.centerPoints, 4);
assert.strictEqual(continuousAssessment.enhancement.independentReplicates, 4);
assert.strictEqual(continuousAssessment.enhancement.enhancedRuns, 16);

const mixedFactors = continuousFactors.map(factor => ({ ...factor }));
mixedFactors[1] = { id: 'f2', name: 'Material', type: 'categorical', low: 'A', high: 'B' };
const mixedAssessment = context.buildStrategyAssessment({
  factorCount: 3, factorType: 'mixed', knowledge: 'high', objective: 'optimization',
  availableRuns: 16, costPerRun: 100, timePerRun: 0.5, timeConstraint: 20,
  sampleAvailability: 32, factorDefinitions: mixedFactors
});
assert.strictEqual(mixedAssessment.enhancement.centerEligible, false);
assert.strictEqual(mixedAssessment.enhancement.centerPoints, 0);
assert.strictEqual(mixedAssessment.enhancement.independentReplicates, 8);

// 7–10. Single-value compatibility, within-run statistics, mean modeling, and blanks.
const single = context.makeRunRecord({ id: 'single', standardOrder: 1, runOrder: 1, settings: {}, rawResponses: [7] });
assert.strictEqual(single.response, 7);
assert.strictEqual(single.responseCount, 1);
assert.strictEqual(single.responseStdDev, 0);

const multiple = context.makeRunRecord({ id: 'multi', standardOrder: 1, runOrder: 1, settings: {}, rawResponses: [10, 12, 14] });
assert.strictEqual(multiple.responseCount, 3);
assert.strictEqual(multiple.responseMean, 12);
assert.strictEqual(multiple.responseStdDev, 2);
assert.strictEqual(multiple.responseRange, 4);
assert.strictEqual(context.modelResponse(multiple), 12);

const blanks = context.makeRunRecord({ id: 'blank', standardOrder: 1, runOrder: 1, settings: {}, rawResponses: ['', null, ''] });
assert.strictEqual(blanks.responseCount, 0);
assert.strictEqual(blanks.responseMean, null);
assert.strictEqual(blanks.response, null);
const partial = context.makeRunRecord({ id: 'partial', standardOrder: 1, runOrder: 1, settings: {}, rawResponses: ['', '12', ''] });
assert.strictEqual(partial.responseMean, 12);
const invalid = context.makeRunRecord({ id: 'invalid', standardOrder: 1, runOrder: 1, settings: {}, rawResponses: ['12', 'bad'] });
assert.strictEqual(invalid.invalidResponseCount, 1);

const computeStart = html.indexOf('function computeEffects(');
const computeEnd = html.indexOf('/* DECISION_ENGINE_START */', computeStart);
assert(computeStart >= 0 && computeEnd > computeStart, 'computeEffects source not found');
vm.runInContext(html.slice(computeStart, computeEnd), context);
context.state.factors = [{ id: 'f1', name: 'A', type: 'numeric', low: 'L', high: 'H' }];
context.state.design = { type: 'full_factorial', runs: [
  context.makeRunRecord({ id: 'l', standardOrder: 1, runOrder: 1, settings: { f1: 'L' }, rawResponses: [10, 12, 14] }),
  context.makeRunRecord({ id: 'h', standardOrder: 2, runOrder: 2, settings: { f1: 'H' }, rawResponses: [20, 22, 24] })
] };
const effect = context.computeEffects()[0];
assert(Math.abs(effect.averageLow - 12) < 1e-9);
assert(Math.abs(effect.averageHigh - 22) < 1e-9);
assert(Math.abs(effect.effect - 10) < 1e-9);

// 11–12. UTF-8 BOM, Chinese headers, multi-response columns, and CSV round trip.
const rows = context.buildDoeTemplateRows(context.state.design, context.state.factors, 'zh', '响应', '50');
const header = rows[0].join('|');
['试验序号', '因子名称', '响应值', '目标值', '中心点', '重复试验'].forEach(label => assert(header.includes(label), `Missing Chinese export label: ${label}`));
assert(header.includes('响应值_1') && header.includes('响应值_2') && header.includes('响应值_3'));
const csv = context.encodeCsvWithBom(rows);
assert.strictEqual(csv.charCodeAt(0), 0xFEFF);

const importStart = html.indexOf('function parseDelimitedText(text)');
const importEnd = html.indexOf('function importGuidance()', importStart);
assert(importStart >= 0 && importEnd > importStart, 'CSV parsing helpers not found');
vm.runInContext(html.slice(importStart, importEnd), context);
const parsed = context.parseDelimitedText(csv);
const responseIndexes = context.detectResponseColumns(parsed[0], '响应');
assert.strictEqual(responseIndexes.length, 3);
const roundTripRaw = responseIndexes.map(index => parsed[1][index]).filter(value => value !== '');
const roundTrip = context.summarizeResponses(roundTripRaw);
assert.strictEqual(roundTrip.mean, 12);
assert.strictEqual(roundTrip.stdDev, 2);

assert(html.includes("new Blob([csv],{type:'text/csv;charset=utf-8;'})"), 'CSV MIME type is missing');
assert(html.includes("reader.readAsText(file,'UTF-8')"), 'UTF-8 import is not explicit');
assert(html.includes('模型基于每个试验运行的平均响应值建立。'), 'Mean-modeling disclosure is missing');

console.log(`DOE target, budget enhancement, multi-response, and UTF-8 CSV tests passed for ${targetFile}`);
