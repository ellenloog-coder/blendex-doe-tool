const fs = require('fs');
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');

assert(html.includes('doe-main-effect-card'), 'Main effects chart should use DOE-specific chart card styling');
assert(html.includes('function doeLevelLabels()'), 'Main effects chart should use localized/coded level labels');
assert(html.includes("state.lang==='zh'?['-1','+1']:['Low','High']"), 'Chinese mode should avoid English Low/High plot labels');
assert(html.includes('function drawMainEffects(effects,canvasId='), 'Main effects renderer should exist');
assert(html.includes('overallMean'), 'Main effects plot should include an overall mean reference label');
assert(html.includes('Math.ceil(effects.length/cols)'), 'Main effects plot should create independent mini panels');
assert(html.includes('function drawRanking(effects,canvasId='), 'Pareto effect renderer should exist');
assert(html.includes("rankChart:'Pareto Effect Chart'"), 'English ranking title should be Pareto Effect Chart');
assert(html.includes("rankChart:'帕累托效应图'"), 'Chinese ranking title should be localized');
assert(html.includes('p<=0.05'), 'Pareto chart should use existing ANOVA p-value support for reference line when available');

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
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', error => { throw error; });
  await page.goto(`file://${path.resolve(targetFile)}`);
  await page.waitForLoadState('domcontentloaded');
  await page.selectOption('#uiLanguageInput', 'en');
  await page.selectOption('#exampleStudySelect', 'optimization');
  await page.waitForTimeout(300);

  assert.strictEqual(await page.$eval('#mainEffectsChartTitle', el => el.textContent.trim()), 'Main Effects Plot');
  assert.strictEqual(await page.$eval('#rankingChartTitle', el => el.textContent.trim()), 'Pareto Effect Chart');
  assert(await canvasHasInk(page, '#mainEffectsChart'), 'Main effects canvas should render a nonblank DOE plot');
  assert(await canvasHasInk(page, '#rankingChart'), 'Pareto effect canvas should render a nonblank DOE plot');

  await page.selectOption('#uiLanguageInput', 'zh');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.$eval('#rankingChartTitle', el => el.textContent.trim()), '帕累托效应图');

  await browser.close();
  console.log('DOE V7.9.1 DOE plot visualization tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
