const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const targetUrl = `file://${path.resolve(targetFile)}`;

const englishLabels = [
  'Define Problem',
  'Experiment Strategy',
  'DOE Design',
  'Execute Experiment',
  'Analyze Evidence',
  'Example Study',
  'Interface Language',
  'Problem Statement',
  'Engineering Hypothesis',
  'Characteristic Type',
  'Study Metadata',
  'Advanced Study Information',
  'Get Recommendation',
  'Accept Expert Strategy',
  'Decision Trace',
  'Model Trust',
  'Decision Summary',
  'Evidence Package',
  'Study Closure',
  'Data Exchange',
  'Download CSV Template',
  'Design Matrix Export',
  'Data Preparation Checklist',
  'Confirm factor names and levels',
  'Record run order',
  'Capture measured response values',
  'Maintain original experiment evidence'
];

async function visibleTextNodes(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue.replace(/\s+/g, ' ').trim();
        const parent = node.parentElement;
        if (!text || !parent) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('#uiLanguageInput')) return NodeFilter.FILTER_REJECT;
        if (!visible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) texts.push(walker.currentNode.nodeValue.replace(/\s+/g, ' ').trim());
    return texts;
  });
}

async function scanWorkflow(page, assertion) {
  for (const step of ['define', 'strategy', 'design', 'execute', 'analyze']) {
    await page.click(`[data-step-nav="${step}"]`);
    await page.waitForTimeout(50);
    const text = (await visibleTextNodes(page)).join('\n');
    assertion(text, step);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  await page.selectOption('#uiLanguageInput', 'zh');
  await page.waitForTimeout(100);
  assert.strictEqual(
    await page.$eval('#exampleStudySelect', el => el.selectedOptions[0].textContent.trim()),
    '示例研究 ▼',
    'Chinese mode should localize the Example Study selector'
  );
  await scanWorkflow(page, (text, step) => {
    const found = englishLabels.filter(label => text.includes(label));
    assert.deepStrictEqual(found, [], `Chinese mode should not show English UI labels in ${step}: ${found.join(', ')}`);
  });

  await page.selectOption('#uiLanguageInput', 'en');
  await page.waitForTimeout(100);
  assert.strictEqual(
    await page.$eval('#exampleStudySelect', el => el.selectedOptions[0].textContent.trim()),
    'Example Study ▼',
    'English mode should localize the Example Study selector'
  );
  await scanWorkflow(page, (text, step) => {
    assert(!/[\u4e00-\u9fff]/.test(text), `English mode should not show Chinese UI text in ${step}: ${text.match(/[\u4e00-\u9fff][^\n]*/)?.[0] || ''}`);
  });

  await browser.close();
  console.log('DOE V7.9.1 language switch purity tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
