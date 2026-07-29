const fs = require('fs');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');

assert(html.includes('--page:#f6f8fb'), 'Light gray 8D-style page background should be applied');
assert(html.includes('--card:#ffffff'), 'White content cards should be retained');
assert(html.includes('--primary:#14233b'), 'Dark navy primary color should be applied');
assert(html.includes('--primary-2:#4c82f7'), 'Blue accent color should be applied');
assert(html.includes('--green-soft:#edf8f2'), 'Soft pass status color should be applied');
assert(html.includes('--amber-soft:#fff7e8'), 'Soft warning status color should be applied');
assert(html.includes('--red-soft:#fff1ef'), 'Soft review status color should be applied');

assert(html.includes('.topbar h1{font-size:18px'), 'Page title should use compact 8D density');
assert(html.includes('.section-header h2{font-size:16px'), 'Section titles should be compact');
assert(html.includes('body{background:var(--page);font-size:13px'), 'Body text should be compact');
assert(html.includes('th,td{font-size:12px'), 'Table text should be compact');

assert(html.includes('.section{border-color:var(--line);border-radius:18px;box-shadow:var(--shadow);background:#fff}'));
assert(html.includes('.metric,.result-card,.governance-card,.evidence-status-card,.closure-card,.strategy-card,.chart-card,.evidence-layer,.decision-item,.setting'));
assert(html.includes('.status-pill.ready{background:var(--green-soft)'));
assert(html.includes('.status-pill.pending{background:var(--amber-soft)'));
assert(html.includes('.results-tab.active{color:#2f6fed'));

console.log('DOE V7.9.1 visual style tests passed');
