const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const targetUrl = `file://${path.resolve(targetFile)}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  await page.selectOption('#uiLanguageInput', 'zh');
  await page.selectOption('#exampleStudySelect', 'optimization');
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    showWorkflowStep('strategy', false);
    await getExpertRecommendation();
    showWorkflowStep('analyze', false);
    showResultTab('report');
  });
  await page.waitForTimeout(300);

  const zhText = await page.evaluate(() => [
    document.querySelector('#modelLayerBody')?.textContent || '',
    document.querySelector('#decisionLayerBody')?.textContent || '',
    document.querySelector('#expertRecommendationCard')?.innerText || '',
    document.querySelector('#evidencePackage')?.innerText || ''
  ].join('\n'));
  ['Failed to fetch', 'HTTP 500', 'API detail', 'action(s)', 'Model Basis:', 'Predicted Response:', 'Decision Status:'].forEach(token => {
    assert(!zhText.includes(token), `Chinese mode should not expose raw English/API text: ${token}`);
  });
  ['模型依据：', '预测响应：', '决策状态：', '项行动', '专家推荐服务暂时不可用'].forEach(token => {
    assert(zhText.includes(token), `Chinese mode should show localized dynamic text: ${token}`);
  });

  await page.selectOption('#uiLanguageInput', 'en');
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    showWorkflowStep('strategy', false);
    await getExpertRecommendation();
  });
  const enText = await page.evaluate(() => document.body.innerText);
  assert(!enText.includes('action(s)'), 'English mode should use pluralized action text, not action(s)');
  assert(!/[\u4e00-\u9fff]/.test(await page.$eval('#expertRecommendationCard', el => el.innerText)), 'English expert recommendation card should not include Chinese text');

  await browser.close();
  console.log('DOE V7.9.1 dynamic i18n leakage tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
