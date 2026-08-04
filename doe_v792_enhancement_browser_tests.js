const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE Engineering Decision Support Tool V7.9.2.html';
const targetUrl = `file://${path.resolve(targetFile)}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');
  await page.selectOption('#uiLanguageInput', 'en');

  // Approach Target must be blocked when Target is missing.
  await page.fill('#responseTarget', '');
  await page.selectOption('#objective', 'target');
  let targetDialog = '';
  page.once('dialog', async dialog => {
    targetDialog = dialog.message();
    await dialog.dismiss();
  });
  await page.click('#generateBtn');
  assert.match(targetDialog, /requires a valid Target/);

  // 3 continuous factors + 16-run budget exposes an optional enhanced plan.
  await page.fill('#responseTarget', '50');
  await page.evaluate(() => showWorkflowStep('strategy', false));
  await page.fill('#strategyFactorCount', '3');
  await page.selectOption('#strategyFactorType', 'continuous');
  await page.selectOption('#strategyKnowledge', 'high');
  await page.selectOption('#strategyObjective', 'optimization');
  await page.fill('#availableRuns', '16');
  await page.fill('#timeConstraint', '20');
  await page.fill('#sampleAvailability', '32');
  await page.click('#assessStrategyBtn');
  const enhancementSummary = await page.locator('#designEnhancementSummary').innerText();
  assert.match(enhancementSummary, /Base design: 8 full-factorial runs/);
  assert.match(enhancementSummary, /Remaining budget: 8 runs/);
  assert.match(enhancementSummary, /4 center point/);
  assert.match(enhancementSummary, /4 independent replicate/);
  await page.selectOption('#designPlanMode', 'enhanced');
  await page.click('#acceptStrategyBtn');

  const designSummary = await page.evaluate(() => ({
    runCount: state.design.runs.length,
    factorial: state.design.runs.filter(run => run.runType === 'factorial').length,
    center: state.design.runs.filter(run => run.runType === 'center').length,
    replicate: state.design.runs.filter(run => run.runType === 'replicate').length
  }));
  assert.deepStrictEqual(designSummary, { runCount: 16, factorial: 8, center: 4, replicate: 4 });

  // Multiple measurements remain within one run and the run mean is modeled.
  await page.evaluate(() => showWorkflowStep('execute', false));
  await page.click('#fillResponsesBtn');
  const firstRunId = await page.evaluate(() => [...state.design.runs].sort((a, b) => a.runOrder - b.runOrder)[0].id);
  const firstInput = page.locator(`[data-response-run="${firstRunId}"][data-response-index="0"]`);
  await firstInput.fill('10');
  await page.click(`[data-add-response="${firstRunId}"]`);
  await page.locator(`[data-response-run="${firstRunId}"][data-response-index="1"]`).fill('12');
  await page.click(`[data-add-response="${firstRunId}"]`);
  await page.locator(`[data-response-run="${firstRunId}"][data-response-index="2"]`).fill('14');
  await page.click('#analyzeBtn');

  const responseAndDecision = await page.evaluate(runId => {
    const run = state.design.runs.find(item => item.id === runId);
    const effects = computeEffects();
    const candidates = enumeratePredictionCandidates(effects);
    const selected = selectPredictionCandidate(candidates, 'target', 50);
    return {
      count: run.responseCount,
      mean: run.responseMean,
      stdDev: run.responseStdDev,
      range: run.responseRange,
      modelResponse: run.response,
      decisionPredicted: state.decision.predicted,
      expectedPredicted: selected.predicted,
      decisionTarget: state.decision.target,
      decisionDeviation: state.decision.deviation
    };
  }, firstRunId);
  assert.strictEqual(responseAndDecision.count, 3);
  assert.strictEqual(responseAndDecision.mean, 12);
  assert.strictEqual(responseAndDecision.stdDev, 2);
  assert.strictEqual(responseAndDecision.range, 4);
  assert.strictEqual(responseAndDecision.modelResponse, 12);
  assert.strictEqual(responseAndDecision.decisionPredicted, responseAndDecision.expectedPredicted);
  assert.strictEqual(responseAndDecision.decisionTarget, 50);
  assert.strictEqual(responseAndDecision.decisionDeviation, responseAndDecision.decisionPredicted - 50);
  assert.match(await page.locator('#runResponseSummary').innerText(), /Model Response/);
  assert.match(await page.locator('#recommendText').innerText(), /minimizes squared target deviation/);

  // The actual downloaded CSV has a UTF-8 BOM, Chinese headers, and round-trips all raw measurements.
  await page.selectOption('#uiLanguageInput', 'zh');
  await page.evaluate(() => showWorkflowStep('execute', false));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#downloadDoeTemplateBtn')
  ]);
  const csvBuffer = fs.readFileSync(await download.path());
  assert.strictEqual(csvBuffer[0], 0xEF);
  assert.strictEqual(csvBuffer[1], 0xBB);
  assert.strictEqual(csvBuffer[2], 0xBF);
  const csvText = csvBuffer.toString('utf8');
  ['试验序号', '因子名称', '响应值_1', '目标值', '中心点', '重复试验'].forEach(label => {
    assert(csvText.includes(label), `Downloaded CSV is missing ${label}`);
  });
  await page.evaluate(text => startImportPreview(parseDelimitedText(text), 'roundtrip.csv'), csvText);
  await page.click('#confirmImportMappingBtn');
  const roundTrip = await page.evaluate(() => {
    const run = [...state.design.runs].sort((a, b) => a.runOrder - b.runOrder)[0];
    return { rawResponses: run.rawResponses, count: run.responseCount, mean: run.responseMean, stdDev: run.responseStdDev, range: run.responseRange };
  });
  assert.deepStrictEqual(roundTrip.rawResponses.map(String), ['10', '12', '14']);
  assert.deepStrictEqual({ count: roundTrip.count, mean: roundTrip.mean, stdDev: roundTrip.stdDev, range: roundTrip.range }, { count: 3, mean: 12, stdDev: 2, range: 4 });

  assert.deepStrictEqual(consoleErrors, []);
  assert.deepStrictEqual(pageErrors, []);
  await browser.close();
  console.log(`DOE enhanced design and multi-response browser tests passed for ${targetFile}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
