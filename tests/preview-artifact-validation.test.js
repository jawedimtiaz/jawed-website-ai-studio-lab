import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { validatePreviewArtifact } from "../scripts/validate-preview-artifact.mjs";

const sha = "a".repeat(40);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),"preview-artifact-"));
  fs.mkdirSync(path.join(root,"dist"));
  fs.writeFileSync(path.join(root,"worker.js"),"export default {};");
  fs.writeFileSync(path.join(root,"dist/index.html"),"<html></html>");
  fs.writeFileSync(path.join(root,"dist/app-routes.json"),'{"routes":[]}');
  const config = JSON.parse(fs.readFileSync("wrangler.jsonc","utf8"));
  fs.writeFileSync(path.join(root,"wrangler.jsonc"),JSON.stringify(config));
  const files=["worker.js","wrangler.jsonc","dist/index.html","dist/app-routes.json"].map(p=>({path:p,sha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(root,p))).digest("hex")}));
  fs.writeFileSync(path.join(root,"preview-artifact-manifest.json"),JSON.stringify({schema:1,source_sha:sha,files}));
  return root;
}
test("accepts an intact SHA-pinned Preview artifact",()=>{const root=fixture();assert.deepEqual(validatePreviewArtifact(root,sha),[]);});
test("rejects source SHA mismatch",()=>{const root=fixture();assert.ok(validatePreviewArtifact(root,"b".repeat(40)).some(x=>x.includes("source SHA")));});
test("rejects checksum tampering",()=>{const root=fixture();fs.writeFileSync(path.join(root,"worker.js"),"tampered");assert.ok(validatePreviewArtifact(root,sha).some(x=>x.includes("Checksum mismatch")));});
test("rejects Production Worker as root target",()=>{const root=fixture();const p=path.join(root,"wrangler.jsonc");const c=JSON.parse(fs.readFileSync(p));c.name="jawed-website-ai-studio-lab";fs.writeFileSync(p,JSON.stringify(c));assert.ok(validatePreviewArtifact(root,sha).some(x=>x.includes("Root Worker target")));});
test("rejects unsafe artifact paths",()=>{const root=fixture();const p=path.join(root,"preview-artifact-manifest.json");const m=JSON.parse(fs.readFileSync(p));m.files.push({path:"../escape",sha256:"0".repeat(64)});fs.writeFileSync(p,JSON.stringify(m));assert.ok(validatePreviewArtifact(root,sha).some(x=>x.includes("Unsafe artifact path")));});
