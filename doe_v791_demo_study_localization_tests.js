const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const targetUrl = `file://${path.resolve(targetFile)}`;

const expectations = {
  optimization: {
    en: {
      title: 'Injection Molding Warpage Reduction',
      problem: 'Warpage exceeds dimensional requirement after injection molding. Use DOE to find process settings that reduce warpage.',
      hypothesis: 'Injection temperature, injection pressure and cooling time are expected to influence shrinkage balance and final warpage.',
      response: 'Warpage',
      factors: ['Injection Temperature', 'Injection Pressure', 'Cooling Time'],
      approach: 'Full Factorial DOE + Optimization',
      conclusion: 'Identify optimal process window and confirm before implementation.'
    },
    zh: {
      title: '注塑翘曲降低',
      problem: '注塑后翘曲量超出尺寸要求。使用DOE寻找可降低翘曲的过程设置。',
      hypothesis: '注射温度、注射压力和冷却时间预计会影响收缩平衡和最终翘曲量。',
      response: '翘曲量',
      factors: ['注射温度', '注射压力', '冷却时间'],
      approach: '全因子设计 + 优化',
      conclusion: '识别最佳工艺窗口，并在实施前进行确认。'
    }
  },
  screening: {
    en: {
      title: 'CNC Machining Dimensional Variation Reduction',
      response: 'Diameter Variation',
      factors: ['Cutting Speed', 'Feed Rate', 'Depth of Cut', 'Tool Condition', 'Coolant Flow'],
      approach: 'Fractional Factorial Screening DOE using the existing 8-run screening workflow',
      conclusion: 'Rank critical factors before optimization.',
      limitation: 'Interaction effects may not be independently estimated.'
    },
    zh: {
      title: 'CNC加工尺寸波动降低',
      response: '直径波动',
      factors: ['切削速度', '进给率', '切削深度', '刀具状态', '冷却液流量'],
      approach: '使用现有8次运行筛选流程的部分因子筛选设计',
      conclusion: '在优化前对关键因素进行排序。',
      limitation: '交互作用可能无法被独立估计。'
    }
  },
  rootcause: {
    en: {
      title: 'Seal Leakage Failure Investigation',
      response: 'Leak Rate',
      factors: ['Material Batch', 'Welding Temperature', 'Welding Pressure', 'Cycle Time'],
      approach: 'Factorial DOE',
      conclusion: 'Identify major contributors and corrective action direction.'
    },
    zh: {
      title: '密封泄漏失效调查',
      response: '泄漏率',
      factors: ['材料批次', '焊接温度', '焊接压力', '循环时间'],
      approach: '因子DOE',
      conclusion: '识别主要贡献因素和纠正措施方向。'
    }
  },
  robustness: {
    en: {
      title: 'Laser Welding Process Robustness',
      response: 'Penetration Depth',
      factors: ['Laser Power', 'Welding Speed', 'Focus Position', 'Material Thickness Variation', 'Ambient Temperature'],
      approach: 'Robustness DOE using the existing two-level workflow',
      conclusion: 'Identify stable process window.'
    },
    zh: {
      title: '激光焊接过程稳健性',
      response: '熔深',
      factors: ['激光功率', '焊接速度', '焦点位置', '材料厚度变化', '环境温度'],
      approach: '使用现有两水平工作流的稳健性设计',
      conclusion: '识别稳定工艺窗口。'
    }
  }
};

async function loadExample(page, lang, id) {
  await page.selectOption('#uiLanguageInput', lang);
  await page.waitForTimeout(100);
  await page.selectOption('#exampleStudySelect', id);
  await page.waitForTimeout(200);
}

async function currentFactorNames(page) {
  return page.$$eval('#factorBody input[data-k="name"]', inputs => inputs.map(input => input.value));
}

async function reportText(page) {
  await page.click('[data-result-tab-button="report"]');
  await page.waitForTimeout(50);
  return page.$eval('#studyReportBody', el => el.innerText);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  for (const [id, expectedByLang] of Object.entries(expectations)) {
    await loadExample(page, 'zh', id);
    const zh = expectedByLang.zh;
    assert.strictEqual(await page.$eval('#projectName', el => el.value), zh.title, `${id} Chinese title`);
    assert.strictEqual(await page.$eval('#responseName', el => el.value), zh.response, `${id} Chinese response`);
    assert.deepStrictEqual(await currentFactorNames(page), zh.factors, `${id} Chinese factors`);
    if (zh.problem) assert.strictEqual(await page.$eval('#problemStatement', el => el.value), zh.problem, `${id} Chinese problem`);
    if (zh.hypothesis) assert.strictEqual(await page.$eval('#engineeringHypothesis', el => el.value), zh.hypothesis, `${id} Chinese hypothesis`);
    const zhReport = await reportText(page);
    [zh.approach, zh.conclusion, zh.limitation].filter(Boolean).forEach(text => {
      assert(zhReport.includes(text), `${id} Chinese report should include ${text}`);
    });
    assert(!zhReport.includes(expectedByLang.en.title), `${id} Chinese report should not include English title`);
    assert(!zhReport.includes(expectedByLang.en.response), `${id} Chinese report should not include English response`);

    await loadExample(page, 'en', id);
    const en = expectedByLang.en;
    assert.strictEqual(await page.$eval('#projectName', el => el.value), en.title, `${id} English title`);
    assert.strictEqual(await page.$eval('#responseName', el => el.value), en.response, `${id} English response`);
    assert.deepStrictEqual(await currentFactorNames(page), en.factors, `${id} English factors`);
    const enReport = await reportText(page);
    [en.approach, en.conclusion, en.limitation].filter(Boolean).forEach(text => {
      assert(enReport.includes(text), `${id} English report should include ${text}`);
    });
    assert(!/[\u4e00-\u9fff]/.test(enReport), `${id} English report should not include Chinese text`);
  }

  await browser.close();
  console.log('DOE V7.9.1 demo study localization tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
