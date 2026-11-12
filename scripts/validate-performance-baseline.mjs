#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const baseline=fs.readFileSync("docs/performance-monetization-baseline.md","utf8");
const budget=JSON.parse(fs.readFileSync("config/performance-budget.json","utf8"));
const analytics=fs.readFileSync("assets/js/analytics.js","utf8");

assert.equal(budget.status,"baseline");
assert.equal(budget.ad_runtime_active,false);
assert.equal(baseline.includes("Source inspection alone cannot establish Core Web Vitals"),true);
assert.equal(baseline.includes("37B — Core Web Vitals protection"),true);
assert.equal(analytics.includes("requestIdleCallback"),true);
assert.equal(analytics.includes("setTimeout(load,1500)"),true);
assert.equal(fs.existsSync("ads.txt"),false);
assert.equal(fs.readFileSync("_headers","utf8").includes("adsbygoogle"),false);

const htmlFiles=fs.readdirSync(".",{recursive:true}).filter(path=>path.endsWith(".html"));
const eagerAnalyticsFiles=[];
const missingDeferredAnalyticsFiles=[];
for(const file of htmlFiles){
  const html=fs.readFileSync(file,"utf8");
  if(html.includes("https://www.googletagmanager.com/gtag/js?id=G-14C5DCPM15"))eagerAnalyticsFiles.push(file);
  const deferredCount=(html.match(/<script src="\/assets\/js\/analytics\.js" defer><\/script>/g)||[]).length;
  if(html.includes("/assets/js/analytics.js")&&deferredCount!==1)missingDeferredAnalyticsFiles.push(file);
}
assert.equal(eagerAnalyticsFiles.length,0,"No published HTML page may load GA4 eagerly: "+eagerAnalyticsFiles.join(", "));
assert.equal(missingDeferredAnalyticsFiles.length,0,"Every published HTML page that uses analytics must use exactly one deferred analytics loader: "+missingDeferredAnalyticsFiles.join(", "));

console.log("No eager analytics and deferred analytics loading contract: PASS");
console.log("Phase 37A performance baseline: PASS");
console.log("AdSense runtime active: no");
console.log("Core Web Vitals values: targets only; no score claimed");
