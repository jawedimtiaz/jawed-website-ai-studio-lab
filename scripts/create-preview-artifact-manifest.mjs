import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [,, expectedSha, rootArg="."] = process.argv;
if (!/^[a-f0-9]{40}$/.test(expectedSha || "")) throw new Error("A 40-character source commit SHA is required.");
const root = path.resolve(rootArg);
const allowedRoots = new Set(["worker.js", "wrangler.jsonc", "dist"]);
const files = [];

function walk(dir, relative="") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel = relative ? path.posix.join(relative, entry.name) : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in Preview artifacts: " + rel);
    if (entry.isDirectory()) walk(abs, rel);
    else if (entry.isFile()) {
      if (!allowedRoots.has(rel.split("/")[0])) throw new Error("Unexpected artifact path: " + rel);
      files.push({ path: rel, sha256: crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex") });
    } else throw new Error("Unsupported artifact entry: " + rel);
  }
}
for (const required of ["worker.js","wrangler.jsonc","dist/index.html","dist/app-routes.json"]) {
  if (!fs.existsSync(path.join(root, required))) throw new Error("Required artifact file missing: " + required);
}
walk(root);
const manifest = { schema: 1, source_sha: expectedSha, files };
fs.writeFileSync(path.join(root, "preview-artifact-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Preview artifact manifest created for " + expectedSha + " (" + files.length + " files).");
