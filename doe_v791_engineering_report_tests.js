const fs = require('fs');
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');

[
  'reportExecutiveSummaryBody',
  'reportMainEffectsChart',
  'reportRankingChart',
  'reportInteractionBody',
  'reportInteractionPlot',
  'reportConfirmationPlanBody',
  'reportMethodNotesBody'
].forEach(id => assert(html.includes(`id="${id}"`), `Missing report element: ${id}`));

[
  'Executive Summary',
  'Experimental Design Summary',
  'Measured Results',
  'Main Effects Analysis',
  'Effect Ranking',
  'Statistical Evidence / ANOVA',
  'Interaction Analysis',
  'Engineering Recommendation',
  'Confirmation Plan',
  'Method Notes'
].forEach(heading => assert(html.includes(heading), `Missing engineering report heading: ${heading}`));

assert(html.includes('.report-keep,.report-chart-block{break-inside:avoid;page-break-inside:avoid}'), 'Print CSS should keep report chart title and chart together');
assert(html.includes('renderReportInteractionSection();'), 'Report should render interaction analysis section');
assert(html.includes("drawMainEffects(effects,'reportMainEffectsChart')"), 'Report should reuse DOE main effects visualization');
assert(html.includes("drawRanking(effects,'reportRankingChart')"), 'Report should reuse DOE Pareto visualization');
assert(html.includes("drawInteractionPlot(top,'reportInteractionPlot')"), 'Report should render interaction plot with legend');

async function canvasHasInk(page, selector) {
  return page.$eval(selector, canvas => {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a && !(r > 248 && g > 248 && b > 248)) nonWhite++;
      if (nonWhite > 500) return true;
    }
    return false;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  await page.goto(`file://${path.resolve(targetFile)}`);
  await page.waitForLoadState('domcontentloaded');
  await page.selectOption('#uiLanguageInput', 'en');
  await page.selectOption('#exampleStudySelect', 'optimization');
  await page.evaluate(() => {
    showWorkflowStep('analyze', false);
    showResultTab('report');
  });
  await page.waitForTimeout(300);

  const headings = await page.$$eval('#evidencePackage .report-section h3', nodes => nodes.map(node => node.textContent.trim()));
  assert.deepStrictEqual(headings.slice(0, 10), [
    'Executive Summary',
    'Experimental Design Summary',
    'Measured Results',
    'Main Effects Analysis',
    'Effect Ranking',
    'Statistical Evidence / ANOVA',
    'Interaction Analysis',
    'Engineering Recommendation',
    'Confirmation Plan',
    'Method Notes'
  ], 'Report sections should follow engineering DOE report flow');

  const executive = await page.$eval('#reportExecutiveSummaryBody', el => el.innerText);
  ['Study Objective', 'Response', 'Optimization Direction', 'Best Observed Run', 'Dominant Factor', 'Evidence Level', 'Engineering Decision Status', 'Recommended Next Action'].forEach(text => {
    assert(executive.includes(text), `Executive summary should include ${text}`);
  });
  const confirmation = await page.$eval('#reportConfirmationPlanBody', el => el.innerText);
  ['Recommended Settings', 'Predicted Response', 'Validation Purpose', 'Acceptance Criteria', 'Required Evidence'].forEach(text => {
    assert(confirmation.includes(text), `Confirmation plan should include ${text}`);
  });
  const method = await page.$eval('#reportMethodNotesBody', el => el.innerText);
  ['DOE Design Type', 'Model Type', 'Replication Status', 'Statistical Limitations'].forEach(text => {
    assert(method.includes(text), `Method notes should include ${text}`);
  });

  assert(await canvasHasInk(page, '#reportMainEffectsChart'), 'Report main effects plot should render');
  assert(await canvasHasInk(page, '#reportRankingChart'), 'Report Pareto chart should render');
  assert(await canvasHasInk(page, '#reportInteractionPlot'), 'Report interaction plot should render');

  await browser.close();
  console.log('DOE V7.9.1 engineering report tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
