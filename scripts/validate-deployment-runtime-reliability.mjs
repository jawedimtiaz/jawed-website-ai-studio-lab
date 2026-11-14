import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));
const contract=JSON.parse(read("config/deployment-runtime-contract.json"));
const failures=[];
const fail=message=>failures.push(message);
const isHttpsOrigin=value=>{
  if(typeof value!=="string"||!/^https:\/\//.test(value))return false;
  try{
    const url=new URL(value);
    return url.protocol==="https:"&&url.origin===value&&url.username===""&&url.password===""&&url.pathname==="/"&&url.search===""&&url.hash==="";
  }catch{return false;}
};

if(contract.deployment_model!=="cloudflare-worker")fail("deployment_model must identify Cloudflare Workers");
if(typeof contract.worker_name!=="string"||!contract.worker_name.trim())fail("worker_name must be declared");
if(contract.entrypoint!=="worker.js")fail("entrypoint must match the Worker entrypoint");
if(contract.wrangler_config!=="wrangler.jsonc")fail("wrangler_config must identify the active Wrangler config");
if(contract.build_command!=="bun run build")fail("build_command must match the repository build script");
if(!isHttpsOrigin(contract.lab_origin))fail("lab_origin must be an origin-only HTTPS URL");
if(!isHttpsOrigin(contract.content_canonical_origin))fail("content_canonical_origin must be an origin-only HTTPS URL");
if(contract.assets_binding!=="ASSETS")fail("assets_binding must be ASSETS");
if(contract.assets_directory!=="./dist")fail("assets_directory must be ./dist");
if(!Array.isArray(contract.required_runtime_files)||contract.required_runtime_files.length<1)fail("required_runtime_files must be declared");
if(!Array.isArray(contract.api_routes)||contract.api_routes.length<1)fail("api_routes must be declared");

for(const file of contract.required_runtime_files||[]){
  if(typeof file!=="string"||!file.trim()||path.isAbsolute(file)||file.split("/").includes(".."))fail("required_runtime_files contains an unsafe path");
  else if(!exists(file)||!fs.statSync(path.join(root,file)).isFile())fail("missing required Worker runtime file: "+file);
}
if(!exists("package.json")||!exists("bun.lock"))fail("Bun dependency manifest and lockfile are required");
else{
  const pkg=JSON.parse(read("package.json"));
  if(pkg.scripts?.build!==contract.build_script)fail("package.json build script differs from deployment contract");
}

const wrangler=JSON.parse(read(contract.wrangler_config));
if(wrangler.name!==contract.worker_name)fail("Wrangler Worker name differs from deployment contract");
if(wrangler.main!==contract.entrypoint)fail("Wrangler entrypoint differs from deployment contract");
if(wrangler.assets?.directory!==contract.assets_directory)fail("Wrangler assets directory differs from deployment contract");
if(wrangler.assets?.binding!==contract.assets_binding)fail("Wrangler assets binding differs from deployment contract");

const worker=read(contract.entrypoint);
if(!worker.includes("env?.ASSETS?.fetch"))fail("Worker must serve static assets through the declared Assets binding");
if(!worker.includes("const SECURITY_HEADERS"))fail("Worker security header policy is missing");
for(const route of contract.api_routes||[]){
  if(!worker.includes("'"+route+"'")&&!worker.includes('"'+route+'"')&&!worker.includes("startsWith('"+route+"/'")&&!worker.includes('startsWith("'+route+'/"'))fail("Worker route dispatcher does not reference declared API route: "+route);
}
const headers=worker.slice(worker.indexOf("const SECURITY_HEADERS"),worker.indexOf("};",worker.indexOf("const SECURITY_HEADERS"))+2);
for(const required of contract.required_worker_security_headers||[]){
  const [name,value]=required.split(/:\s*/,2);
  if(!headers.includes("'"+name+"'")&&!headers.includes('"'+name+'"'))fail("Worker security header is missing: "+name);
  if(value&&!headers.includes(value))fail("Worker security header value is missing: "+name);
}
const index=read("index.html");
if(contract.content_canonical_origin_must_be_exact&&!index.includes('<link rel="canonical" href="'+contract.content_canonical_origin+'/'))fail("content canonical origin must remain the declared personal-site canonical origin");
const ai=read("functions/api/ai.js");
if(contract.api_origin_policy==="jawed.co.in-and-subdomains"&&!ai.includes('host==="jawed.co.in"||host.endsWith(".jawed.co.in")'))fail("AI API origin policy must allow the jawed.co.in host and its subdomains");
if(contract.deployment_scope!=="Studio HQ Lab Worker only; no personal-site or Kaushal deployment")fail("deployment scope must explicitly exclude personal-site and Kaushal deployments");

if(failures.length){
  console.error("Studio HQ Cloudflare Worker Runtime Gate FAILED");
  for(const item of failures)console.error("- "+item);
  process.exit(1);
}
console.log("Studio HQ Cloudflare Worker Runtime Gate PASSED");
console.log("Worker: "+contract.worker_name);
console.log("Lab origin: "+contract.lab_origin);
console.log("Entrypoint: "+contract.entrypoint);
console.log("Assets: "+contract.assets_binding+" -> "+contract.assets_directory);
console.log("Deployment scope: Studio HQ Lab only");
