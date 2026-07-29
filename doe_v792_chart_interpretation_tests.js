const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const targetUrl = `file://${path.resolve(targetFile)}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  await page.selectOption('#uiLanguageInput', 'en');
  await page.selectOption('#exampleStudySelect', 'optimization');
  await page.waitForTimeout(300);
  await page.evaluate(() => showWorkflowStep('analyze', false));

  const guided = await page.evaluate(() => ({
    main: document.querySelector('#mainEffectsInterpretationCard')?.innerText || '',
    pareto: document.querySelector('#paretoInterpretationCard')?.innerText || '',
    interaction: document.querySelector('#interactionInterpretationCard')?.innerText || '',
    reportMain: document.querySelector('#reportMainEffectsInterpretation')?.innerText || '',
    reportPareto: document.querySelector('#reportParetoInterpretation')?.innerText || '',
    reportInteraction: document.querySelector('#reportInteractionInterpretation')?.innerText || '',
    stateMode: state.displayMode,
    objective: document.querySelector('#objective').value
  }));

  assert(guided.main.includes('Main Effects Interpretation'), 'Main Effects chart should have its own interpretation card');
  assert(guided.pareto.includes('Pareto Interpretation'), 'Pareto chart should have its own interpretation card');
  assert(guided.interaction.includes('Interaction Interpretation'), 'Interaction chart should have its own interpretation card');
  assert(guided.main.includes('candidate setting for confirmation'), 'Main Effects interpretation should discuss objective-aware preferred level');
  assert(guided.pareto.includes('ranks first'), 'Pareto interpretation should discuss ranking');
  assert(guided.pareto.includes('absolute'), 'Pareto interpretation should discuss effect magnitude');
  assert.notStrictEqual(guided.main, guided.pareto, 'Main Effects and Pareto interpretations must use different text');
  assert(!guided.main.includes('statistically significant'), 'Guided mode should not make unsupported significance claims');
  assert(guided.reportMain.includes('Main Effects Interpretation'), 'Report should include Main Effects interpretation next to chart');
  assert(guided.reportPareto.includes('Pareto Interpretation'), 'Report should include Pareto interpretation next to chart');
  assert(guided.reportInteraction.includes('Interaction Interpretation'), 'Report should include Interaction interpretation next to chart');

  await page.selectOption('#displayModeInput', 'expert');
  await page.waitForTimeout(100);
  const expert = await page.evaluate(() => ({
    main: document.querySelector('#mainEffectsInterpretationCard')?.innerText || '',
    pareto: document.querySelector('#paretoInterpretationCard')?.innerText || '',
    stateMode: state.displayMode,
    largest: document.querySelector('#largestV')?.textContent || '',
    factors: state.factors.map(f => f.name).join('|')
  }));
  assert.strictEqual(expert.stateMode, 'expert', 'Expert mode should be stored in state');
  assert(expert.main.includes('SUPPORTING METRICS'), 'Expert mode should show supporting metrics');
  assert(expert.main.includes('Low Mean'), 'Expert mode should expose Low Mean');
  assert(expert.main.includes('p-value'), 'Expert mode should expose p-value availability');
  assert(expert.pareto.includes('SUPPORTING METRICS'), 'Pareto expert mode should show supporting metrics');

  await page.evaluate(() => {
    document.querySelector('#objective').value = 'maximize';
    analyze(false);
  });
  await page.waitForTimeout(150);
  const maximizeText = await page.$eval('#mainEffectsInterpretationCard', el => el.innerText);
  await page.evaluate(() => {
    document.querySelector('#objective').value = 'minimize';
    analyze(false);
  });
  await page.waitForTimeout(150);
  const minimizeText = await page.$eval('#mainEffectsInterpretationCard', el => el.innerText);
  assert.notStrictEqual(maximizeText, minimizeText, 'Objective change should update Main Effects preferred-level interpretation');
  assert((await page.$eval('#paretoInterpretationCard', el => el.innerText)).includes('ranks first'), 'Pareto ranking should remain ranking-based after objective change');

  await page.selectOption('#uiLanguageInput', 'zh');
  await page.waitForTimeout(300);
  const zhCards = await page.evaluate(() => [
    document.querySelector('#mainEffectsInterpretationCard')?.innerText || '',
    document.querySelector('#paretoInterpretationCard')?.innerText || '',
    document.querySelector('#interactionInterpretationCard')?.innerText || ''
  ].join('\n'));
  ['图表解读', '关键发现', '工程含义', '证据状态', '建议下一步'].forEach(label => {
    assert(zhCards.includes(label), `Chinese interpretation should include ${label}`);
  });
  assert(!zhCards.includes('Key Finding'), 'Chinese interpretation should not include English headings');

  await page.selectOption('#uiLanguageInput', 'en');
  await page.selectOption('#exampleStudySelect', 'screening');
  await page.waitForTimeout(300);
  const screeningInteraction = await page.$eval('#interactionInterpretationCard', el => el.innerText);
  assert(screeningInteraction.includes('aliased') || screeningInteraction.includes('confounded'), 'Screening interaction interpretation should state alias/confounding limitation');
  assert(!screeningInteraction.includes('CONFIRMED'), 'Screening interaction interpretation should not mark evidence as confirmed');

  await page.evaluate(() => {
    state.factors[0].high = `${state.factors[0].high}X`;
    invalidateDesign();
    showWorkflowStep('analyze', false);
  });
  await page.waitForTimeout(100);
  const pending = await page.$eval('#mainEffectsInterpretationCard', el => el.innerText);
  assert(pending.includes('Chart interpretation will appear after the analysis is complete.'), 'Invalidated analysis should reset chart interpretation');

  await browser.close();
  console.log('DOE V7.9.2 chart interpretation tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
