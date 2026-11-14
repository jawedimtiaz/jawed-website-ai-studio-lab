#!/usr/bin/env node
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import {MAX_REQUESTS,WINDOW_MS} from "../functions/lib/ai-rate-limit.js";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {MAX_REPLY_CHARS}=require("../functions/lib/ai-provider-common.js");

const VALIDATOR_TIMEOUT_MS=15_000;
const checks=[
  ["AI UX conversation polish","scripts/validate-ai-ux-polish.mjs",/AI UX conversation polish validation: PASS/],
  ["AI knowledge expansion","scripts/validate-ai-knowledge-expansion.mjs",/AI knowledge expansion validation: PASS/],  ["AI integrated conversational answer quality","scripts/validate-ai-answer-quality.mjs",/AI integrated conversational answer-quality validation: PASS/],
  ["AI conversational context","scripts/validate-ai-context.mjs",/AI conversational context validation: PASS/],
  ["AI knowledge coverage","scripts/validate-ai-knowledge.mjs",/AI knowledge coverage OK/],
  ["AI natural-language intelligence","scripts/validate-ai-intelligence.mjs",/AI natural-language intelligence validation: PASS/],
  ["AI retrieval","scripts/validate-ai-retrieval.mjs",/AI retrieval context validation OK/],
  ["AI retrieval source-set relevance","scripts/validate-ai-relevance.mjs",/AI retrieval source-set relevance validation: PASS/],
  ["AI widget state regression","scripts/validate-ai-widget-state.mjs",/AI widget state regression validation: PASS/],
  ["AI surface parity","scripts/validate-ai-surface-parity.mjs",/AI surface parity regression validation: PASS/],
  ["AI production E2E harness safety","scripts/validate-ai-production-e2e-safety.mjs",/AI production E2E harness safety validation: PASS/],
  ["AI response/output contract","scripts/validate-ai-response.mjs",/AI response grounding\/link validation OK/],
  ["AI production readiness","scripts/validate-ai-production-readiness.mjs",/AI production configuration readiness validation OK/],
  ["AI live browser contract","scripts/validate-ai-live-operational.mjs",/AI live operational browser contract validation OK/],
  ["AI production observability","scripts/validate-ai-production-observability.mjs",/AI production observability contract: PASS/],
  ["AI production security/privacy","scripts/validate-ai-production-security.mjs",/AI production security\/privacy telemetry contract: PASS/],
  ["AI negative paths","scripts/validate-ai-negative-paths.mjs",/AI negative-path regression validation: PASS/],
  ["AI API handler behavior","scripts/validate-ai-api-handler.mjs",/AI API handler behavioral coverage: PASS/],
  ["AI provider contract behavior","scripts/validate-ai-provider-contract.mjs",/AI provider contract behavioral coverage: PASS/]
];

const EXCLUDED_VALIDATORS=new Set([
  "scripts/validate-ai-regression.mjs",
  "scripts/validate-ai-production-e2e.mjs"
]);
const discoveredValidators=fs.readdirSync("scripts")
  .filter(name=>/^validate-ai-.*\.mjs$/.test(name))
  .map(name=>"scripts/"+name)
  .filter(path=>!EXCLUDED_VALIDATORS.has(path))
  .sort();
const registeredValidators=checks.map(([,path])=>path).sort();
assert.deepEqual(
  registeredValidators,
  discoveredValidators,
  "Deterministic AI validator inventory does not match the regression matrix"
);
console.log("AI validator inventory: PASS");
console.log("Deterministic validators discovered:",discoveredValidators.length);
console.log("Explicitly excluded validators:",[...EXCLUDED_VALIDATORS].join(", "));

assert.equal(new Set(checks.map(([,path])=>path)).size,checks.length,"Regression matrix contains duplicate validator paths");

const MAX_DIAGNOSTIC_CHARS=4000;
const SENSITIVE_PATTERNS=[
  /(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
  /https?:\/\/[^\s]+/gi,
  /(?:<UNTRUSTED_[A-Z_]+>)[\s\S]*?(?:<\/UNTRUSTED_[A-Z_]+>)/g
];

function diagnosticOutput(error){
  const raw=String(error.stdout||"")+String(error.stderr||"")+String(error.message||"");
  const sanitized=SENSITIVE_PATTERNS.reduce((value,pattern)=>value.replace(pattern,"[redacted]"),raw).trim();
  return sanitized.length>MAX_DIAGNOSTIC_CHARS?sanitized.slice(0,MAX_DIAGNOSTIC_CHARS)+"…":sanitized;
}

function failureType(error){
  if(error?.code==="ETIMEDOUT"||error?.signal==="SIGTERM")return "TIMEOUT";
  if(error?.code==="ENOENT")return "EXECUTION_ERROR";
  return "VALIDATOR_FAILURE";
}

const failures=[];
for(const [name,path,completion] of checks){
  try{
    assert.equal(fs.existsSync(path),true,name+" validator is missing");
    const source=fs.readFileSync(path,"utf8");
    assert.equal(/assert\./.test(source),true,name+" validator must contain executable assertions");
    const output=execFileSync(process.execPath,[path],{stdio:"pipe",encoding:"utf8",timeout:VALIDATOR_TIMEOUT_MS});
    assert.match(output,completion,name+" validator did not emit its completion signal");
    console.log("PASS — "+name);
  }catch(error){
    failures.push({name,path,type:failureType(error),output:diagnosticOutput(error)});
    console.error("FAIL — "+name+" ["+failureType(error)+"]");
  }
}

const endpoint=fs.readFileSync("functions/api/ai.js","utf8");
const provider=fs.readFileSync("functions/lib/cloudflare-ai-provider.js","utf8");
const providerCommon=fs.readFileSync("functions/lib/ai-provider-common.js","utf8");
const frontend=fs.readFileSync("ai/index.html","utf8");
const aiStyles=fs.readFileSync("assets/css/style.css","utf8");
const rateLimit=fs.readFileSync("functions/lib/ai-rate-limit.js","utf8");
const knowledgeSource=fs.readFileSync("functions/lib/ai-knowledge.js","utf8");
const knowledgeDataSource=fs.readFileSync("functions/lib/ai-knowledge-data.js","utf8");

const contracts=[
  ["Cloudflare Worker-compatible AI knowledge loading",knowledgeSource.includes('import knowledge from "./ai-knowledge-data.js";')&&!knowledgeSource.includes('from "node:fs"')&&knowledgeDataSource.includes("export default knowledge")],
  ["server request-size boundary",/MAX_BODY_BYTES=\d+/.test(endpoint)],
  ["server message-count boundary",/MAX_MESSAGES=\d+/.test(endpoint)],
  ["server message-length boundary",/MAX_MESSAGE_CHARS=\d+/.test(endpoint)],
  ["same-site origin boundary",endpoint.includes("new URL(origin)")&&endpoint.includes('host==="jawed.co.in"||host.endsWith(".jawed.co.in")')&&endpoint.includes("return false")],
  ["rate-limit boundary",rateLimit.includes("MAX_REQUESTS="+MAX_REQUESTS)&&rateLimit.includes("WINDOW_MS="+WINDOW_MS)],
  ["server-side Workers AI binding",endpoint.includes("env.AI")&&provider.includes("ai.run")],
  ["fixed free-tier model boundary",endpoint.includes("model:DEFAULT_MODEL")&&!endpoint.includes("AI_PROVIDER_MODEL")&&provider.includes("FREE_MODEL=DEFAULT_MODEL")],
  ["safe Workers AI failure classification",provider.includes("PROVIDER_HTTP_")&&provider.includes("PROVIDER_UNKNOWN")&&provider.includes("PROVIDER_ATTRIBUTION")&&providerCommon.includes("PROVIDER_RESPONSE_VALIDATION")],
  ["safe provider diagnostic response",endpoint.includes("provider_category:diagnostic")&&endpoint.includes("provider_category")&&endpoint.includes("PROVIDER_UNKNOWN")&&endpoint.includes("HTTP_(?:4\\d\\d|5\\d\\d)")],
  ["provider no-storage architecture",!endpoint.includes("AI_PROVIDER_API_KEY")&&!provider.includes("api.openai.com")],
  ["untrusted conversation boundary",providerCommon.includes("<UNTRUSTED_CONVERSATION>")],
  ["untrusted source boundary",providerCommon.includes("<UNTRUSTED_SOURCE_METADATA>")],
  ["bounded provider output",providerCommon.includes("MAX_REPLY_CHARS="+MAX_REPLY_CHARS)&&provider.includes("max_tokens:MAX_OUTPUT_TOKENS")],
  ["Workers AI response extraction",provider.includes("result?.response")&&provider.includes("const reply=")],
  ["source attribution gate",providerCommon.includes("hasAllowedSourceLink")&&provider.includes("hasAllowedSourceLink")],
  ["public AI source metadata boundary",endpoint.includes("publicSourceReferences(sources)")&&endpoint.includes("return sources.map(({url,title})=>({url,title}))")&&endpoint.includes("sources:publicSourceReferences(responseSources)")],
  ["external markdown sanitization",providerCommon.includes("sanitizeMarkdownLinks")],
  ["safe browser rendering",frontend.includes("document.createTextNode")&&!frontend.includes("innerHTML")],
  ["structured source URL validation",frontend.includes('source.url.startsWith("/")')&&frontend.includes('source.url.startsWith("//")')&&frontend.includes('source.url.includes("\\\\")')],
  ["memory-only browser history",!frontend.includes("localStorage")&&!frontend.includes("sessionStorage")],
  ["AI deep-link consumed after submit",frontend.includes('cleanUrl.searchParams.delete("q")')&&frontend.includes("window.history.replaceState")],
  ["AI failure preserves the question",frontend.includes("Your question is still in the input box")&&frontend.includes("input.value=question")],
  ["AI source block renders only valid sources",frontend.includes("const validSources=sources.filter")&&frontend.includes("if(!validSources.length)return")],
  ["AI provider diagnostic display is allowlisted",frontend.includes("PROVIDER_(?:HTTP_(?:4\\d\\d|5\\d\\d)|TIMEOUT|NETWORK|INVALID_RESPONSE|RESPONSE_VALIDATION|ATTRIBUTION)")&&frontend.includes("PROVIDER_UNKNOWN")],
  ["AI retry reuses failed question message",frontend.includes("let retryMessage=null")&&frontend.includes("retryMessage.question!==question")&&frontend.includes("retryMessage=null;status.textContent=")],
  ["AI failure status clears when editing",frontend.includes('input.addEventListener("input",()=>{input.setCustomValidity("");if(f.getAttribute("aria-busy")!=="true")status.textContent=""})')],
  ["AI error branches use response code contract",frontend.includes('data?.code==="AI_NOT_CONFIGURED"')&&frontend.includes('data?.code==="AI_PROVIDER_ERROR"')&&frontend.includes('data?.code==="AI_RATE_LIMITED"')],
  ["AI network failure has explicit safe category",frontend.includes("NETWORK_REQUEST_FAILED")&&frontend.includes("Jawed AI request failed.")],
  ["AI network failure isolates health and POST stages",frontend.includes('fetch("/api/ai",{method:"GET"')&&frontend.includes("NETWORK_HEALTH_HTTP_FAILURE")&&frontend.includes("NETWORK_POST_REQUEST_FAILED")&&frontend.includes('cache:"no-store"')],
  ["AI whitespace-only question is rejected",frontend.includes('if(!question){if(input.value)input.setCustomValidity("Please enter a question.");input.reportValidity();return;}')],
  ["AI deep-link consumption preserves hash",frontend.includes("cleanUrl.hash") ],
  ["AI message line breaks are preserved",aiStyles.includes(".ai-message p{white-space:pre-wrap}") ],
  ["AI source citations render only allowlisted Jawed links",frontend.includes("const allowed=new Set")&&frontend.includes("allowed.has(match[2])")&&frontend.includes("https://jawed.co.in")],
];

assert.equal(endpoint.includes("source.summary")&&endpoint.includes("source.keywords")&&endpoint.includes("keywords.slice(0,40)"),true,"API must preserve provider grounding metadata");
assert.equal(!endpoint.includes("AI_PROVIDER_API_KEY"),true,"Production API must not depend on a paid OpenAI API key");
console.log("PASS — API preserves provider grounding metadata");

assert.equal(knowledgeDataSource.includes('"url":"/ai/"')||knowledgeDataSource.includes('"url": "/ai/"'),true,"AI knowledge must include the Jawed AI self-description source");
console.log("PASS — Jawed AI self-description source is indexed");

for(const [name,ok] of contracts){
  try{assert.equal(ok,true,name+" contract is missing");console.log("PASS — "+name);}
  catch(error){failures.push({name,output:error.message});console.error("FAIL — "+name);}
}

if(failures.length){
  console.error("\nAI regression matrix FAILED:");
  for(const failure of failures){console.error("\n"+failure.name+" ["+failure.type+"]");console.error(failure.output||"No diagnostic output captured.");}
  process.exit(1);
}

console.log("\nAI production regression matrix: PASS");
console.log("Validators executed:",checks.length);
console.log("Validator timeout:",VALIDATOR_TIMEOUT_MS+"ms");
console.log("Failure diagnostics bounded/redacted:",true);
console.log("Core contracts checked:",contracts.length);
console.log("Live provider E2E: not asserted by this matrix");
