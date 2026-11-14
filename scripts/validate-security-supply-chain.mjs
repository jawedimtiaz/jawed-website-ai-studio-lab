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
function walk(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if([".git","node_modules"].includes(e.name))continue;const f=path.join(dir,e.name);e.isDirectory()?out.push(...walk(f)):out.push(f)}return out}
const files=walk(root), rel=f=>path.relative(root,f).replaceAll(path.sep,"/");
const risky=/^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore))$/i;
for(const f of files){const n=rel(f);if(risky.test(path.basename(n))&&n!==".gitignore")fail("Secret-like tracked file: "+n)}
const ext=/\.(?:js|mjs|json|yml|yaml|html|css|txt|toml|conf|config)$/i, excluded=/^(?:docs\/|scripts\/validate-.*\.mjs$)/;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/,/\bAKIA[0-9A-Z]{16}\b/,/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,/\bAIza[0-9A-Za-z_-]{30,}\b/,/\bsk-[A-Za-z0-9_-]{20,}\b/,/\b(?:api[_-]?key|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*["'][^"']{20,}["']/i,/\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~-]{20,}/i];
for(const f of files){const n=rel(f);if(!ext.test(n)||excluded.test(n))continue;if(n==="firebase-applet-config.json")continue;const c=read(f);for(const p of patterns)if(p.test(c))fail("Credential-like literal in "+n)}
const firebaseConfigPath=path.join(root,"firebase-applet-config.json");
if(!fs.existsSync(firebaseConfigPath))fail("Missing Firebase client configuration");
else{
  try{
    const firebase=JSON.parse(read(firebaseConfigPath));
    const allowedKeys=new Set(["projectId","appId","apiKey","authDomain","firestoreDatabaseId","storageBucket","messagingSenderId","measurementId","oAuthClientId","recaptchaSiteKey"]);
    const keys=Object.keys(firebase);
    if(keys.some(key=>!allowedKeys.has(key))||[...allowedKeys].some(key=>!(key in firebase)))fail("Firebase client configuration contains unexpected or missing fields");
    for(const key of keys)if(typeof firebase[key]!=="string"||!firebase[key].trim())fail("Firebase client configuration field is invalid: "+key);
    if(typeof firebase.apiKey!=="string"||!/^AIza[0-9A-Za-z_-]{30,}$/.test(firebase.apiKey))fail("Firebase client API key format is invalid");
  }catch{fail("Firebase client configuration is not valid JSON")}
}
if(!fs.existsSync(path.join(root,".gitignore")))fail("Missing .gitignore");else{const g=read(path.join(root,".gitignore")).split(/\r?\n/);for(const r of [".env*",".dev.vars*","node_modules/"])if(!g.includes(r))fail("Missing .gitignore rule: "+r)}
if(!fs.existsSync(workflows))fail("Missing .github/workflows directory");else for(const file of fs.readdirSync(workflows).filter(f=>/\.ya?ml$/i.test(f))){const n=".github/workflows/"+file,c=read(path.join(workflows,file));if(/pull_request_target\s*:|workflow_run\s*:/m.test(c))fail(n+": elevated workflow trigger is not allowed");if(/\bsecrets\.[A-Za-z_][A-Za-z0-9_]*/.test(c))fail(n+": secret access is not allowed");if(!/^permissions:\s*\n\s+contents:\s+read\s*$/m.test(c))fail(n+": permissions must explicitly be contents: read");for(const m of c.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/gm))if(!/@[0-9a-f]{40}$/i.test(m[1]))fail(n+": action not pinned to full SHA: "+m[1]);const workflowLines=c.split(/\r?\n/);for(let i=0;i<workflowLines.length;i++){const match=workflowLines[i].match(/^([ \t]+)run:[ \t]*\|[ \t]*$/);if(!match)continue;const indent=match[1].length,block=[];for(let j=i+1;j<workflowLines.length;j++){const line=workflowLines[j];if(line.trim()&&(line.match(/^[ \t]*/)[0].length<=indent))break;block.push(line)}const b=block.join("\n");if(/github\.event\.(?:pull_request|issue|comment|review)\.(?:title|body|head|ref)|github\.head_ref|github\.event\.inputs\./.test(b))fail(n+": untrusted event data in shell");if(/(?:curl|wget)\s+[^\n|]+\|\s*(?:bash|sh)\b|\beval\s+/.test(b))fail(n+": remote shell execution pattern not allowed")}}const packageManifest=path.join(root,"package.json"),bunLock=path.join(root,"bun.lock");
if(!fs.existsSync(packageManifest))fail("Missing package.json dependency manifest");
if(!fs.existsSync(bunLock))fail("Missing bun.lock dependency lockfile");
if(fs.existsSync(packageManifest)){try{const pkg=JSON.parse(read(packageManifest));if(!pkg.scripts?.build)fail("package.json must define a reproducible build script");}catch{fail("package.json is not valid JSON")}}
if(failures.length){console.error("Security / supply-chain validation FAILED");failures.forEach(x=>console.error(" - "+x));process.exit(1)}
console.log("Security / supply-chain validation PASSED");console.log("Workflows checked: "+fs.readdirSync(workflows).filter(f=>/\.ya?ml$/i.test(f)).length);console.log("Tracked secret-like files: 0");console.log("Dependency manifest: package.json");console.log("Dependency lockfile: bun.lock");
