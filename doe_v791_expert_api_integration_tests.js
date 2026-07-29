const fs = require('fs');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_1_Step_Workflow_UI.html';
const html = fs.readFileSync(targetFile, 'utf8');

assert(html.includes('DOE Expert Recommendation'), 'Recommendation card should exist in Experiment Strategy');
[
  'expertRecommendationCard',
  'expertGoal',
  'expertNumFactors',
  'expertUserBudget',
  'getExpertRecommendationBtn',
  'acceptExpertStrategyBtn',
  'expertRecommendedDesign',
  'expertDisplayName',
  'expertEngineeringReason',
  'expertDecisionStatus',
  'expertWarnings',
  'expertNextActions',
  'expertDecisionTrace',
  'expertTraceBody'
].forEach(id => {
  assert(html.includes(`id="${id}"`), `Missing Expert Recommendation UI element: ${id}`);
});
assert(html.includes('<summary>Decision Trace</summary>'), 'Decision Trace should be expandable');
assert(!html.includes('<details class="method-notes" id="expertDecisionTrace" open'), 'Decision Trace should be collapsed by default');

assert(html.includes("fetch('/recommend-design'"), 'Expert recommendation should call POST /recommend-design');
assert(html.includes("method:'POST'"), 'Expert API call should use POST');
assert(html.includes("'Content-Type':'application/json'"), 'Expert API call should send JSON');
assert(html.includes('goal:inputs.goal'), 'Request payload should include goal');
assert(html.includes('num_factors:inputs.num_factors'), 'Request payload should include num_factors');
assert(html.includes('user_budget:inputs.user_budget'), 'Request payload should include user_budget');
assert(html.includes('context:buildExpertRecommendationContext()'), 'Request payload should include context');

assert(html.includes('function renderExpertRecommendation'), 'API response renderer should exist');
assert(html.includes('data.design_type'), 'Renderer should handle design_type');
assert(html.includes('data.display_name'), 'Renderer should handle display_name');
assert(html.includes('data.engineering_reason'), 'Renderer should handle engineering_reason');
assert(html.includes('data.decision_status'), 'Renderer should handle decision_status');
assert(html.includes('data.warnings'), 'Renderer should handle warnings');
assert(html.includes('data.next_actions'), 'Renderer should handle next_actions');
assert(html.includes('data.trace'), 'Renderer should handle trace');
assert(html.includes('data.engine_version'), 'Renderer should handle engine_version');
assert(html.includes('data.backbone_version'), 'Renderer should handle backbone_version');
assert(html.includes('data.generator_version'), 'Renderer should handle generator_version');
assert(html.includes('data.log_record'), 'Renderer should handle log_record');
assert(html.includes('function renderExpertDecisionTrace'), 'Trace renderer should exist');
['Rule ID', 'Rule Source', 'Fallback Reason', 'Engine Version', 'Backbone Version', 'Generator Version', 'Timestamp'].forEach(label => {
  assert(html.includes(label), `Trace UI should include ${label}`);
});

assert(html.includes('function buildExpertFallbackRecommendation'), 'Fallback recommendation should exist');
assert(html.includes('FALLBACK_RECOMMENDED'), 'Fallback status should render');
assert(html.includes('Expert API unavailable; using browser fallback recommendation.'), 'Fallback warning should render');

const acceptStart = html.indexOf('function acceptExpertStrategy()');
const acceptEnd = html.indexOf('function renderStatisticalEvidenceFoundation', acceptStart);
assert(acceptStart >= 0 && acceptEnd > acceptStart, 'Accept Expert Strategy function should exist');
const acceptBody = html.slice(acceptStart, acceptEnd);
assert(!acceptBody.includes('generate('), 'Accept Expert Strategy must not generate DOE design automatically');
assert(acceptBody.includes('state.acceptedExpertRecommendation=state.expertRecommendation'), 'Accept should save recommendation into frontend state');
assert(acceptBody.includes('updateStatus();'), 'Accept should allow workflow continuation through status update');

assert(html.includes('if(document.getElementById("getExpertRecommendationBtn")) document.getElementById("getExpertRecommendationBtn").onclick=()=>getExpertRecommendation();'));
assert(html.includes('if(document.getElementById("acceptExpertStrategyBtn")) document.getElementById("acceptExpertStrategyBtn").onclick=()=>acceptExpertStrategy();'));
assert(html.includes('function generate()'), 'Existing DOE design generation should remain');
assert(html.includes('function analyze(scroll=true)'), 'Existing analysis workflow should remain');
assert(html.includes("if(state.strategyAssessment||state.acceptedExpertRecommendation)$('wf2').classList.add('done');"), 'Strategy step should accept Expert recommendation completion');

console.log('DOE V7.9.1 Expert API integration tests passed');
