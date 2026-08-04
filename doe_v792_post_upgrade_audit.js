const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const ROOT = __dirname;
const FILES = [
  'index.html',
  'DOE Engineering Decision Support Tool V7.9.2.html',
  'DOE V7.9.2 UI Candidate.html'
];
const PRODUCTION = FILES[1];
const htmlByFile = Object.fromEntries(FILES.map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
const html = htmlByFile[PRODUCTION];
const results = [];
const failures = [];
const notes = [];

function markedBlock(source, start, end) {
  const match = source.match(new RegExp(`${start}([\\s\\S]*?)${end}`));
  assert.ok(match, `Missing block ${start} ... ${end}`);
  return match[1];
}

function sourceSlice(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source slice ${start} ... ${end}`);
  return source.slice(from, to);
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function check(name, fn) {
  try {
    const evidence = await fn();
    results.push({ name, status: 'PASS', evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    results.push({ name, status: 'FAIL', evidence: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function buildContext() {
  const formValues = {
    objective: 'maximize',
    responseTarget: '',
    responseName: 'Response',
    responseUnit: 'unit'
  };
  const alerts = [];
  const context = {
    console,
    formValues,
    alerts,
    state: {
      lang: 'en',
      study: { target: '' },
      factors: [],
      design: null,
      anova: null,
      analyzed: false
    },
    I18N: { en: {
      maximize: 'Maximize', minimize: 'Minimize', targetObjective: 'Approach Target',
      highLevel: 'High', lowLevel: 'Low', noDifference: 'No Clear Difference',
      noObserved: 'No clear direction', highBetter: 'High better', lowBetter: 'Low better',
      responseValue: 'Response', invalidCount: 'Invalid count', missingFields: 'Missing fields', sameLevels: 'Same levels'
    } },
    $: id => ({ value: formValues[id] ?? '' }),
    alert: message => alerts.push(String(message)),
    t: key => context.I18N.en[key] || key,
    uiText: value => value,
    uiValue: value => value,
    fmt: value => Number.isFinite(Number(value)) ? String(Number(value)) : '—',
    formatP: value => String(value),
    esc: value => String(value),
    cartesian: arrays => arrays.reduce((rows, values) => rows.flatMap(row => values.map(value => [...row, value])), [[]])
  };
  vm.createContext(context);
  vm.runInContext(markedBlock(html, '/\\* STAT_ENGINE_START \\*/', '/\\* STAT_ENGINE_END \\*/'), context);
  vm.runInContext(markedBlock(html, '/\\* DECISION_ENGINE_START \\*/', '/\\* DECISION_ENGINE_END \\*/'), context);
  vm.runInContext(sourceSlice(html, 'function validatePlan(show=true)', 'function generate()'), context);
  vm.runInContext(sourceSlice(html, 'function computeEffects(', '/* DECISION_ENGINE_START */'), context);
  vm.runInContext(sourceSlice(html, 'function calculateInteractions()', 'function renderInteractionAnalysis()'), context);
  vm.runInContext(sourceSlice(html, 'function parseDelimitedText(text)', 'function importGuidance()'), context);
  return context;
}

const context = buildContext();
const continuousFactors = [
  { id: 'a', name: 'A', type: 'numeric', low: '10', high: '20' },
  { id: 'b', name: 'B', type: 'numeric', low: '100', high: '200' },
  { id: 'c', name: 'C', type: 'numeric', low: '1', high: '5' }
];

(async () => {
  await check('target-validation-modes-and-zero', () => {
    context.state.factors = continuousFactors.map(factor => ({ ...factor }));
    for (const [objective, target, expected] of [
      ['maximize', '', true],
      ['minimize', '', true],
      ['target', '', false],
      ['target', '50', true],
      ['target', '0', true]
    ]) {
      context.formValues.objective = objective;
      context.formValues.responseTarget = target;
      context.alerts.length = 0;
      assert.equal(context.validatePlan(true), expected, `${objective}/${JSON.stringify(target)}`);
      if (!expected) assert.match(context.alerts[0] || '', /valid Target/);
    }
    return 'maximize blank=true; minimize blank=true; target blank=false; target 50=true; target 0=true';
  });

  await check('enhanced-run-generation-and-copy-isolation', () => {
    const combos = context.cartesian(continuousFactors.map(factor => [factor.low, factor.high]));
    const enhancement = {
      canEnhance: true,
      centerPoints: 4,
      independentReplicates: 4
    };
    const runs = context.buildDesignRuns(combos, continuousFactors, enhancement);
    assert.equal(runs.length, 16);
    assert.equal(runs.filter(run => run.runType === 'factorial').length, 8);
    assert.equal(runs.filter(run => run.runType === 'center').length, 4);
    assert.equal(runs.filter(run => run.runType === 'replicate').length, 4);
    assert.equal(new Set(runs.map(run => run.id)).size, 16);
    const byId = new Map(runs.map(run => [run.id, run]));
    const replicates = runs.filter(run => run.runType === 'replicate');
    assert.deepEqual(Array.from(replicates, run => run.replicateOf), ['run_1', 'run_8', 'run_2', 'run_7']);
    for (const replicate of replicates) {
      const original = byId.get(replicate.replicateOf);
      assert.ok(original, `${replicate.id} has no source`);
      assert.equal(JSON.stringify(replicate.settings), JSON.stringify(original.settings));
      assert.deepEqual(Array.from(replicate.rawResponses), ['']);
      assert.notEqual(replicate.rawResponses, original.rawResponses);
    }
    context.setRunResponses(runs[0], [10, 12]);
    assert.deepEqual(Array.from(replicates[0].rawResponses), ['']);
    context.setRunResponses(replicates[0], [90]);
    assert.deepEqual(Array.from(runs[0].rawResponses), [10, 12]);
    return '16 unique IDs; spatially dispersed sources run_1/run_8/run_2/run_7; settings equal; response arrays isolated';
  });

  await check('anova-run-means-and-pure-error-source', () => {
    const factors = [
      { id: 'a', name: 'A', type: 'numeric', low: 'L', high: 'H' },
      { id: 'b', name: 'B', type: 'numeric', low: 'L', high: 'H' }
    ];
    const records = [
      context.makeRunRecord({ id: 'r1', standardOrder: 1, runOrder: 1, settings: { a: 'L', b: 'L' }, rawResponses: [10, 12, 14] }),
      context.makeRunRecord({ id: 'r2', standardOrder: 5, runOrder: 2, settings: { a: 'L', b: 'L' }, runType: 'replicate', replicateOf: 'r1', rawResponses: [20, 22, 24] }),
      context.makeRunRecord({ id: 'r3', standardOrder: 2, runOrder: 3, settings: { a: 'L', b: 'H' }, rawResponses: [30] }),
      context.makeRunRecord({ id: 'r4', standardOrder: 3, runOrder: 4, settings: { a: 'H', b: 'L' }, rawResponses: [40] }),
      context.makeRunRecord({ id: 'r5', standardOrder: 4, runOrder: 5, settings: { a: 'H', b: 'H' }, rawResponses: [50] })
    ];
    context.state.factors = factors;
    context.state.design = { type: 'full_factorial', runs: records };
    assert.deepEqual(Array.from(records.slice(0, 2), context.modelResponse), [12, 22]);
    const effects = context.computeEffects();
    assert.ok(effects.every(effect => Number.isFinite(effect.effect)));
    const interactions = context.calculateInteractions();
    assert.equal(interactions.length, 1);
    const anova = context.computeFullFactorialAnova(context.state.design, factors);
    assert.equal(anova.total.df, 4, 'ANOVA expanded within-run samples instead of using five run means');
    assert.equal(anova.pureError.df, 1);
    assert.equal(anova.pureError.ss, 50);
    assert.equal(records[0].responseStdDev, 2);
    assert.equal(records[1].responseStdDev, 2);
    return 'model inputs include 12 and 22; total df=4; pure-error df=1, SS=50; within-run SD not consumed';
  });

  await check('enhanced-design-first-order-model-remains-unbiased', () => {
    const factors = continuousFactors.map(factor => ({ ...factor }));
    const combos = context.cartesian(factors.map(factor => [factor.low, factor.high]));
    const runs = context.buildDesignRuns(combos, factors, { canEnhance: true, centerPoints: 4, independentReplicates: 4 });
    runs.forEach(run => {
      const a = run.runType === 'center' ? 0 : String(run.settings.a) === String(factors[0].high) ? 1 : -1;
      context.setRunResponses(run, [50 + 10 * a]);
    });
    context.state.factors = factors;
    context.state.design = { type: 'full_factorial', runs };
    const model=context.fitDoeRegressionModel(context.state.design,factors);
    const effects = context.computeEffects();
    const highSettings = effects.map(effect => ({ factor: effect.factor.name, value: effect.factor.high }));
    const lowSettings = effects.map(effect => ({ factor: effect.factor.name, value: effect.factor.low }));
    const predictedHigh = context.predictionForSettings(effects, highSettings);
    const predictedLow = context.predictionForSettings(effects, lowSettings);
    const predictedCenter=context.predictDoeRegressionModel(model,{a:'15',b:'150',c:'3'},factors,'center');
    assert.ok(Math.abs(model.coefficientByKey.intercept-50)<1e-9);
    assert.ok(Math.abs(model.coefficientByKey['main:a']-10)<1e-9);
    assert.ok(Math.abs(effects.find(effect => effect.factor.id === 'a').effect-20)<1e-9);
    assert.ok(Math.abs(predictedLow-40)<1e-9);
    assert.ok(Math.abs(predictedCenter-50)<1e-9);
    assert.ok(Math.abs(predictedHigh-60)<1e-9, `Noiseless first-order data should predict 60 at A high; actual=${predictedHigh}`);
    return 'intercept=50; coefficient A=10; effect A=20; low/center/high predictions=40/50/60';
  });

  await check('unequal-measurement-counts-use-equal-run-weight', () => {
    const runs = [
      context.makeRunRecord({ id: 'n1', standardOrder: 1, runOrder: 1, settings: {}, rawResponses: [10] }),
      context.makeRunRecord({ id: 'n3', standardOrder: 2, runOrder: 2, settings: {}, rawResponses: [10, 12, 14] }),
      context.makeRunRecord({ id: 'n10', standardOrder: 3, runOrder: 3, settings: {}, rawResponses: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    ];
    assert.deepEqual(Array.from(runs, context.modelResponse), [10, 12, 14.5]);
    context.state.factors = [];
    context.state.design = { type: 'full_factorial', runs };
    const intercept = context.predictionForSettings([], []);
    assert.ok(Math.abs(intercept - ((10 + 12 + 14.5) / 3)) < 1e-12);
    const weighted = (10 + 10 + 12 + 14 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19) / 14;
    assert.notEqual(intercept, weighted);
    return `run means=10,12,14.5; equal-run intercept=${intercept}; measurement-weighted=${weighted}`;
  });

  await check('unequal-measurement-count-warning-present', () => {
    const requiredZh = '不同试验运行的有效测量数量不一致';
    const requiredEn = 'measurement counts differ';
    assert.ok(html.includes(requiredZh) || html.toLowerCase().includes(requiredEn), 'No UI/report warning for unequal per-run measurement counts');
    return 'warning found';
  });

  await check('response-missing-invalid-and-standard-deviation', () => {
    const blank = context.summarizeResponses(['', ' ', undefined, null]);
    assert.equal(blank.count, 0);
    assert.equal(blank.mean, null);
    assert.equal(blank.stdDev, null);
    const invalid = context.summarizeResponses(['10', '非法文字', '']);
    assert.equal(invalid.count, 1);
    assert.equal(invalid.mean, 10);
    assert.equal(invalid.invalidCount, 1);
    assert.equal(invalid.stdDev, 0);
    const sample = context.summarizeResponses([10, 12, 14]);
    assert.equal(sample.stdDev, 2);
    return 'blank N=0/mean=null/SD=null; invalid flagged and excluded; N=1 SD=0; sample SD uses n-1';
  });

  await check('target-enumerates-all-combinations-not-per-factor-choice', () => {
    const factors = [
      { id: 'a', name: 'A', low: 'L', high: 'H' },
      { id: 'b', name: 'B', low: 'L', high: 'H' },
      { id: 'c', name: 'C', low: 'L', high: 'H' }
    ];
    const effects = [
      { factor: factors[0], effect: 20, averageLow: 38, averageHigh: 58 },
      { factor: factors[1], effect: 14, averageLow: 41, averageHigh: 55 },
      { factor: factors[2], effect: 8, averageLow: 44, averageHigh: 52 }
    ];
    context.state.factors = factors;
    context.state.study.target = '50';
    context.formValues.responseTarget = '50';
    const combos=context.cartesian(factors.map(factor=>[factor.low,factor.high]));
    context.state.design = { type:'full_factorial',runs:combos.map((combo,index)=>{
      const settings=Object.fromEntries(factors.map((factor,factorIndex)=>[factor.id,combo[factorIndex]]));
      const codes=combo.map(value=>value==='H'?1:-1);
      return context.makeRunRecord({id:`t${index}`,standardOrder:index+1,runOrder:index+1,settings,rawResponses:[48+10*codes[0]+7*codes[1]+4*codes[2]]});
    })};
    const model=context.fitDoeRegressionModel(context.state.design,factors);
    const fittedEffects=context.computeEffects(model);
    const candidates = context.enumeratePredictionCandidates(fittedEffects,model);
    assert.equal(candidates.length, 8);
    const selected = context.selectPredictionCandidate(candidates, 'target', 50);
    assert.ok(Math.abs(selected.predicted-49)<1e-9);
    assert.deepEqual(Array.from(selected.settings, item => item.value), ['L', 'H', 'H']);
    const perFactor = fittedEffects.map(effect => context.preferred(effect, 'target'));
    assert.deepEqual(Array.from(perFactor, item => item.value), ['H', 'H', 'H']);
    assert.ok(Math.abs(context.predictionForSettings(fittedEffects, perFactor.map((item, index) => ({ factor: factors[index].name, value: item.value })),model)-69)<1e-9);
    return '8 candidates; complete-combination result L/H/H predicts 49; independent endpoint choices H/H/H predict 69';
  });

  await check('target-tie-is-stable-first-enumerated', () => {
    const effects = [
      { factor: { name: 'A', low: 'L', high: 'H' }, effect: 20 },
      { factor: { name: 'B', low: 'L', high: 'H' }, effect: 14 },
      { factor: { name: 'C', low: 'L', high: 'H' }, effect: 8 }
    ];
    context.state.factors=effects.map((effect,index)=>({id:String.fromCharCode(97+index),...effect.factor,type:'numeric'}));
    const combos=context.cartesian(context.state.factors.map(factor=>[factor.low,factor.high]));
    context.state.design = {type:'full_factorial',runs:combos.map((combo,index)=>{
      const settings=Object.fromEntries(context.state.factors.map((factor,factorIndex)=>[factor.id,combo[factorIndex]]));
      const codes=combo.map(value=>value==='H'?1:-1);
      return context.makeRunRecord({id:`tie${index}`,standardOrder:index+1,runOrder:index+1,settings,rawResponses:[50+10*codes[0]+7*codes[1]+4*codes[2]]});
    })};
    const model=context.fitDoeRegressionModel(context.state.design,context.state.factors);
    const fittedEffects=context.computeEffects(model);
    const candidates = context.enumeratePredictionCandidates(fittedEffects,model);
    const tied = candidates.filter(candidate => Math.abs(candidate.predicted-49)<1e-9||Math.abs(candidate.predicted-51)<1e-9);
    assert.equal(tied.length, 2);
    const selected = context.selectPredictionCandidate(candidates, 'target', 50);
    assert.ok(Math.abs(selected.predicted-51)<1e-9);
    assert.equal(selected.tieCount,2);
    assert.equal(selected.equivalentCandidates.length,2);
    assert.ok(Math.abs((selected.predicted - 50) ** 2-1)<1e-9);
    return '49 and 51 tie at score=1; both retained; deterministic coded lexicographic display selects 51 (L/H/H) first';
  });

  await check('center-point-eligibility-and-midpoints', () => {
    assert.deepEqual({ ...context.centerPointSettings(continuousFactors) }, { a: '15', b: '150', c: '3' });
    const mixed = continuousFactors.map(factor => ({ ...factor }));
    mixed[1] = { id: 'b', name: 'Material', type: 'categorical', low: 'X', high: 'Y' };
    assert.equal(context.centerPointSettings(mixed), null);
    assert.equal(context.centerLevelValue({ id: 'x', type: 'numeric', low: '低温', high: '高温' }), null);
    assert.equal(context.centerLevelValue({ id: 'x', type: 'numeric', low: '10', high: '10' }), null);
    context.state.factors = [{ id: 'x', name: 'X', type: 'numeric', low: '10', high: '10' }, continuousFactors[1]];
    context.formValues.objective = 'maximize';
    context.formValues.responseTarget = '';
    assert.equal(context.validatePlan(false), false);
    return '15/150/3 generated; categorical/unparseable/equal endpoints rejected; equal endpoints fail plan validation';
  });

  await check('csv-byte-format-quoting-and-parser-round-trip', () => {
    const rows = [
      ['试验序号', '因子名称', '响应值_1', '响应值_2', '响应值_3', '目标值', '中心点', '重复试验'],
      ['1', '温度，压力', '10', '12', '14', '50', '', '是'],
      ['2', 'A,B', '20', '', '', '50', '', ''],
      ['3', '材料"A"', '30', '', '', '50', '', ''],
      ['4', '第一行\n第二行', '40', '', '', '50', '是', '']
    ];
    const csv = context.encodeCsvWithBom(rows);
    const output = path.join(ROOT, 'doe_v792_post_upgrade_audit_output.csv');
    fs.writeFileSync(output, csv, 'utf8');
    const bytes = fs.readFileSync(output);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    assert.ok(csv.includes('\r\n'));
    assert.equal((csv.match(/\r\n/g) || []).length, rows.length - 1);
    assert.ok(csv.includes('"第一行\n第二行"'), 'Quoted embedded newline was not preserved');
    assert.ok(csv.includes('"A,B"'));
    assert.ok(csv.includes('"材料""A"""'));
    const parsed = context.parseDelimitedText(csv);
    assert.equal(parsed[1][1], '温度，压力');
    assert.equal(parsed[2][1], 'A,B');
    assert.equal(parsed[3][1], '材料"A"');
    assert.equal(parsed[4][1], '第一行\n第二行');
    assert.deepEqual(Array.from(parsed[1].slice(2, 5)), ['10', '12', '14']);
    return `actual file=${output}; BOM/CRLF/comma/quote/newline/multi-response passed`;
  });

  await check('three-html-core-function-consistency', () => {
    const regions = {
      stat: source => markedBlock(source, '/\\* STAT_ENGINE_START \\*/', '/\\* STAT_ENGINE_END \\*/'),
      decision: source => markedBlock(source, '/\\* DECISION_ENGINE_START \\*/', '/\\* DECISION_ENGINE_END \\*/'),
      generation: source => sourceSlice(source, 'function validatePlan(show=true)', 'function generate()'),
      import: source => sourceSlice(source, 'function parseDelimitedText(text)', 'function importDoeCSV(file)'),
      interaction: source => sourceSlice(source, 'function calculateInteractions()', 'function renderInteractionAnalysis()'),
      i18n: source => sourceSlice(source, 'const I18N={', 'const UI_PHRASES=')
    };
    const hashes = {};
    for (const [name, select] of Object.entries(regions)) {
      hashes[name] = Object.fromEntries(FILES.map(file => [file, sha(select(htmlByFile[file]))]));
      assert.equal(new Set(Object.values(hashes[name])).size, 1, `${name} differs across HTML files`);
    }
    return Object.fromEntries(Object.entries(hashes).map(([name, values]) => [name, Object.values(values)[0]]));
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  const url = `file://${path.join(ROOT, PRODUCTION)}`;

  await check('browser-target-scenarios-a-b-d', async () => {
    const observed = {};
    for (const [name, objective, target] of [
      ['A', 'maximize', ''],
      ['B', 'minimize', ''],
      ['D', 'target', '50']
    ]) {
      await page.goto(url);
      observed[name] = await page.evaluate(({ objective, target }) => {
        loadDemo();
        document.getElementById('objective').value = objective;
        document.getElementById('responseTarget').value = target;
        state.study.target = target;
        const valid = validatePlan(false);
        generate();
        fillDemoResponses();
        analyze(false);
        return { valid, runCount: state.design?.runs?.length || 0, analyzed: state.analyzed };
      }, { objective, target });
      assert.equal(observed[name].valid, true);
      assert.ok(observed[name].runCount > 0);
      assert.equal(observed[name].analyzed, true);
    }
    return observed;
  });

  await check('browser-target-scenario-c-clear-error', async () => {
    await page.goto(url);
    await page.evaluate(() => {
      loadDemo();
      document.getElementById('objective').value = 'target';
      document.getElementById('responseTarget').value = '';
      state.study.target = '';
      state.design = null;
    });
    const dialogPromise = page.waitForEvent('dialog');
    const validationPromise = page.evaluate(() => validatePlan(true));
    const dialog = await dialogPromise;
    const message = dialog.message();
    await dialog.dismiss();
    const valid = await validationPromise;
    assert.match(message, /valid Target|有效的目标值/);
    assert.equal(valid, false);
    const generated = await page.evaluate(() => Boolean(state.design));
    assert.equal(generated, false);
    return message;
  });

  let browserRoundTrip = null;
  await check('browser-randomization-and-csv-roundtrip-content', async () => {
    await page.goto(url);
    const before = await page.evaluate(() => {
      state.lang = 'zh';
      document.getElementById('uiLanguageInput').value = 'zh';
      state.factors = [
        { id: 'a', name: '温度,压力', type: 'numeric', low: '10', high: '20' },
        { id: 'b', name: '材料"A"', type: 'numeric', low: '100', high: '200' },
        { id: 'c', name: '时间', type: 'numeric', low: '1', high: '5' }
      ];
      const combos = cartesian(state.factors.map(factor => [factor.low, factor.high]));
      const enhancement = { canEnhance: true, centerPoints: 4, independentReplicates: 4 };
      state.design = { type: 'full_factorial', runs: buildDesignRuns(combos, state.factors, enhancement) };
      const generatedReplicates=state.design.runs.filter(run=>run.runType==='replicate');
      generatedReplicates[3].settings={...state.design.runs[0].settings};
      generatedReplicates[3].replicateOf=state.design.runs[0].id;
      const initial = state.design.runs.map(run => ({ id: run.id, runType: run.runType, replicateOf: run.replicateOf, runOrder: run.runOrder }));
      const nativeRandom = Math.random;
      Math.random = () => 0;
      randomize();
      Math.random = nativeRandom;
      state.design.runs.forEach((run, index) => setRunResponses(run, [String(index + 10), String(index + 12), String(index + 14)]));
      document.getElementById('responseName').value = '响应值';
      renderRun();
      showWorkflowStep('execute', false);
      return {
        initial,
        randomized: state.design.runs.map(run => ({ id: run.id, replicateOf: run.replicateOf, runOrder: run.runOrder })),
        raw: state.design.runs.map(run => ({ id: run.id, runOrder:run.runOrder, raw: [...run.rawResponses], mean: run.responseMean, settings: { ...run.settings }, runType: run.runType, replicateOf: run.replicateOf }))
      };
    });
    const initialOrder = new Map(before.initial.map(run => [run.id, run.runOrder]));
    assert.ok(before.randomized.some(run => initialOrder.get(run.id) !== run.runOrder));
    for (const run of before.randomized.filter(run => run.replicateOf)) {
      assert.ok(before.randomized.some(source => source.id === run.replicateOf));
    }

    const runtimeMime = await page.evaluate(() => new Blob(['audit'], { type: 'text/csv;charset=utf-8;' }).type);
    assert.equal(runtimeMime, 'text/csv;charset=utf-8;');
    assert.ok(html.includes("new Blob([csv],{type:'text/csv;charset=utf-8;'})"));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadDoeTemplateBtn')
    ]);
    const downloadPath = await download.path();
    const csvBytes = fs.readFileSync(downloadPath);
    assert.deepEqual([...csvBytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    const csvText = csvBytes.toString('utf8');
    assert.ok(csvText.includes('\r\n'));
    const reversedCsvText=await page.evaluate(text=>{
      const rows=parseDelimitedText(text);
      return encodeCsvWithBom([rows[0],...rows.slice(1).reverse()]);
    },csvText);
    await page.evaluate(text => startImportPreview(parseDelimitedText(text), 'audit-roundtrip-reversed.csv'), reversedCsvText);
    await page.click('#confirmImportMappingBtn');
    const after = await page.evaluate(() => state.design.runs.map(run => ({
      id: run.id,
      runOrder:run.runOrder,
      replicateOf: run.replicateOf,
      runType: run.runType,
      settings: { ...run.settings },
      raw: [...run.rawResponses],
      mean: run.responseMean
    })));
    assert.equal(after.length, 16);
    assert.equal(new Set(after.map(run => run.id)).size, 16);
    assert.equal(after.filter(run => run.runType === 'replicate').length, 4);
    const byOrder=list=>[...list].sort((a,b)=>a.runOrder-b.runOrder);
    const beforeSorted=byOrder(before.raw),afterSorted=byOrder(after);
    assert.deepEqual(afterSorted.map(run => run.raw), beforeSorted.map(run => run.raw));
    assert.deepEqual(afterSorted.map(run => run.mean), beforeSorted.map(run => run.mean));
    assert.deepEqual(afterSorted.map(run => run.settings), beforeSorted.map(run => run.settings));
    browserRoundTrip = { before, after, downloadPath, csvText:reversedCsvText };
    return { downloadPath, rows: after.length, replicates: 4, reversedRows:true, multipleReplicatesForOneSource:true, mime: 'text/csv;charset=utf-8;' };
  });

  await check('browser-replicate-relationship-restored-after-import', () => {
    assert.ok(browserRoundTrip, 'CSV round trip did not complete');
    const ids = new Set(browserRoundTrip.after.map(run => run.id));
    const missing = browserRoundTrip.after
      .filter(run => run.runType === 'replicate' && !ids.has(run.replicateOf))
      .map(run => `${run.id}->${run.replicateOf}`);
    assert.deepEqual(missing, [], `Broken imported replicateOf references: ${missing.join(', ')}`);
    return 'all imported replicateOf values identify imported source runs';
  });

  await check('browser-invalid-replicate-reference-warns-without-dangling-id', async()=>{
    const invalidCsv=await page.evaluate(text=>{
      const rows=parseDelimitedText(text);
      const relationIndex=rows[0].findIndex(value=>normalizeHeader(value)===normalizeHeader('重复来源'));
      const row=rows.slice(1).find(item=>String(item[relationIndex]||'').trim());
      row[relationIndex]='missing_source';
      return encodeCsvWithBom(rows);
    },browserRoundTrip.csvText);
    await page.evaluate(text=>startImportPreview(parseDelimitedText(text),'audit-invalid-relation.csv'),invalidCsv);
    await page.click('#confirmImportMappingBtn');
    const result=await page.evaluate(()=>{
      const ids=new Set(state.design.runs.map(run=>run.id));
      return {
        dangling:state.design.runs.filter(run=>run.replicateOf&&!ids.has(run.replicateOf)).map(run=>run.replicateOf),
        nullReplicates:state.design.runs.filter(run=>run.runType==='replicate'&&run.replicateOf==null).length,
        warning:document.getElementById('importStatus').textContent
      };
    });
    assert.deepEqual(result.dangling,[]);
    assert.ok(result.nullReplicates>=1);
    assert.match(result.warning,/无法恢复|could not be restored/);
    return result;
  });

  await browser.close();
  await check('browser-runtime-diagnostics', () => {
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    return { consoleErrors, pageErrors };
  });

  notes.push('ANOVA pure error is computed from dispersion of run means within identical factor-setting groups.');
  notes.push('Within-run responseStdDev is displayed but is not used by ANOVA, regression, prediction, or recommendation.');
  notes.push('Independent replicate run means and repeated center-point run means both contribute to the pure-error grouping when settings are identical.');
  notes.push('A lack-of-fit/interactions SS and df partition is reported, but no formal lack-of-fit F test or p-value is calculated.');
  notes.push('No explicit curvature test is implemented.');
  notes.push('Target ties are retained within numeric tolerance; coded lexicographic order is used only for deterministic first-card display.');

  const report = { production: PRODUCTION, results, failures, notes };
  fs.writeFileSync(path.join(ROOT, 'doe_v792_post_upgrade_audit_results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch(error => {
  console.error('DOE post-upgrade audit failed unexpectedly');
  console.error(error);
  process.exitCode = 1;
});
