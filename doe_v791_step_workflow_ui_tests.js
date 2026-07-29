const fs = require('fs');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');

assert(html.includes('DOE Engineering Decision Support Tool V7.9.1'));
assert(html.includes('data-step-nav="define"'));
assert(html.includes('data-step-nav="strategy"'));
assert(html.includes('data-step-nav="design"'));
assert(html.includes('data-step-nav="execute"'));
assert(html.includes('data-step-nav="analyze"'));

assert(html.includes('Define Problem'));
assert(html.includes('Experiment Strategy'));
assert(html.includes('DOE Design'));
assert(html.includes('Execute Experiment'));
assert(html.includes('Analyze Evidence'));

assert(html.includes('id="analysisTabs"'));
assert(html.includes('data-result-tab-button="evidence"'));
assert(html.includes('data-result-tab-button="trust"'));
assert(html.includes('data-result-tab-button="decision"'));
assert(html.includes('data-result-tab-button="report"'));

assert(html.includes('function showWorkflowStep'));
assert(html.includes('function organizeResultsTabs'));
assert(html.includes('function showResultTab'));
assert(html.includes("define:['plan']"));
assert(html.includes("strategy:['experimentStrategy']"));
assert(html.includes("execute:['run','dataImportSection','dataValidationPanel']"));
assert(html.includes("analyze:['results']"));

assert(html.includes('<details class="section method-notes" id="methodNotes">'));
assert(!html.includes('<details class="section method-notes" id="methodNotes" open>'));
assert(html.includes('#dataExchange{display:none}'));

console.log('DOE V7.9.1 step workflow UI tests passed');
