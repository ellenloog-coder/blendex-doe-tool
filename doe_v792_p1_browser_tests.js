const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE Engineering Decision Support Tool V7.9.2.html';
const targetUrl = `file://${path.resolve(targetFile)}`;
const scenarioFilter = process.env.DOE_TEST_SCENARIO || '';

const validCsv = [
  'Run,Std. Order,Temperature,Pressure,Dwell Time,Seal Strength',
  '1,1,160°C,2.0 bar,0.8 s,31',
  '2,2,160°C,2.0 bar,1.2 s,32',
  '3,3,160°C,3.0 bar,0.8 s,33',
  '4,4,160°C,3.0 bar,1.2 s,34',
  '5,5,180°C,2.0 bar,0.8 s,35',
  '6,6,180°C,2.0 bar,1.2 s,36',
  '7,7,180°C,3.0 bar,0.8 s,37',
  '8,8,180°C,3.0 bar,1.2 s,38'
].join('\n');

async function newPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const diagnostics = { consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [] };
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
    if (message.type() === 'warning') diagnostics.consoleWarnings.push(message.text());
  });
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', request => diagnostics.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim()));
  await page.addInitScript(() => {
    window.__doePrintCalled = false;
    window.print = () => { window.__doePrintCalled = true; };
  });
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');
  return { page, diagnostics };
}

async function selectStep(page, step) {
  await page.locator(`[data-step-nav="${step}"]`).click();
}

async function layoutMetrics(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
}

async function assertNoDocumentOverflow(page, label) {
  const metrics = await layoutMetrics(page);
  assert(metrics.scrollWidth <= metrics.clientWidth + 1, `${label}: document overflow ${metrics.scrollWidth} > ${metrics.clientWidth}`);
  return metrics;
}

async function runCoreFlow(page, lang, exampleId, label, exerciseInvalidation = false) {
  const stages = {};
  console.log(`  core ${lang} select language`);
  await page.selectOption('#uiLanguageInput', lang);
  stages.language = await assertNoDocumentOverflow(page, `${label} language`);
  console.log(`  core ${lang} load example`);
  await page.selectOption('#exampleStudySelect', exampleId);
  stages.demo = await assertNoDocumentOverflow(page, `${label} demo`);
  console.log(`  core ${lang} define`);
  await selectStep(page, 'define');
  console.log(`  core ${lang} generate`);
  await page.locator('#generateBtn').click();
  stages.generated = await assertNoDocumentOverflow(page, `${label} generated`);
  console.log(`  core ${lang} execute`);
  await selectStep(page, 'execute');
  console.log(`  core ${lang} fill`);
  await page.locator('#fillResponsesBtn').click();
  stages.responses = await assertNoDocumentOverflow(page, `${label} responses`);
  console.log(`  core ${lang} analyze`);
  await page.locator('#analyzeBtn').click();
  stages.analysis = await assertNoDocumentOverflow(page, `${label} analysis`);
  console.log(`  core ${lang} results`);
  await selectStep(page, 'analyze');
  await page.locator('[data-result-tab-button="report"]').click();
  console.log(`  core ${lang} report`);
  stages.report = await assertNoDocumentOverflow(page, `${label} report`);
  const reportText = await page.locator('#studyReportBody').innerText();
  assert(reportText.trim().length > 0);
  if (lang === 'en') assert(!/[\u4e00-\u9fff]/.test(reportText), `${label}: Chinese text leaked into English report`);
  if (exerciseInvalidation) {
    await page.locator('[data-result-tab-button="evidence"]').click();
    await selectStep(page, 'execute');
    const firstResponse = page.locator('input[data-response]').first();
    await firstResponse.fill(String(Number(await firstResponse.inputValue()) + 1));
    assert.strictEqual((await page.locator('#analysisStatus').innerText()).trim(), lang === 'zh' ? '未分析' : 'Not analyzed');
    stages.invalidated = await assertNoDocumentOverflow(page, `${label} invalidated`);
    await page.locator('#analyzeBtn').click();
    assert.strictEqual((await page.locator('#analysisStatus').innerText()).trim(), lang === 'zh' ? '分析完成' : 'Analysis complete');
    await selectStep(page, 'analyze');
    await page.locator('[data-result-tab-button="report"]').click();
    stages.reanalyzed = await assertNoDocumentOverflow(page, `${label} reanalyzed`);
  }
  return stages;
}

async function prepareCsvPage(page, lang) {
  await page.selectOption('#uiLanguageInput', lang);
  await selectStep(page, 'define');
  await page.locator('#generateBtn').click();
  await selectStep(page, 'execute');
}

async function importCsv(page, name, content) {
  await page.locator('#doeCsvInput').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content)
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const summary = { responsive: {}, csv: {}, diagnostics: [] };

  for (const spec of [
    { name: 'mobile-zh', viewport: { width: 390, height: 844 }, lang: 'zh', example: 'optimization' },
    { name: 'mobile-en', viewport: { width: 390, height: 844 }, lang: 'en', example: 'robustness' },
    { name: 'tablet', viewport: { width: 768, height: 1024 }, lang: 'en', example: 'optimization' },
    { name: 'desktop', viewport: { width: 1440, height: 900 }, lang: 'en', example: 'optimization' }
  ].filter(spec => !scenarioFilter || scenarioFilter === spec.name)) {
    console.log(`START ${spec.name}`);
    const { page, diagnostics } = await newPage(browser, spec.viewport);
    const initial = await assertNoDocumentOverflow(page, `${spec.name} initial`);
    const stages = await runCoreFlow(page, spec.lang, spec.example, spec.name, spec.name === 'mobile-zh');
    stages.initial = initial;
    await page.locator('#printBtn').click();
    assert.strictEqual(await page.evaluate(() => window.__doePrintCalled), true);
    summary.responsive[spec.name] = stages;
    console.log(`PASS ${spec.name}`);
    summary.diagnostics.push({ scenario: spec.name, ...diagnostics });
    await page.close();
  }

  if (!scenarioFilter || scenarioFilter === 'csv-zh') {
    console.log('START csv-zh');
    const { page, diagnostics } = await newPage(browser, { width: 390, height: 844 });
    await prepareCsvPage(page, 'zh');
    const cases = [
      ['empty', '', '导入失败：文件为空。'],
      ['header-only', 'Run,Std. Order,Temperature,Pressure,Dwell Time,Seal Strength', '文件只有表头，没有数据行'],
      ['missing-column', validCsv.replace(',Seal Strength', ''), '缺少必要列“Seal Strength”'],
      ['required-empty', validCsv.replace('31', ''), '第 2 行的“Seal Strength”不能为空'],
      ['non-numeric', validCsv.replace('31', 'not-a-number'), '第 2 行的“Seal Strength”必须是数字'],
      ['row-structure', validCsv.replace('1,1,160°C,2.0 bar,0.8 s,31', '1,1,160°C,2.0 bar,31'), '第 2 行的列数与表头不一致'],
      ['wrong-row-count', validCsv.split('\n').slice(0, -1).join('\n'), '当前 DOE 需要 8 行数据，实际检测到 7 行']
    ];
    for (const [name, content, expected] of cases) {
      await importCsv(page, `${name}.csv`, content);
      const message = await page.locator('#importStatus').innerText();
      assert(message.includes(expected), `${name}: ${message}`);
      assert(message.includes('重新导入') && message.includes('CSV 模板'), `${name}: recovery guidance missing`);
      assert(await page.locator('input[data-response]').evaluateAll(inputs => inputs.every(input => input.value === '')), `${name}: invalid import polluted responses`);
      summary.csv[`zh-${name}`] = message;
      console.log(`PASS csv-zh-${name}`);
    }
    await importCsv(page, 'valid-zh.csv', validCsv);
    assert.strictEqual(await page.locator('#importMappingPanel').isVisible(), true);
    await page.locator('#confirmImportMappingBtn').click();
    const success = await page.locator('#importStatus').innerText();
    assert(success.includes('验证通过'));
    const importedValues = await page.locator('input[data-response]').evaluateAll(inputs => inputs.map(input => input.value));
    assert.deepStrictEqual(importedValues, ['31', '32', '33', '34', '35', '36', '37', '38']);
    await page.locator('#analyzeBtn').click();
    assert.strictEqual((await page.locator('#analysisStatus').innerText()).trim(), '分析完成');
    summary.csv['zh-valid-recovery'] = success;
    console.log('PASS csv-zh-valid-recovery');
    await importCsv(page, 'invalid-after-valid-zh.csv', validCsv.replace('31', 'not-a-number'));
    assert.deepStrictEqual(await page.locator('input[data-response]').evaluateAll(inputs => inputs.map(input => input.value)), importedValues);
    assert.strictEqual((await page.locator('#analysisStatus').innerText()).trim(), '分析完成');
    console.log('PASS csv-zh-invalid-preserves-valid-state');
    await page.selectOption('#uiLanguageInput', 'en');
    await importCsv(page, 'invalid-after-language-switch.csv', validCsv.replace('31', 'not-a-number'));
    const switchedMessage = await page.locator('#importStatus').innerText();
    assert(switchedMessage.includes('must be numeric') && !/[\u4e00-\u9fff]/.test(switchedMessage));
    assert.deepStrictEqual(await page.locator('input[data-response]').evaluateAll(inputs => inputs.map(input => input.value)), importedValues);
    summary.csv['language-switch-retry'] = switchedMessage;
    console.log('PASS csv-language-switch-retry');
    summary.diagnostics.push({ scenario: 'csv-zh', ...diagnostics });
    await page.close();
  }

  if (!scenarioFilter || scenarioFilter === 'csv-en') {
    console.log('START csv-en');
    const { page, diagnostics } = await newPage(browser, { width: 390, height: 844 });
    await prepareCsvPage(page, 'en');
    const cases = [
      ['empty', '', 'the file is empty'],
      ['header-only', 'Run,Std. Order,Temperature,Pressure,Dwell Time,Seal Strength', 'the file contains a header but no data rows'],
      ['missing-column', validCsv.replace(',Seal Strength', ''), 'required column(s) “Seal Strength” are missing'],
      ['required-empty', validCsv.replace('31', ''), '“Seal Strength” in row 2 is required'],
      ['non-numeric', validCsv.replace('31', 'not-a-number'), '“Seal Strength” in row 2 must be numeric'],
      ['row-structure', validCsv.replace('1,1,160°C,2.0 bar,0.8 s,31', '1,1,160°C,2.0 bar,31'), 'row 2 does not match the header structure'],
      ['wrong-row-count', validCsv.split('\n').slice(0, -1).join('\n'), 'current DOE requires 8 data rows, but 7 were detected']
    ];
    for (const [name, content, expected] of cases) {
      await importCsv(page, `${name}.csv`, content);
      const message = await page.locator('#importStatus').innerText();
      assert(message.includes(expected), `${name}: ${message}`);
      assert(!/[\u4e00-\u9fff]/.test(message), `${name}: Chinese text leaked into English message`);
      assert(/import (?:it|the file) again/.test(message) && message.includes('CSV template'), `${name}: recovery guidance missing`);
      assert(await page.locator('input[data-response]').evaluateAll(inputs => inputs.every(input => input.value === '')), `${name}: invalid import polluted responses`);
      summary.csv[`en-${name}`] = message;
      console.log(`PASS csv-en-${name}`);
    }
    await importCsv(page, 'valid-en.csv', validCsv);
    assert.strictEqual(await page.locator('#importMappingPanel').isVisible(), true);
    await page.locator('#confirmImportMappingBtn').click();
    const success = await page.locator('#importStatus').innerText();
    assert(success.includes('Validation passed'));
    const importedValues = await page.locator('input[data-response]').evaluateAll(inputs => inputs.map(input => input.value));
    assert.deepStrictEqual(importedValues, ['31', '32', '33', '34', '35', '36', '37', '38']);
    await page.locator('#analyzeBtn').click();
    assert.strictEqual((await page.locator('#analysisStatus').innerText()).trim().toLowerCase(), 'analysis complete');
    summary.csv['en-valid-recovery'] = success;
    console.log('PASS csv-en-valid-recovery');
    await importCsv(page, 'invalid-after-valid-en.csv', validCsv.replace('31', 'not-a-number'));
    assert.deepStrictEqual(await page.locator('input[data-response]').evaluateAll(inputs => inputs.map(input => input.value)), importedValues);
    assert.strictEqual((await page.locator('#analysisStatus').innerText()).trim().toLowerCase(), 'analysis complete');
    console.log('PASS csv-en-invalid-preserves-valid-state');
    summary.diagnostics.push({ scenario: 'csv-en', ...diagnostics });
    await page.close();
  }

  summary.diagnostics.forEach(item => {
    assert.deepStrictEqual(item.consoleErrors, [], `${item.scenario}: console errors`);
    assert.deepStrictEqual(item.pageErrors, [], `${item.scenario}: page errors`);
    assert.deepStrictEqual(item.failedRequests, [], `${item.scenario}: failed requests`);
  });
  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
