const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const targetUrl = `file://${path.resolve(targetFile)}`;

async function audit(page, lang, label) {
  const issues = await page.evaluate((currentLang) => auditVisibleLanguage(currentLang), lang);
  assert.deepStrictEqual(issues, [], `${label} ${lang} audit issues: ${JSON.stringify(issues.slice(0, 8), null, 2)}`);
}

async function setLanguage(page, lang) {
  await page.selectOption('#uiLanguageInput', lang);
  await page.waitForTimeout(120);
}

async function scanSteps(page, lang, label) {
  for (const step of ['define', 'strategy', 'design', 'execute', 'analyze']) {
    await page.evaluate((targetStep) => showWorkflowStep(targetStep, false), step);
    await page.waitForTimeout(80);
    await audit(page, lang, `${label}:${step}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await page.route('**/recommend-design', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      design_type: 'screening_doe',
      display_name: 'Screening DOE',
      engineering_reason: 'Too many factors for full factorial.',
      decision_status: 'RECOMMENDED',
      warnings: ['Review recommended design before generating DOE.'],
      next_actions: ['Confirm critical factors before optimization or implementation.'],
      trace: { rule_id: 'R-SCREEN-001', rule_source: 'knowledge_base', fallback_reason: 'NOT AVAILABLE' },
      engine_version: 'v1.0',
      backbone_version: 'v1.0',
      generator_version: 'v1.0',
      log_record: { timestamp: '2026-07-20T00:00:00.000Z' }
    })
  }));
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  for (const lang of ['zh', 'en']) {
    await setLanguage(page, lang);
    await scanSteps(page, lang, 'fresh');
  }

  for (const lang of ['zh', 'en']) {
    for (const study of ['optimization', 'screening', 'rootcause', 'robustness']) {
      await setLanguage(page, lang);
      await page.selectOption('#exampleStudySelect', study);
      await page.waitForTimeout(250);
      await page.evaluate(async () => {
        showWorkflowStep('strategy', false);
        assessStrategy();
        await getExpertRecommendation();
        acceptExpertStrategy();
        showWorkflowStep('design', false);
        randomize();
        showWorkflowStep('execute', false);
        validateDOEData(true);
        startImportPreview([
          ['Run Order', 'Std. Order', ...state.factors.map(f => f.name), document.getElementById('responseName').value || 'Response'],
          ...state.design.runs.map(r => [r.runOrder, r.standardOrder, ...state.factors.map(f => r.settings[f.id]), r.response])
        ], 'audit.csv');
        applyImportMapping();
        analyze(false);
        showWorkflowStep('analyze', false);
        for (const tab of ['evidence', 'trust', 'decision', 'report']) {
          showResultTab(tab);
        }
        document.getElementById('confirmationActual').value = document.getElementById('confirmationPredicted').value || '1';
        updateConfirmationDecision();
        document.getElementById('baselineMean').value = '10';
        document.getElementById('baselineStd').value = '1.5';
        document.getElementById('baselineN').value = '30';
        document.getElementById('improvedMean').value = '12';
        document.getElementById('improvedStd').value = '1.0';
        document.getElementById('improvedN').value = '30';
        updateImprovementVerification(false);
        showResultTab('report');
      });
      await page.waitForTimeout(250);
      await scanSteps(page, lang, `${study}`);
    }
  }

  await page.unroute('**/recommend-design');
  await setLanguage(page, 'zh');
  await page.selectOption('#exampleStudySelect', 'screening');
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    showWorkflowStep('strategy', false);
    await getExpertRecommendation();
  });
  await audit(page, 'zh', 'expert-fallback');

  await setLanguage(page, 'en');
  await page.evaluate(() => showWorkflowStep('strategy', false));
  await audit(page, 'en', 'expert-fallback');

  await browser.close();
  console.log('DOE V7.9.1 full language audit tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
