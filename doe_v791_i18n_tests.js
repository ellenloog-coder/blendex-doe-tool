const fs = require('fs');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');

assert(html.includes("pageTitle:'DOE工程决策支持工具 V7.9.1'"), 'Chinese page title should be localized');
assert(html.includes("wf1:'定义问题'"), 'Chinese workflow step 1 should be localized');
assert(html.includes("wf2:'实验策略'"), 'Chinese workflow step 2 should be localized');
assert(html.includes("wf3:'DOE设计'"), 'Chinese workflow step 3 should be localized');
assert(html.includes("wf4:'执行实验'"), 'Chinese workflow step 4 should be localized');
assert(html.includes("wf5:'分析证据'"), 'Chinese workflow step 5 should be localized');

[
  "['Example Study ▼','示例研究 ▼']",
  "['DOE Dashboard / DOE决策摘要','DOE决策摘要']",
  "['Experiment Strategy & Feasibility / 实验策略与可行性','实验策略与可行性']",
  "['Model Trust Layer / 模型信任层','模型信任层']",
  "['DOE Evidence Package / DOE证据包','DOE证据包']",
  "['Data validation must pass before analysis:','数据验证必须通过后才能分析：']",
  "['Excel .xlsx detected. This single-file offline build cannot safely read compressed workbook files without an embedded parser. Save the sheet as CSV, then import it here.','检测到Excel .xlsx。此单文件离线版本未嵌入解析器，无法安全读取压缩工作簿文件。请将工作表另存为CSV后再导入。']"
].forEach(pair => {
  assert(html.includes(pair), `Missing i18n phrase pair: ${pair}`);
});

assert(html.includes('function translateUiText'), 'Visible UI translation helper should exist');
assert(html.includes('function localizeVisibleUi'), 'DOM localization helper should exist');
assert(html.includes('function refreshLocalizedUi'), 'Render lifecycle localization hook should exist');
assert(html.includes('function cleanLocalizedText'), 'Bilingual label cleanup helper should exist');
assert(html.includes('renderExampleLibrary();\n  renderFactors(); renderDesign(); renderRun(); updateStatus();'), 'Language rendering should rebuild localized demo options');
assert(html.includes("alert(translateUiText('Data validation must pass before analysis:')"), 'Validation alert should be localized');
assert(html.includes("alert(translateUiText('Please generate DOE design first.'))"), 'Import/template alert should be localized');

console.log('DOE V7.9.1 i18n tests passed');
