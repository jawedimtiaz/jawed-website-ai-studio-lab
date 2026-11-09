#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const finalDoc=fs.readFileSync("docs/adsense-final-readiness.md","utf8");
const privacy=fs.readFileSync("privacy/index.html","utf8");
const inventory=JSON.parse(fs.readFileSync("config/adsense-inventory.json","utf8"));
const placement=JSON.parse(fs.readFileSync("config/adsense-placement-policy.json","utf8"));
const headers=fs.readFileSync("_headers","utf8");
const workflow=fs.readFileSync(".github/workflows/adsense-readiness.yml","utf8").replace(/\r\n/g,"\n");
const handoff=fs.readFileSync("docs/adsense-activation-handoff.md","utf8");
const aggregate=fs.readFileSync("scripts/validate-adsense-readiness.mjs","utf8");
const siteIntegrityWorkflow=fs.readFileSync(".github/workflows/site-integrity.yml","utf8");
const securityWorkflow=fs.readFileSync(".github/workflows/production-security-headers.yml","utf8");
const smokeWorkflow=fs.readFileSync(".github/workflows/production-smoke-reliability.yml","utf8");
const deploymentWorkflow=fs.readFileSync(".github/workflows/deployment-runtime-reliability.yml","utf8");
function triggerPaths(workflow, trigger){
  const start=workflow.indexOf(trigger);
  assert.notEqual(start,-1,"Workflow trigger missing: "+trigger);
  const next=workflow.indexOf("\n  push:",start);
  const end=trigger==="  pull_request:" ? next : workflow.indexOf("\n  workflow_dispatch:",start);
  assert.notEqual(end,-1,"Workflow trigger boundary missing: "+trigger);
  return [...workflow.slice(start,end).matchAll(/^      - "([^"]+)"$/gm)].map(m=>m[1]).sort();
}

const prTriggerPaths=triggerPaths(workflow,"  pull_request:");
const pushTriggerPaths=triggerPaths(workflow,"  push:");
assert.deepEqual(prTriggerPaths,pushTriggerPaths,"PR and main-push readiness trigger paths must remain identical");
assert.equal(new Set(prTriggerPaths).size,prTriggerPaths.length,"PR readiness trigger paths must be unique");
assert.equal(new Set(pushTriggerPaths).size,pushTriggerPaths.length,"Main-push readiness trigger paths must be unique");
assert.equal(workflow.includes("workflow_dispatch:"),true,"Manual readiness dispatch must remain available");
assert.equal(workflow.includes("permissions:\n  contents: read"),true,"Read-only workflow permissions are required");
assert.equal(workflow.includes("timeout-minutes: 5"),true,"Readiness workflow timeout must remain bounded");
const aggregateTimeoutMatch=aggregate.match(/const VALIDATOR_TIMEOUT_MS = (\d+);/);
assert.notEqual(aggregateTimeoutMatch,null,"Aggregate validator timeout contract is missing");
const aggregateValidatorTimeoutMs=Number(aggregateTimeoutMatch[1]);
assert.equal(Number.isInteger(aggregateValidatorTimeoutMs)&&aggregateValidatorTimeoutMs>0,true,"Aggregate validator timeout must be a positive integer");
const workflowTimeoutMatch=workflow.match(/timeout-minutes:\s*(\d+)/);
assert.notEqual(workflowTimeoutMatch,null,"Readiness workflow timeout contract is missing");
const workflowTimeoutMs=Number(workflowTimeoutMatch[1])*60000;

assert.equal(workflow.includes("cancel-in-progress: true"),true,"Readiness workflow concurrency cancellation must remain enabled");

const dynamicScanTriggerPaths=[
  "**/*.html","**/*.css","assets/js/**",
  "about/**","work/**","notes/**","blog/**","topics/**","resources/**","tools/**","ai/**","assets/**","functions/**","privacy/**"
];
assert.equal(new Set(dynamicScanTriggerPaths).size,dynamicScanTriggerPaths.length,"Dynamic source-scan trigger contract must contain unique paths");
for(const path of dynamicScanTriggerPaths){
  assert.equal(prTriggerPaths.includes(path),true,"Dynamic source-scan path must trigger PR CI: "+path);
  assert.equal(pushTriggerPaths.includes(path),true,"Dynamic source-scan path must trigger main-push CI: "+path);
}

const criticalTriggerPaths=[
  "ads.txt","sitemap.xml","privacy/index.html","assets/css/style.css","_headers",
  "config/performance-budget.json","config/adsense-inventory.json","config/adsense-slot-contract.json",
  "config/adsense-consent-contract.json","config/adsense-performance-safeguards.json",
  "config/adsense-final-performance-gate.json","docs/adsense-content-readiness.md",
  "docs/adsense-technical-activation.md","docs/adsense-activation-contract.md",
  "docs/adsense-activation-handoff.md",".github/workflows/site-integrity.yml",
  ".github/workflows/production-security-headers.yml",".github/workflows/production-smoke-reliability.yml",
  ".github/workflows/deployment-runtime-reliability.yml"
];
for(const path of criticalTriggerPaths){
  assert.equal(prTriggerPaths.includes(path),true,"Critical readiness path must trigger PR CI: "+path);
  assert.equal(pushTriggerPaths.includes(path),true,"Critical readiness path must trigger main-push CI: "+path);
}

const reviewedContentDependencies=["notes/health-insurance-understanding-the-basics/index.html","notes/apple-device-management-enrollment-models/index.html","notes/microsoft-sign-in-troubleshooting-guide/index.html","work/certifications/index.html","topics/index.html","notes/index.html","blog/rebuilding-jawed-co-in/index.html","notes/retirement-planning-start-with-the-number/index.html","tools/interview-preparation-planner/index.html","tools/ticket-to-knowledge-base-draft/index.html","tools/service-desk-note-formatter/index.html","notes/service-desk-ticket-documentation/index.html","notes/it-support-escalation-handoff-checklist/index.html","tools/it-troubleshooting-assistant/index.html","notes/building-safe-browser-based-it-tools/index.html","notes/apis-explained-for-it-support/index.html","notes/choosing-ai-tools-privacy-cost-fit/index.html","notes/inflation-and-future-goal-planning/index.html","notes/indian-income-tax-practical-starting-point/index.html","notes/new-vs-old-tax-regime-comparison/index.html","notes/device-provisioning-handoff-checklist/index.html","notes/scoping-it-issues-user-device-service/index.html","notes/small-it-automation-starting-point/index.html","notes/windows-first-response-troubleshooting-checklist/index.html","notes/network-connectivity-first-response-checklist/index.html","notes/ai-for-it-support-practical-workflow/index.html","notes/us-stocks-etfs-starting-point/index.html","notes/indian-mutual-funds-index-etfs-starting-point/index.html","notes/portfolio-allocation-rebalancing-framework/index.html","notes/money-basics-budget-emergency-net-worth/index.html","notes/retirement-corpus-calculation-framework/index.html","notes/retirement-withdrawals-sequence-risk-income-review/index.html","contact/index.html","notes/it-troubleshooting-guide-knowledge-base/index.html","notes/interactive-tools-ai-assisted-experiences-architecture/index.html","notes/networking-layer-by-layer-diagnostic-framework/index.html","blog/triage-workplace-app-access-issue/index.html","work/projects/index.html","work/experience/index.html","work/skills/index.html","privacy/index.html","tools/finance-planning-workspace/index.html"];
for(const path of reviewedContentDependencies){
  assert.equal(prTriggerPaths.includes(path),true,"Reviewed content dependency must trigger PR CI: "+path);
  assert.equal(pushTriggerPaths.includes(path),true,"Reviewed content dependency must trigger main-push CI: "+path);
}

const validatorFiles=[
  "scripts/validate-adsense-privacy.mjs","scripts/validate-adsense-inventory.mjs",
  "scripts/validate-adsense-activation.mjs","scripts/validate-adsense-content-readiness.mjs",
  "scripts/validate-adsense-placement-policy.mjs","scripts/validate-adsense-technical.mjs",
  "scripts/validate-adsense-slot-architecture.mjs","scripts/validate-adsense-mobile-readiness.mjs",
  "scripts/validate-adsense-consent-performance.mjs","scripts/validate-adsense-performance-safeguards.mjs",
  "scripts/validate-adsense-final-performance-gate.mjs","scripts/validate-adsense-final-readiness.mjs",
  "scripts/validate-adsense-preactivation.mjs"
];
assert.equal(validatorFiles.length,13,"Canonical AdSense validator contract must contain 13 validators");
assert.equal(new Set(validatorFiles).size,validatorFiles.length,"Canonical AdSense validator contract must contain unique validators");
const performanceBudget=JSON.parse(fs.readFileSync("config/performance-budget.json","utf8"));
assert.equal(performanceBudget.rules.some(rule=>rule.includes("dated measurement")),true,"Performance budget must prohibit unmeasured Core Web Vitals claims");
assert.equal(aggregateValidatorTimeoutMs*validatorFiles.length<workflowTimeoutMs,true,"Canonical validator timeouts must remain within the workflow timeout budget");

for(const validatorFile of validatorFiles){
  assert.equal(prTriggerPaths.includes(validatorFile),true,"Validator file must trigger PR CI: "+validatorFile);
  assert.equal(pushTriggerPaths.includes(validatorFile),true,"Validator file must trigger main-push CI: "+validatorFile);
  const validatorSource=fs.readFileSync(validatorFile,"utf8");
  const dependencies=[...validatorSource.matchAll(/(?:readFileSync|existsSync)\(["']([^"']+)["']/g)]
    .map(match=>match[1]).filter(path=>!path.startsWith("/")&&!path.startsWith("node:")&&!path.endsWith("/"));
  for(const dependency of dependencies){
    assert.equal(prTriggerPaths.includes(dependency),true,"Validator dependency must trigger PR CI: "+validatorFile+" -> "+dependency);
    assert.equal(pushTriggerPaths.includes(dependency),true,"Validator dependency must trigger main-push CI: "+validatorFile+" -> "+dependency);
  }
}

assert.equal(finalDoc.includes("Status: **pre-activation / externally blocked**"),true,"Final status must remain pre-activation");
assert.equal(finalDoc.includes("production ad-serving configuration")&&finalDoc.includes("final CMP/consent configuration"),true,"External activation dependency is missing");
assert.equal(handoff.includes("Immediate rollback conditions"),true,"Activation rollback safeguard is missing");
assert.equal(handoff.includes("Exact status observed at activation"),true,"Activation evidence must record the observed Google status");
assert.equal(handoff.includes("Full Git commit SHA"),true,"Activation evidence must record the activation commit");
assert.equal(handoff.includes("Aggregate validator result"),true,"Activation evidence must record aggregate validator results");
assert.equal(handoff.includes("Production smoke"),true,"Activation evidence must record production smoke results");
assert.equal(handoff.includes("Final CSP diff"),true,"Activation evidence must record the final CSP review");
assert.equal(handoff.includes("CMP/consent"),true,"Activation evidence must record consent behavior");
assert.equal(handoff.includes("Final eligible/excluded route review"),true,"Activation evidence must record inventory review");
assert.equal(handoff.includes("Pre-activation commit SHA retained"),true,"Activation evidence must retain the rollback commit");
assert.equal(handoff.includes("Do not record publisher secrets"),true,"Activation evidence must prohibit unnecessary account credentials");
assert.equal(handoff.includes("AdSense Sites status is **Ready**"),true,"Activation entry gate is missing");
assert.equal(handoff.includes("site-integrity"),true,"Activation handoff must require site-integrity verification");
assert.equal(handoff.includes("production security"),true,"Activation handoff must require production security verification");
assert.equal(handoff.includes("production smoke"),true,"Activation handoff must require production smoke verification");
assert.equal(handoff.includes("deployment runtime"),true,"Activation handoff must require deployment-runtime verification");
assert.equal(siteIntegrityWorkflow.includes("node scripts/validate-site-integrity.mjs"),true,"Site-integrity workflow contract missing");
assert.equal(securityWorkflow.includes("node scripts/validate-production-security-headers.mjs"),true,"Production security workflow contract missing");
assert.equal(smokeWorkflow.includes("node scripts/validate-production-smoke.mjs"),true,"Production smoke workflow contract missing");
assert.equal(deploymentWorkflow.includes("node scripts/validate-deployment-runtime-reliability.mjs"),true,"Deployment runtime workflow contract missing");
assert.equal((workflow.match(/docs\/adsense-activation-handoff\.md/g)||[]).length,2,"Activation handoff must trigger both PR and main-push readiness CI");
assert.equal(aggregate.includes("Validator count:")&&aggregate.includes("AdSense readiness aggregate gate: PASS"),true,"Aggregate readiness runner is incomplete");

const aggregateArrayMatch=aggregate.match(/const validators = \[([\s\S]*?)\n\];/);
assert.notEqual(aggregateArrayMatch,null,"Aggregate runner validator array must be present");
const aggregateValidators=[...aggregateArrayMatch[1].matchAll(/"((?:validate-adsense-[a-z-]+)\.mjs)"/g)]
  .map(match=>match[1]);
const workflowValidators=[...workflow.matchAll(/run: node scripts\/(validate-adsense-[a-z-]+\.mjs)/g)]
  .map(match=>match[1]).filter(name=>name!=="validate-adsense-readiness.mjs");
const expectedValidators=validatorFiles.map(path=>path.slice("scripts/".length));
assert.equal(aggregateValidators.length,validatorFiles.length,"Aggregate runner must cover every canonical AdSense validator");
assert.equal(workflowValidators.length,validatorFiles.length,"CI must execute every canonical AdSense validator");
assert.equal(new Set(aggregateValidators).size,aggregateValidators.length,"Aggregate runner must not duplicate AdSense validators");
assert.equal(new Set(workflowValidators).size,workflowValidators.length,"CI must not duplicate AdSense validators");
assert.deepEqual(aggregateValidators,workflowValidators,"Aggregate runner and CI must execute the same AdSense validators in the same order");
assert.deepEqual(aggregateValidators,expectedValidators,"Aggregate runner must execute the canonical AdSense validator order");
assert.deepEqual(workflowValidators,expectedValidators,"CI must execute the canonical AdSense validator order");
for(const validator of aggregateValidators){
  assert.equal(fs.existsSync("scripts/"+validator),true,"AdSense validator file missing: "+validator);
}

assert.equal(workflow.includes("run: node scripts/validate-adsense-readiness.mjs"),true,"CI must execute the aggregate AdSense readiness gate");
assert.equal((workflow.match(/docs\/adsense-activation-handoff\.md/g)||[]).length,2,"Activation handoff must appear once in each trigger");
assert.equal(finalDoc.includes("Do not activate ad scripts, visible ad slots, `ads.txt`"),true,"Activation safeguard is missing");
assert.equal(privacy.includes("<h2>Advertising and AdSense</h2>"),true,"AdSense privacy foundation is missing");
assert.equal(inventory.status,"pre-ads-review","Inventory must remain pre-activation");
assert.equal(placement.status,"pre-activation","Placement policy must remain pre-activation");
assert.equal(fs.existsSync("ads.txt"),false,"ads.txt must remain absent before publisher activation");
assert.equal(!headers.includes("adsbygoogle"),true,"No publisher-specific CSP token may be guessed before activation");
assert.equal(!workflow.includes("adsbygoogle"),true,"Readiness workflow must not embed ad runtime code");
assert.equal(!workflow.includes("ca-pub-"),true,"Readiness workflow must not contain a guessed publisher ID");
assert.equal(fs.existsSync("scripts/validate-adsense-privacy.mjs"),true,"Privacy validator missing");
assert.equal(fs.existsSync("scripts/validate-adsense-inventory.mjs"),true,"Inventory validator missing");
assert.equal(fs.existsSync("scripts/validate-adsense-activation.mjs"),true,"Activation validator missing");
assert.equal(fs.existsSync("scripts/validate-adsense-content-readiness.mjs"),true,"Content readiness validator missing");
assert.equal(fs.existsSync("scripts/validate-adsense-placement-policy.mjs"),true,"Placement validator missing");
assert.equal(fs.existsSync("scripts/validate-adsense-technical.mjs"),true,"Technical validator missing");

console.log("AdSense final readiness validation: PASS");
console.log("Repository readiness validator count: "+((aggregate.match(/validate-adsense-[a-z-]+\.mjs/g)||[]).length));
console.log("External account activation required: yes");
console.log("AdSense runtime enabled: no");
