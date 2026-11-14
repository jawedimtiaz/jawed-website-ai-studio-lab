import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), failures=[], workflows=path.join(root,".github","workflows");
const read=f=>fs.readFileSync(f,"utf8"), fail=m=>failures.push(m);
const contractPath=path.join(root,"config","security-supply-chain-contract.json");
if(!fs.existsSync(contractPath)) throw new Error("Missing Phase 38C contract");
const contract=JSON.parse(read(contractPath));
if(contract.phase!=="38C")failures.push("security supply-chain contract phase must be 38C");
if(contract.status!=="active")failures.push("security supply-chain contract must remain active");
if(contract.scope!=="repository-source-and-github-actions")failures.push("security supply-chain scope drifted");
if(typeof contract.controls!=="object"||contract.controls===null)failures.push("security supply-chain controls must be declared");
function walk(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if([".git","node_modules","dist"].includes(e.name))continue;const f=path.join(dir,e.name);e.isDirectory()?out.push(...walk(f)):out.push(f)}return out}
const files=walk(root), rel=f=>path.relative(root,f).replaceAll(path.sep,"/");
const risky=/^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore))$/i;
for(const f of files){const n=rel(f);if(risky.test(path.basename(n))&&n!==".gitignore")fail("Secret-like tracked file: "+n)}
const ext=/\.(?:js|mjs|json|yml|yaml|html|css|txt|toml|conf|config)$/i, excluded=/^(?:docs\/|scripts\/validate-.*\.mjs$)/;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/,/\bAKIA[0-9A-Z]{16}\b/,/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,/\bAIza[0-9A-Za-z_-]{30,}\b/,/\bsk-[A-Za-z0-9_-]{20,}\b/,/\b(?:api[_-]?key|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*["'][^"']{20,}["']/i,/\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~-]{20,}/i];
for(const f of files){
  const n=rel(f);
  if(!ext.test(n)||excluded.test(n))continue;
  const c=read(f);
  if(n==="firebase-applet-config.json"){
    let parsed;
    try{parsed=JSON.parse(c)}catch{fail("Invalid JSON in "+n);continue}
    const allowedFields=new Set(["projectId","appId","apiKey","authDomain","firestoreDatabaseId","storageBucket","messagingSenderId","measurementId","oAuthClientId","recaptchaSiteKey","databaseURL"]);
    const forbiddenFieldPattern=/client[_-]?secret|password|private[_-]?key|secret|token|credential/i;
    for(const key of Object.keys(parsed)){
      if(forbiddenFieldPattern.test(key)||!allowedFields.has(key))fail("Unexpected credential-like field in "+n+": "+key);
    }
    if(typeof parsed.apiKey!=="string"||!patterns[5].test(parsed.apiKey))fail("Missing or invalid public apiKey in "+n);
    const privateKeyPatterns=[patterns[0],patterns[1],patterns[2],patterns[3],patterns[4],patterns[6],patterns[8]];
    for(const p of privateKeyPatterns)if(p.test(c))fail("Private credential literal in "+n);
    const secretAssignmentPattern=/\b(?:client[_-]?secret|password|private[_-]?key)\s*[:=]\s*["'][^"']{20,}["']/i;
    if(secretAssignmentPattern.test(c))fail("Prohibited credential assignment in "+n);
    for(const [k,v] of Object.entries(parsed)){
      if(k!=="apiKey"&&typeof v==="string"&&patterns[5].test(v))fail("Unexpected credential-like value in field "+k+" of "+n);
    }
    const sanitized=c.replace(/"apiKey"\s*:\s*"AIza[0-9A-Za-z_-]{30,}"/,'"apiKey":"REDACTED"');
    for(const p of patterns)if(p.test(sanitized))fail("Credential-like literal in "+n);
    continue;
  }
  for(const p of patterns)if(p.test(c))fail("Credential-like literal in "+n);
}
if(!fs.existsSync(path.join(root,".gitignore")))fail("Missing .gitignore");else{const g=read(path.join(root,".gitignore")).split(/\r?\n/);for(const r of [".env*",".dev.vars*","node_modules/"])if(!g.includes(r))fail("Missing .gitignore rule: "+r)}
if(!fs.existsSync(workflows))fail("Missing .github/workflows directory");else for(const file of fs.readdirSync(workflows).filter(f=>/\.ya?ml$/i.test(f))){const n=".github/workflows/"+file,c=read(path.join(workflows,file));if(/pull_request_target\s*:|workflow_run\s*:/m.test(c))fail(n+": elevated workflow trigger is not allowed");const secretRefs=[...c.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m=>m[1]);const allowedDeploymentSecrets=["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"];if(n===".github/workflows/manual-studio-hq-worker-deploy.yml"){if(secretRefs.some(name=>!allowedDeploymentSecrets.includes(name))||allowedDeploymentSecrets.some(name=>!secretRefs.includes(name)))fail(n+": only the two required Cloudflare deployment secrets may be referenced");}else if(secretRefs.length)fail(n+": secret access is not allowed");if(!/^permissions:\s*\n\s+contents:\s+read\s*$/m.test(c))fail(n+": permissions must explicitly be contents: read");for(const m of c.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/gm))if(!/@[0-9a-f]{40}$/i.test(m[1]))fail(n+": action not pinned to full SHA: "+m[1]);const workflowLines=c.split(/\r?\n/);for(let i=0;i<workflowLines.length;i++){const match=workflowLines[i].match(/^([ \t]+)run:[ \t]*\|[ \t]*$/);if(!match)continue;const indent=match[1].length,block=[];for(let j=i+1;j<workflowLines.length;j++){const line=workflowLines[j];if(line.trim()&&(line.match(/^[ \t]*/)[0].length<=indent))break;block.push(line)}const b=block.join("\n");if(/github\.event\.(?:pull_request|issue|comment|review)\.(?:title|body|head|ref)|github\.head_ref|github\.event\.inputs\./.test(b))fail(n+": untrusted event data in shell");if(/(?:curl|wget)\s+[^\n|]+\|\s*(?:bash|sh)\b|\beval\s+/.test(b))fail(n+": remote shell execution pattern not allowed")}}const allowedManifests=new Set(contract.allowed_dependency_manifests||[]);
const lockfiles=files.filter(f=>/^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(rel(f)));
if(lockfiles.length)fail("Unexpected lockfile detected: "+lockfiles.map(rel).join(", "));
const manifests=files.filter(f=>rel(f)==="package.json");
if(manifests.some(f=>!allowedManifests.has(rel(f))))fail("Unexpected dependency manifest detected: "+manifests.map(rel).join(", "));if(failures.length){console.error("Security / supply-chain validation FAILED");failures.forEach(x=>console.error(" - "+x));process.exit(1)}
const acceptedManifests=manifests.map(rel).filter(m=>allowedManifests.has(m));
console.log("Security / supply-chain validation PASSED");console.log("Workflows checked: "+fs.readdirSync(workflows).filter(f=>/\.ya?ml$/i.test(f)).length);console.log("Tracked secret-like files: 0");console.log("Dependency manifest: "+(acceptedManifests.length?acceptedManifests.join(", "):"none"));
