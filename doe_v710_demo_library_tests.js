const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// The public regression target is the single approved entry point. Historical
// V7.x demos remain available for archival checks via an explicit argv path.
const targetFile = process.argv[2] || 'DOE Engineering Decision Support Tool V7.9.2.html';
const html = fs.readFileSync(targetFile, 'utf8');

const exampleMatch = html.match(/const EXAMPLE_STUDIES=([\s\S]*?\n\];)/);
assert(exampleMatch, 'Example study library not found');

const context = {};
vm.createContext(context);
vm.runInContext(`var EXAMPLE_STUDIES=${exampleMatch[1]}`, context);
const examples = JSON.parse(JSON.stringify(context.EXAMPLE_STUDIES));

assert.strictEqual(examples.length, 4, 'Expected four example studies');
assert.deepStrictEqual(examples.map(example => example.id), ['optimization', 'screening', 'rootcause', 'robustness']);

const optimization = examples.find(example => example.id === 'optimization');
assert.strictEqual(optimization.title, 'Injection Molding Warpage Reduction');
assert.strictEqual(optimization.factorDefinitions.length, 3);
assert.strictEqual(optimization.approach, 'Full Factorial DOE + Optimization');
assert.strictEqual(optimization.i18n.en.title, 'Injection Molding Warpage Reduction');
assert.strictEqual(optimization.i18n.zh.title, '注塑翘曲降低');
assert.strictEqual(optimization.i18n.zh.factorDefinitions[0].name, '注射温度');

const screening = examples.find(example => example.id === 'screening');
assert.strictEqual(screening.factorDefinitions.length, 5);
assert(screening.approach.includes('Fractional Factorial Screening DOE'));
assert(screening.approach.includes('existing 8-run screening workflow'));
assert(screening.limitation.includes('Interaction effects may not be independently estimated'));
assert.strictEqual(screening.i18n.zh.response, '直径波动');
assert.strictEqual(screening.i18n.zh.factorDefinitions[3].low, '已使用');

const rootcause = examples.find(example => example.id === 'rootcause');
assert.strictEqual(rootcause.experimentType, 'rootcause');
assert.strictEqual(rootcause.response, 'Leak Rate');
assert.strictEqual(rootcause.i18n.zh.title, '密封泄漏失效调查');

const robustness = examples.find(example => example.id === 'robustness');
assert.strictEqual(robustness.factorDefinitions.filter(factor => factor.classification === 'noise').length, 2);
assert(robustness.approach.includes('existing two-level workflow'));
assert.strictEqual(robustness.i18n.zh.factorDefinitions[3].high, '高');

function exampleResponseForRun(example, run) {
  const model = example.responseModel || { base: 30, weights: [], noise: [0] };
  let response = model.base;
  example.factorDefinitions.forEach((factor, index) => {
    const high = String(run.settings[`f${index + 1}`]) === String(factor.high);
    const code = high ? 1 : -1;
    response += (model.weights[index] || 0) * code;
  });
  const noise = model.noise || [0];
  response += noise[(run.standardOrder - 1) % noise.length] || 0;
  return Number(response.toFixed(3));
}

examples.forEach(example => {
  const settings = Object.fromEntries(example.factorDefinitions.map((factor, index) => [`f${index + 1}`, factor.high]));
  const response = exampleResponseForRun(example, { standardOrder: 1, settings });
  assert(Number.isFinite(response), `${example.id} should generate a numeric demo response`);
});

const header = html.match(/<header class="app-nav">([\s\S]*?)<\/header>/)?.[1] || '';
assert(header.includes('id="exampleStudySelect"'), 'Example study selector should be in the global header');
assert(html.includes('aria-label="Example Study"'), 'Example study selector should expose the compact Example Study label');
assert(html.includes('id="exampleStudySelect"'));
assert(html.includes('function localizedExample'));
assert(html.includes('const view=localizedExample(example);'));
assert(html.includes('${esc(view.type)} - ${esc(view.title)}'));
assert(!header.includes('Demo Studies'), 'Header should use the compact Example Study control');
assert(!html.includes('Select an example DOE study'));
assert(html.includes('function loadExampleStudy'));
assert(html.includes('function renderExampleLibrary'));
assert(!html.includes('data-example-load'));
assert(!html.includes('id="exampleLibrary"'));
assert(!html.includes('id="loadExampleBtn"'));
assert(!html.includes('demo-library-compact'));

console.log('DOE V7.10 demo library tests passed');
