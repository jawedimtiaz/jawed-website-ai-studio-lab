#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint=fs.readFileSync("functions/api/ai.js","utf8");
const frontend=fs.readFileSync("ai/index.html","utf8");
const rateLimit=fs.readFileSync("functions/lib/ai-rate-limit.js","utf8");
const docs=fs.readFileSync("docs/ai-production-observability.md","utf8");

const nextFnIndex = endpoint.indexOf("function isAllowedOrigin") !== -1 ? endpoint.indexOf("function isAllowedOrigin") : endpoint.indexOf("function allowedOrigin");
const failureFactory = endpoint.slice(endpoint.indexOf("const failure="), nextFnIndex);
assert.equal(failureFactory.includes("request_id:id"),true,"Failure responses must expose only a correlation ID, not request data");
assert.equal(failureFactory.includes("messages"),false,"Failure responses must not include conversation messages");
assert.equal(failureFactory.includes("apiKey"),false,"Failure responses must not include provider credentials");
assert.equal(failureFactory.includes("authorization"),false,"Failure responses must not include authorization data");
assert.equal(failureFactory.includes("sources"),false,"Generic failure responses must not expose retrieval metadata");

const logLines=endpoint.split("\n").filter(line=>line.includes("console."));
for(const forbidden of ["messages","apiKey","authorization","source","summary","raw"]){
  assert.equal(logLines.some(line=>line.includes(forbidden)),false,"Runtime telemetry must not log "+forbidden);
}

assert.equal(endpoint.includes('requestId=()=>crypto.randomUUID()'),true,"Request IDs must be server-generated");
assert.equal(endpoint.includes('"x-request-id":id'),true,"Request IDs must be returned through a response header");
assert.equal(endpoint.includes("retry_after:limit.retryAfter"),true,"Rate-limit telemetry may expose retry timing only");
assert.equal(rateLimit.includes("cf-connecting-ip"),true,"Rate limiting must continue to use the platform client IP signal");
assert.equal(rateLimit.includes("anonymous"),true,"Rate limiting must retain an anonymous fallback");

assert.equal(frontend.includes("data.reply"),true,"Frontend must render the assistant reply");
assert.equal(frontend.includes("data.request_id"),false,"Frontend must not render or persist request IDs");
assert.equal(frontend.includes("localStorage"),false,"AI conversation must remain memory-only");
assert.equal(frontend.includes("sessionStorage"),false,"AI conversation must remain memory-only");
assert.equal(frontend.includes("document.createTextNode"),true,"Assistant output must use safe DOM text-node rendering");
assert.equal(frontend.includes("const allowed=new Set"),true,"Assistant source links must be explicitly allowlisted");
assert.equal(frontend.includes("allowed.has(match[2])"),true,"Assistant source links must require an exact allowlist match");
assert.equal(frontend.includes('link.href=source.url'),true,"Structured source URLs remain the navigation contract");

assert.equal(docs.includes("not authentication tokens"),true,"Request IDs must be documented as non-secret correlation IDs");
assert.equal(docs.includes("API keys"),true,"Credential exclusion must remain documented");

console.log("AI production security/privacy telemetry contract: PASS");
