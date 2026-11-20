import fs from "node:fs";

const contract=JSON.parse(fs.readFileSync("config/production-monitoring-contract.json","utf8"));
const workflowDir=".github/workflows";
const removedWorkflowPaths=[
  "production-smoke-reliability.yml",
  "production-ai-get-reliability.yml",
  "production-ai-post-reliability.yml",
  "production-static-assets.yml"
];
const failures=[];
if(contract.phase!=="40A") failures.push("contract phase must be 40A");
if(contract.scope!=="external-production-monitoring-ownership-boundary") failures.push("scope must describe external production monitoring ownership");
if(contract.production_origin!=="https://jawed.co.in") failures.push("production origin must remain jawed.co.in");
if(contract.owner_repository!=="jawedimtiaz/jawed-website") failures.push("personal-site repository must own production monitoring");
if(contract.monitoring_mode!=="external-owner") failures.push("monitoring mode must be external-owner");
if(contract.lab_duplicate_workflows_removed!==true) failures.push("Lab duplicate production-monitor workflows must be removed");
if(contract.checks_are_reused_from!=="jawedimtiaz/jawed-website") failures.push("monitoring checks must be maintained in the personal website repository");
if(contract.failure_behavior!=="external-owner-github-actions-monitor") failures.push("failure behavior must identify the external monitoring owner");
if(contract.scope_boundary!=="lab-application-ci-does-not-monitor-personal-production") failures.push("scope boundary drifted");
for(const workflow of removedWorkflowPaths){
  if(fs.existsSync(`${workflowDir}/${workflow}`)) failures.push("duplicate Lab production monitor remains: "+workflow);
}
if(failures.length){
  console.error("Production Monitoring Ownership Gate FAILED");
  for(const failure of failures) console.error("- "+failure);
  process.exit(1);
}
console.log("Production Monitoring Ownership Gate PASSED");
console.log("Owner: "+contract.owner_repository);
console.log("Lab duplicate external production workflows: removed");
