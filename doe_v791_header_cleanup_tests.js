const fs = require('fs');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');
const header = html.match(/<header class="app-nav">([\s\S]*?)<\/header>/)?.[1] || '';

assert(header.includes('DOE Decision Support Tool'), 'Header should show the tool name');
assert(header.includes('id="exampleStudySelect"'), 'Header should keep the example study selector');
assert(html.includes('Example Study ▼'), 'Demo selector placeholder should be compact');
assert(header.includes('id="uiLanguageInput"'), 'Header should keep the language selector');
assert(header.includes('<option value="zh" selected>中文</option>'));
assert(header.includes('<option value="en">English</option>'));

['Define', 'Strategy', 'Design', 'Execute', 'Analyze', 'Demo Studies', 'Interface Language'].forEach(text => {
  const visiblePattern = new RegExp(`<(a|span)(?![^>]*sr-only)[^>]*>${text}<\\/`);
  assert(!visiblePattern.test(header), `${text} should not be visible in the header`);
});

assert(!header.includes('data-step-nav="define"'), 'Workflow links should not be duplicated in the header');
assert(html.includes('<section class="workflow" id="workflowBar">'), 'Workspace workflow should remain');
assert(html.includes('data-step-nav="define"'), 'Workflow logic should remain in the workspace');

console.log('DOE V7.9.1 header cleanup tests passed');
