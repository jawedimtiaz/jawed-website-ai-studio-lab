#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const headers=fs.readFileSync("_headers","utf8");
const redirects=fs.readFileSync("_redirects","utf8");
const routes=JSON.parse(fs.readFileSync("_routes.json","utf8"));
const deploymentContract=JSON.parse(fs.readFileSync("config/deployment-runtime-contract.json","utf8"));
const deploymentHeaders=deploymentContract.required_security_headers;
assert.equal(Array.isArray(deploymentHeaders)&&deploymentHeaders.length>0,true,"Deployment security-header contract must be non-empty");
assert.equal(deploymentHeaders.every(value=>typeof value==="string"&&value.trim().length>0),true,"Deployment security-header contract must contain non-empty strings");


const requiredHeaders=[
  "X-Frame-Options: DENY",
  "Cross-Origin-Opener-Policy: same-origin",
  "X-Content-Type-Options: nosniff",
  "X-Permitted-Cross-Domain-Policies: none",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "Permissions-Policy: geolocation=(), microphone=(), camera=()",
  "Strict-Transport-Security: max-age=31536000",
  "Content-Security-Policy:"
];
for(const contract of requiredHeaders)assert.equal(headers.includes(contract),true,"Security header contract missing: "+contract);

const csp=headers.match(/Content-Security-Policy:\s*([^\n]+)/)?.[1]||"";
for(const directive of ["default-src 'self'","base-uri 'self'","frame-ancestors 'none'","frame-src 'self' https://refined-actor-skhlb.firebaseapp.com","form-action 'self' mailto:","object-src 'none'","script-src ","worker-src ","connect-src ","img-src ","style-src ","font-src "]){
  assert.equal(csp.includes(directive),true,"CSP directive missing: "+directive);
}
assert.equal(csp.includes("https://www.googletagmanager.com"),true,"CSP must retain the deferred analytics tag-manager origin");
assert.equal(csp.includes("https://www.google-analytics.com"),true,"CSP must retain the analytics collection origin");
assert.equal(csp.includes("https://cdnjs.cloudflare.com"),true,"CSP must retain the approved PDF reader resource origin");
assert.equal(csp.includes("https://adsbygoogle"),false,"AdSense runtime must remain absent before Google Ready");
assert.equal(csp.includes("unsafe-eval"),false,"CSP must not permit unsafe-eval");
assert.equal(csp.includes("frame-ancestors 'none'"),true,"CSP must prevent framing");

assert.equal(routes.version,1,"_routes.json version must remain supported");
assert.deepEqual(routes.include,["/api/*"],"_routes.json must keep API-only function routing");
assert.deepEqual(routes.exclude,[],"_routes.json must not silently exclude API routes");

assert.equal(Array.isArray(deploymentContract.allowed_redirect_statuses),true,"Deployment redirect status policy must be declared");
assert.equal(deploymentContract.allowed_redirect_statuses.every(Number.isInteger),true,"Deployment redirect status policy must contain integers");
const redirectLines=redirects.split(/\r?\n/).filter(line=>line.trim()&&!line.trim().startsWith("#"));
for(const line of redirectLines){
  const parts=line.trim().split(/\s+/);
  if(parts.length<3)continue;
  const status=Number(parts.at(-1));
  assert.equal(deploymentContract.allowed_redirect_statuses.includes(status),true,"Unexpected redirect status in _redirects: "+line);
}

assert.equal(fs.existsSync("404.html"),true,"Custom 404 boundary must remain present");
assert.equal(fs.existsSync("sitemap.xml"),true,"Sitemap must remain present");

console.log("Security baseline: PASS");
console.log("Security headers and CSP: PASS");
console.log("API routing boundary: PASS");
console.log("Redirect policy syntax: PASS");
console.log("Pre-activation AdSense boundary: PASS");
console.log("Custom 404 and sitemap presence: PASS");
