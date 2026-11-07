#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {isSafeSourceUrl,isSafeSourceMetadata} from "../functions/lib/ai-provider-common.js";
import {findRelevantKnowledge} from "../functions/lib/ai-knowledge.js";

const sitemap=fs.readFileSync("sitemap.xml","utf8");
const knowledge=JSON.parse(fs.readFileSync("assets/data/ai-knowledge.json","utf8"));
const runtimeKnowledge=fs.readFileSync("functions/lib/ai-knowledge-data.js","utf8");
const expectedRuntimeKnowledge=`const knowledge=${JSON.stringify(knowledge)};\nexport default knowledge;\n`;
const excluded=new Set(knowledge.coverage_policy?.excluded_paths||[]);
const allSitemapLocs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1].trim());
const sitemapPaths=allSitemapLocs.filter(url=>url.startsWith("https://jawed.co.in/")).map(url=>url.slice("https://jawed.co.in".length)||"/");
const workflow=fs.readFileSync(".github/workflows/ai-regression.yml","utf8");
const indexPaths=knowledge.entries.map(entry=>entry.url);
const sourcePath=(url)=>url==="/"?"src/pages/HomePage.tsx":url.replace(/^\\/+|\\/+$/g,"")+"/index.html";
const toolsDataPath="src/data/toolsData.ts";
const toolDetailPath="src/pages/ToolDetailPage.tsx";
const appRoutePath="src/App.tsx";
const toolsData=fs.existsSync(toolsDataPath)?fs.readFileSync(toolsDataPath,"utf8"):"";
const toolDetail=fs.existsSync(toolDetailPath)?fs.readFileSync(toolDetailPath,"utf8"):"";
const appRoutes=fs.existsSync(appRoutePath)?fs.readFileSync(appRoutePath,"utf8"):"";
function sourceFilesForPath(path){
  const toolMatch=path.match(/^\\/tools\\/([a-z0-9-]+)\\/$/);
  if(toolMatch){
    const slug=toolMatch[1];
    const slugRegistered=new RegExp("slug\\\\s*:\\\\s*['\\\"]"+slug+"['\\\"]").test(toolsData);
    const componentRouted=toolDetail.includes("case '"+slug+"'")||toolDetail.includes('case "'+slug+'"');
    const routeRegistered=appRoutes.includes('path="/tools/:slug"')||appRoutes.includes("path='/tools/:slug'");
    return slugRegistered&&componentRouted&&routeRegistered?[toolsDataPath,toolDetailPath,appRoutePath]:[];
  }
  if(path==="/")return fs.existsSync("src/pages/HomePage.tsx")?["src/pages/HomePage.tsx"]:[];
  const candidate=sourcePath(path);
  return fs.existsSync(candidate)?[candidate]:[];
}
const missingSourceFiles=sitemapPaths.filter(path=>!excluded.has(path)).filter(path=>sourceFilesForPath(path).length===0);
const duplicates=indexPaths.filter((path,index)=>indexPaths.indexOf(path)!==index);
const missing=sitemapPaths.filter(path=>!excluded.has(path)&&!indexPaths.includes(path));
const unexpected=indexPaths.filter(path=>!sitemapPaths.includes(path));
const excludedIndexed=[...excluded].filter(path=>indexPaths.includes(path));
const malformed=knowledge.entries.filter(entry=>!isSafeSourceMetadata(entry));
const retrievalChecks=[
  ["retirement planning",{}],
  ["who is Jawed?",{primaryQuery:"who is Jawed?"}],
  ["where does Jawed work?",{primaryQuery:"where does Jawed work?"}]
];
for(const [query,options] of retrievalChecks){
  const results=findRelevantKnowledge(query,5,options);
  assert.equal(results.length<=5,true,"Retrieval result limit exceeded for "+query);
  assert.equal(new Set(results.map(entry=>entry.url)).size,results.length,"Retrieval returned duplicate source URLs for "+query);
  assert.equal(results.every(isSafeSourceMetadata),true,"Retrieval returned unsafe metadata for "+query);
}
const identityResults=findRelevantKnowledge("who is Jawed?",5,{primaryQuery:"who is Jawed?"});
assert.equal(identityResults[0]?.url,"/about/","Identity retrieval must prioritize the About source.");
const workResults=findRelevantKnowledge("where does Jawed work?",5,{primaryQuery:"where does Jawed work?"});
assert.equal(workResults[0]?.url,"/work/experience/","Work retrieval must prioritize the experience source.");
const contextualIdentity=findRelevantKnowledge("Tell me more about that Previous source context: /about/",5,{primaryQuery:"Who is Jawed?"});
assert.equal(contextualIdentity[0]?.url,"/about/","Explicit primary identity intent must remain highest priority over contextual source text.");
const contextualWork=findRelevantKnowledge("Tell me more about that Previous source context: /about/",5,{primaryQuery:"Where does Jawed work?"});
assert.equal(contextualWork[0]?.url,"/work/experience/","Explicit primary work intent must remain highest priority over contextual source text.");
const duplicatedContext=findRelevantKnowledge("Tell me more about that Previous source context: /about/, /about/, /work/experience/",5,{primaryQuery:"Tell me more about that"});
assert.equal(new Set(duplicatedContext.map(entry=>entry.url)).size,duplicatedContext.length,"Contextual retrieval must not return duplicate source URLs.");
assert.equal(duplicatedContext[0]?.url,"/about/","First explicit contextual source must retain priority.");
const unknownContext=findRelevantKnowledge("Tell me more about that Previous source context: /not-a-source/, /about/",5,{primaryQuery:"Tell me more about that"});
assert.equal(unknownContext[0]?.url,"/about/","Unknown contextual source paths must be ignored without displacing valid context.");
const unsafeUrls=knowledge.entries.filter(entry=>!isSafeSourceUrl(entry.url));
const unsafeUrlContractCases={
  "/../admin/":false,
  "/notes/%2e%2e%2fadmin/":false,
  "/notes/%2e%2e%5cadmin/":false,
  "/notes/%2f%2fevil.example/":false,
  "/notes/example/":true
};
for(const [url,expected] of Object.entries(unsafeUrlContractCases))assert.equal(isSafeSourceUrl(url),expected,"Unexpected AI source URL safety result for "+url);
const kbGuide=knowledge.entries.find(entry=>entry.url==="/notes/it-troubleshooting-guide-knowledge-base/");
assert.equal(kbGuide?.title,"IT Troubleshooting Guide: From Incident to Knowledge Base","AI knowledge title must preserve the singular guide intent used by retrieval tests");
assert.equal(kbGuide?.summary.includes("illustrative VPN sign-in example that explicitly leaves the root cause unconfirmed"),true,"AI knowledge summary must reflect the sanitized worked example and preserve uncertainty");
assert.equal(kbGuide?.keywords.includes("incident sanitization")&&kbGuide?.keywords.includes("facts versus hypotheses")&&kbGuide?.keywords.includes("guide")&&kbGuide?.keywords.includes("service desk"),true,"AI knowledge keywords must preserve distinctive coverage and existing service-desk guide retrieval");

const reviewDate=knowledge.reviewed_against_sitemap_on;
const reviewDateMs=typeof reviewDate==="string"&&!Number.isNaN(Date.parse(reviewDate+"T23:59:59Z"))?Date.parse(reviewDate+"T23:59:59Z"):NaN;
const groundingSourceFiles=[...new Set(sitemapPaths.filter(path=>!excluded.has(path)).flatMap(sourceFilesForPath))].filter(file=>file!=="index.html");
const sourceFreshnessErrors=[];
const changedSourceFiles=Number.isNaN(reviewDateMs)?[]:groundingSourceFiles.filter(file=>{
  try{return Boolean(execFileSync("git",["log","--since="+reviewDate+"T23:59:59Z","--format=%H","--",file],{encoding:"utf8"}).trim());}
  catch{sourceFreshnessErrors.push(file);return false;}
});
const requiredWorkflowPaths=new Set(["index.html","_headers","_redirects","_routes.json","scripts/validate-site-integrity.mjs"]);
for(const path of sitemapPaths.filter(path=>path!=="/"&&!excluded.has(path))){
  const family=path.split("/").filter(Boolean)[0];
  if(family)requiredWorkflowPaths.add(family+"/**");
}
const workflowLines=workflow.split(/\r?\n/);
const sectionBetween=(startLine,endLine)=>workflowLines.slice(workflowLines.indexOf(startLine)+1,endLine?workflowLines.indexOf(endLine):workflowLines.length);
const pullRequestPaths=sectionBetween("  pull_request:","  workflow_dispatch:");
const pushPaths=sectionBetween("  push:","  permissions:");
const pathCount=(section,path)=>section.filter(line=>line.trim()===`- "${path}"`).length;
const workflowMissing=[...requiredWorkflowPaths].filter(path=>pathCount(pullRequestPaths,path)!==1||pathCount(pushPaths,path)!==1);
const workflowPathLines=(section)=>section.filter(line=>/^      - ".*"$/.test(line)).map(line=>line.trim().slice(3,-1));
const workflowDuplicatePaths=[...new Set([...workflowPathLines(pullRequestPaths),...workflowPathLines(pushPaths)])].filter(path=>pathCount(pullRequestPaths,path)>1||pathCount(pushPaths,path)>1);
const errors=[];
if(Number.isNaN(reviewDateMs))errors.push("AI knowledge reviewed_against_sitemap_on is missing or invalid.");
if(sourceFreshnessErrors.length)errors.push("AI knowledge source freshness could not be verified because git history lookup failed for: "+sourceFreshnessErrors.join(", "));
if(changedSourceFiles.length)errors.push("AI knowledge summaries are stale because grounding source files changed after the recorded review date: "+changedSourceFiles.join(", "));
if(allSitemapLocs.length!==sitemapPaths.length)errors.push("Sitemap contains one or more <loc> URLs outside the expected https://jawed.co.in/ origin or with an unsupported format.");
if(workflowMissing.length)errors.push("AI regression workflow trigger parity is incomplete for grounding source paths: "+workflowMissing.join(", "));
if(workflowDuplicatePaths.length)errors.push("AI regression workflow contains duplicate path filters: "+workflowDuplicatePaths.join(", "));
if(new Set(sitemapPaths).size!==sitemapPaths.length)errors.push("Sitemap contains duplicate URLs.");
if(duplicates.length)errors.push("AI knowledge contains duplicate URLs: "+[...new Set(duplicates)].join(", "));
if(missing.length)errors.push("Sitemap content pages missing from AI knowledge: "+missing.join(", "));
if(unexpected.length)errors.push("AI knowledge contains URLs not present in sitemap: "+unexpected.join(", "));
if(excludedIndexed.length)errors.push("Excluded paths are indexed: "+excludedIndexed.join(", "));
if(malformed.length)errors.push("AI knowledge contains malformed entries.");
if(unsafeUrls.length)errors.push("AI knowledge contains unsafe source URLs: "+unsafeUrls.map(entry=>entry.url).join(", "));
if(missingSourceFiles.length)errors.push("Sitemap grounding pages have no repository source file: "+missingSourceFiles.join(", "));
const MIN_SUMMARY_CHARS=70;
const shortSummaries=knowledge.entries.filter(entry=>typeof entry.summary!=="string"||entry.summary.trim().length<MIN_SUMMARY_CHARS);
if(shortSummaries.length)errors.push("AI knowledge summaries below "+MIN_SUMMARY_CHARS+" characters: "+shortSummaries.map(entry=>entry.title).join(", "));
if(typeof knowledge.coverage_policy?.summary_evidence_rule!=="string"||!knowledge.coverage_policy.summary_evidence_rule.includes("scope-level evidence"))errors.push("AI knowledge evidence boundary is not documented.");
if(runtimeKnowledge!==expectedRuntimeKnowledge)errors.push("Runtime AI knowledge copy is out of sync with assets/data/ai-knowledge.json; regenerate functions/lib/ai-knowledge-data.js.");
assert.equal(errors.length,0,errors.join("\n"));
console.log("AI knowledge coverage OK");
console.log("Sitemap URLs:",sitemapPaths.length);
console.log("Excluded:",excluded.size);
console.log("Grounding entries:",indexPaths.length);
console.log("Sitemap source files verified:",sitemapPaths.filter(path=>!excluded.has(path)).length);\nconsole.log("React tool routes verified against tool registry, renderer and router:",sitemapPaths.filter(path=>/^\\/tools\\/[a-z0-9-]+\\/$/.test(path)&&!excluded.has(path)).length);
console.log("Reviewed against sitemap:",knowledge.reviewed_against_sitemap_on||"not recorded");
console.log("Source freshness since review date: clean");
console.log("Primary-query priority over contextual source text exercised: yes");
console.log("Contextual source deduplication and unknown-path handling exercised: yes");
