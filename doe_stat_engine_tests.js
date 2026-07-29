const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_2_Statistical_Integrity_ANOVA.html';
const html = fs.readFileSync(targetFile, 'utf8');
const match = html.match(/\/\* STAT_ENGINE_START \*\/([\s\S]*?)\/\* STAT_ENGINE_END \*\//);
assert(match, 'Stat engine block not found');

const context = {};
vm.createContext(context);
vm.runInContext(match[1], context);

function factors(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index + 1}`,
    name: `F${index + 1}`,
    low: 'Low',
    high: 'High'
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

function approx(actual, expected, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

{
  const fs2 = factors(2);
  const runs = fullFactorialRuns(fs2, 2, (x, _combo, rep) => 10 + 2 * x.f1 + 0.5 * x.f2 + (rep === 0 ? 0.1 : -0.1));
  const anova = context.computeFullFactorialAnova({ type: 'full_factorial', runs }, fs2);
  assert.strictEqual(anova.valid, true);
  assert.strictEqual(anova.pureError.df, 4);
  approx(anova.pureError.ss, 0.08);
  approx(anova.rows[0].ss, 32);
  approx(anova.rows[0].f, 1600);
  approx(anova.rows[1].ss, 2);
  approx(anova.rows[1].f, 100);
}

{
  const fs3 = factors(3);
  const runs = fullFactorialRuns(fs3, 1, x => 20 + 3 * x.f1 - 1 * x.f2 + 0.25 * x.f3);
  const anova = context.computeFullFactorialAnova({ type: 'full_factorial', runs }, fs3);
  assert.strictEqual(anova.valid, false);
  assert.strictEqual(anova.pureError.df, 0);
  assert.match(anova.reason, /Descriptive analysis only/);
}

{
  const fs4 = factors(4);
  const runs = fullFactorialRuns(fs4, 2, (x, combo, rep) => 50 + x.f1 + 2 * x.f2 - 0.5 * x.f3 + 0.2 * x.f4 + (rep ? -0.05 : 0.05));
  const anova = context.computeFullFactorialAnova({ type: 'full_factorial', runs }, fs4);
  assert.strictEqual(anova.valid, true);
  assert.strictEqual(anova.rows.length, 4);
  assert.strictEqual(anova.pureError.df, 16);
  assert.strictEqual(anova.total.df, 31);
}

{
  const fs5 = factors(5);
  const runs = fullFactorialRuns(fs5, 1, () => 1).slice(0, 8);
  const anova = context.computeFullFactorialAnova({ type: 'screening_8_run', runs }, fs5);
  assert.strictEqual(anova.valid, false);
  assert.match(anova.reason, /screening designs/);
}

{
  const fs6 = factors(6);
  const runs = fullFactorialRuns(fs6, 1, () => 1).slice(0, 8);
  const anova = context.computeFullFactorialAnova({ type: 'screening_8_run', runs }, fs6);
  assert.strictEqual(anova.valid, false);
}

{
  const fs2 = factors(2);
  const missingResponse = { type: 'full_factorial', runs: fullFactorialRuns(fs2, 1, () => 1) };
  missingResponse.runs[0].response = null;
  assert.match(context.validateDOEDataDetailed(missingResponse, fs2).errors.join(' '), /missing responses/);

  const wrongLevel = { type: 'full_factorial', runs: fullFactorialRuns(fs2, 1, () => 1) };
  wrongLevel.runs[0].settings.f1 = 'Medium';
  assert.match(context.validateDOEDataDetailed(wrongLevel, fs2).errors.join(' '), /factor level/);

  const duplicateRun = { type: 'full_factorial', runs: fullFactorialRuns(fs2, 1, () => 1) };
  duplicateRun.runs[1].runOrder = duplicateRun.runs[0].runOrder;
  assert.match(context.validateDOEDataDetailed(duplicateRun, fs2).errors.join(' '), /run order/);

  const missingRun = { type: 'full_factorial', runs: fullFactorialRuns(fs2, 1, () => 1).slice(1) };
  assert.match(context.validateDOEDataDetailed(missingRun, fs2).errors.join(' '), /expected design combination/);
}

console.log(`DOE stat engine tests passed for ${targetFile}`);
