#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const contract=JSON.parse(fs.readFileSync("config/adsense-performance-safeguards.json","utf8"));
const budget=JSON.parse(fs.readFileSync("config/performance-budget.json","utf8"));
const technical=fs.readFileSync("docs/adsense-technical-activation.md","utf8");
const files=[];
const walk=(dir)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==="node_modules"||entry.name===".git")continue;
    const p=dir+"/"+entry.name;
    if(entry.isDirectory())walk(p);
    else if(/\.(html|css)$/.test(entry.name)||(p.startsWith("./assets/js/")&&entry.name.endsWith(".js")))files.push(p);
  }
};
walk(".");

assert.equal(contract.status,"pre-activation");
assert.equal(contract.runtime_active,false);
assert.equal(contract.loading.advertising_script_must_not_block_publisher_content,true);
assert.equal(contract.loading.consent_state_must_precede_required_ad_requests,true);
assert.equal(contract.network.speculative_ad_hosts_allowed,false);
assert.equal(contract.network.speculative_ad_requests_allowed,false);
assert.equal(contract.network.ad_runtime_retry_loop_allowed,false);
assert.equal(contract.network.page_reload_on_ad_failure_allowed,false);
assert.equal(contract.failure_behavior.publisher_content_must_remain_available,true);
assert.equal(contract.failure_behavior.navigation_or_tool_functionality_must_depend_on_ads,false);
assert.equal(contract.failure_behavior.layout_shift_from_ad_failure_allowed,false);
assert.equal(budget.ad_runtime_active,false);
assert.equal(technical.includes("Do not add guessed Google ad domains to CSP."),true);
assert.equal(technical.includes("Do not enable ad scripts globally before consent and inventory activation are complete."),true);

for(const file of files){
  // The offline fallback is a non-monetized utility page. Its explicit retry
  // button intentionally reloads the page after the device reconnects.
  if(file==="./offline.html")continue;
  const text=fs.readFileSync(file,"utf8");
  assert.equal(/adsbygoogle|googlesyndication\.com/i.test(text),false,"Advertising runtime token found before activation in "+file);
  assert.equal(/page\.reload\(|location\.reload\(/i.test(text),false,"Page reload dependency found in "+file);
}
const headers=fs.readFileSync("_headers","utf8");
assert.equal(/googlesyndication\.com|doubleclick\.net|googleadservices\.com/i.test(headers),false,"Speculative ad host found in CSP");

console.log("AdSense monetization performance safeguards: PASS");
console.log("Advertising runtime: inactive");
console.log("Speculative ad requests/hosts: blocked");
console.log("Ad failure dependency on publisher content: blocked");
