const fs = require('fs');
const assert = require('assert');

const targetFile = process.argv[2] || 'DOE_MVP_Demo_V7_9_Model_Trust_Layer.html';
const html = fs.readFileSync(targetFile, 'utf8');

assert(html.includes('DOE Expert Recommendation'), 'Recommendation card should be displayed in Experiment Strategy');
[
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
  'expertNextActions'
].forEach(id => {
  assert(html.includes(`id="${id}"`), `Missing Expert Recommendation UI element: ${id}`);
});

assert(html.includes("fetch('/recommend-design'"), 'Expert recommendation should call POST /recommend-design');
assert(html.includes("method:'POST'"), 'Expert API call should use POST');
assert(html.includes("'Content-Type':'application/json'"), 'Expert API call should send JSON');
assert(html.includes('goal:inputs.goal'), 'Request should include goal');
assert(html.includes('num_factors:inputs.num_factors'), 'Request should include num_factors');
assert(html.includes('user_budget:inputs.user_budget'), 'Request should include user_budget');
assert(html.includes('context:buildExpertRecommendationContext()'), 'Request should include context');

assert(html.includes('function renderExpertRecommendation'), 'API response renderer should exist');
assert(html.includes('data.design_type'), 'Renderer should handle recommended design');
assert(html.includes('data.display_name'), 'Renderer should handle display name');
assert(html.includes('data.engineering_reason'), 'Renderer should handle engineering reason');
assert(html.includes('data.decision_status'), 'Renderer should handle decision status');
assert(html.includes('data.warnings'), 'Renderer should handle warnings');
assert(html.includes('data.next_actions'), 'Renderer should handle next actions');

assert(html.includes('function buildExpertFallbackRecommendation'), 'Fallback recommendation should exist');
assert(html.includes('FALLBACK_RECOMMENDED'), 'Fallback status should be displayed');
assert(html.includes('Expert API unavailable; using browser fallback recommendation.'), 'Fallback warning should be shown');

const acceptMatch = html.match(/function acceptExpertStrategy\(\)\{([\s\S]*?)\n\}/);
assert(acceptMatch, 'Accept Expert Strategy function should exist');
assert(!acceptMatch[1].includes('generate('), 'Accept Expert Strategy must not generate DOE design automatically');
assert(acceptMatch[1].includes('state.acceptedExpertRecommendation=state.expertRecommendation'), 'Accept should store selected recommendation');

assert(html.includes('if(document.getElementById("getExpertRecommendationBtn")) document.getElementById("getExpertRecommendationBtn").onclick=()=>getExpertRecommendation();'));
assert(html.includes('if(document.getElementById("acceptExpertStrategyBtn")) document.getElementById("acceptExpertStrategyBtn").onclick=()=>acceptExpertStrategy();'));
assert(html.includes('function generate()'), 'Existing design generation should remain');
assert(html.includes('function analyze(scroll=true)'), 'Existing analysis workflow should remain');

console.log('DOE V7.9 Expert API integration tests passed');
