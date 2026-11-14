import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const contract=JSON.parse(read("config/deployment-runtime-contract.json"));
const smokeContract=JSON.parse(read("config/production-smoke-contract.json"));
const fail=[];
if(contract.production_origin!==smokeContract.production_origin) fail.push("deployment and production smoke production_origin values drifted");
if(contract.alternate_origin!==smokeContract.alternate_origin) fail.push("deployment and production smoke alternate_origin values drifted");
const isHttpsOrigin=value=>{if(typeof value!=="string"||!/^https:\/\//.test(value))return false;try{const url=new URL(value);return url.protocol==="https:"&&url.origin===value&&url.username===""&&url.password===""&&url.pathname==="/"&&url.search===""&&url.hash==="";}catch{return false;}};
if(!isHttpsOrigin(contract.production_origin)) fail.push("production_origin must be an origin-only HTTPS URL");
if(!isHttpsOrigin(contract.alternate_origin)) fail.push("alternate_origin must be an origin-only HTTPS URL");
if(typeof contract.functions_directory!=="string"||!contract.functions_directory.trim()) fail.push("functions_directory must be non-empty");
if(!Array.isArray(contract.required_runtime_files)||contract.required_runtime_files.length<1||contract.required_runtime_files.some(file=>typeof file!=="string"||!file.trim()||path.isAbsolute(file)||file.split("/").includes(".."))) fail.push("required_runtime_files must contain safe relative file paths");
if(!Array.isArray(contract.api_routes)||contract.api_routes.some(route=>typeof route!=="string"||!route.startsWith("/"))) fail.push("api_routes must contain absolute paths");
if(!Array.isArray(contract.required_security_headers)||contract.required_security_headers.length<1||contract.required_security_headers.some(header=>typeof header!=="string"||!header.trim())) fail.push("required_security_headers must contain non-empty strings");
if(typeof contract.required_route_configuration!=="object"||contract.required_route_configuration===null) fail.push("required_route_configuration must be declared");


const exists=p=>fs.existsSync(path.join(root,p));
for(const p of contract.required_runtime_files){
  if(!exists(p)) fail.push(`missing required runtime file: ${p}`);
  else if(!fs.statSync(path.join(root,p)).isFile()) fail.push(`required runtime path is not a file: ${p}`);
}
if(!exists(contract.functions_directory)) fail.push(`missing functions directory: ${contract.functions_directory}`);
else if(!fs.statSync(path.join(root,contract.functions_directory)).isDirectory()) fail.push(`functions_directory is not a directory: ${contract.functions_directory}`);

const headers=read("_headers");
for(const required of (contract.required_security_headers||[])) if(!headers.includes(required)) fail.push(`production headers missing required baseline: ${required}`);

const routes=JSON.parse(read("_routes.json"));
const routeContract=contract.required_route_configuration||{};
if(routes.version!==routeContract.version) fail.push("_routes.json version drifted from deployment contract");
if(JSON.stringify(routes.include)!==JSON.stringify(routeContract.include)) fail.push("_routes.json include rules drifted from deployment contract");
if(JSON.stringify(routes.exclude||[])!==JSON.stringify(routeContract.exclude||[])) fail.push("_routes.json exclude rules drifted from deployment contract");
for(const apiRoute of (contract.api_routes||[])) if(!(routes.include||[]).some(rule=>rule==="/*"||rule===apiRoute||rule===apiRoute+"/*"||rule.endsWith("*")&&apiRoute.startsWith(rule.slice(0,-1)))) fail.push(`declared API route is not covered by _routes.json include rules: ${apiRoute}`);

if(!Array.isArray(contract.allowed_redirect_statuses)||contract.allowed_redirect_statuses.length<1||!contract.allowed_redirect_statuses.every(status=>Number.isInteger(status)&&status>=100&&status<=599)) fail.push("deployment redirect status policy must be a non-empty valid HTTP status array");
const redirects=read("_redirects");
for(const line of redirects.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#"))){
  const parts=line.trim().split(/\s+/);
  if(parts.length>=3 && !contract.allowed_redirect_statuses.includes(Number(parts.at(-1)))) fail.push(`unexpected redirect status: ${line}`);
}

const index=read("index.html");
if(contract.canonical_origin_must_be_exact && !index.includes(`<link rel="canonical" href="${contract.production_origin}/"`)) fail.push("index canonical origin must match production origin");

const sitemap=read("sitemap.xml");
if(!sitemap.includes(contract.production_origin)) fail.push("sitemap must use the production origin");
if(sitemap.includes(contract.alternate_origin)) fail.push("sitemap must not contain the alternate origin");

const ai=read("functions/api/ai.js");

if(!ai.includes(`origin==="${contract.production_origin}"`)&&!(ai.includes("isAllowedOrigin")&&ai.includes("jawed.co.in"))) fail.push("AI API must allow the production origin");

const allowedManifests = new Set(contract.allowed_package_manifests || []);
for(const p of ["package-lock.json","pnpm-lock.yaml","yarn.lock"]) if(exists(p)) fail.push(`unexpected lockfile: ${p}`);
if(contract.no_package_manifest_required && exists("package.json")) fail.push("unexpected package manifest: package.json");
else if(!contract.no_package_manifest_required && !allowedManifests.has("package.json") && exists("package.json")) fail.push("unexpected unvetted package manifest: package.json");
if(!contract.build_command && !contract.external_deployment_provider) fail.push("deployment contract must identify external deployment provider");

if(fail.length){
  console.error("Deployment Runtime Reliability Gate FAILED");
  for(const item of fail) console.error("- "+item);
  process.exit(1);
}
console.log("Deployment Runtime Reliability Gate PASSED");
console.log(`Production origin: ${contract.production_origin}`);
console.log(`Deployment model: ${contract.deployment_model}`);
console.log(`Functions directory: ${contract.functions_directory}`);
console.log(`API boundary: ${routes.include.join(", ")}`);
