import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PREVIEW = {
  worker: "jawed-website-ai-studio-lab-preview",
  database: "623a828d-2909-47e7-a228-130b4eeefef5",
  databaseName: "jawed-studio-hq-preview",
  origin: "https://preview.lab.jawed.co.in",
  limiters: ["620261117","620261118","620261119"]
};
const PRODUCTION = {
  worker: "jawed-website-ai-studio-lab",
  database: "d9ec83ea-7114-4179-af8e-a22ba5494508",
  origin: "https://lab.jawed.co.in",
  limiters: ["620261114","620261115","620261116"]
};

export function validatePreviewArtifact(root, expectedSha) {
  const errors = [];
  const fail = (condition, message) => { if (condition) errors.push(message); };
  fail(!/^[a-f0-9]{40}$/.test(expectedSha || ""), "Expected source SHA must be 40 lowercase hexadecimal characters.");
  let manifest, config;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root,"preview-artifact-manifest.json"),"utf8")); }
  catch { errors.push("Artifact manifest is missing or invalid JSON."); }
  try { config = JSON.parse(fs.readFileSync(path.join(root,"wrangler.jsonc"),"utf8")); }
  catch { errors.push("Artifact Wrangler config is missing or invalid JSON."); }
  if (!manifest || !config) return errors;
  fail(manifest.schema !== 1, "Unsupported artifact manifest schema.");
  fail(manifest.source_sha !== expectedSha, "Artifact source SHA does not match the requested SHA.");
  fail(!Array.isArray(manifest.files) || manifest.files.length === 0, "Artifact manifest has no file checksums.");
  const seen = new Set();
  for (const item of manifest.files || []) {
    if (!item || typeof item.path !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256 || "")) { errors.push("Invalid checksum manifest entry."); continue; }
    const normalized = path.posix.normalize(item.path);
    if (normalized !== item.path || normalized.startsWith("../") || path.isAbsolute(normalized) || normalized === "preview-artifact-manifest.json") { errors.push("Unsafe artifact path: " + item.path); continue; }
    if (!["worker.js","wrangler.jsonc","dist"].includes(normalized.split("/")[0])) { errors.push("Unexpected artifact path: " + item.path); continue; }
    if (seen.has(normalized)) { errors.push("Duplicate artifact path: " + item.path); continue; }
    seen.add(normalized);
    const target = path.join(root, ...normalized.split("/"));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { errors.push("Manifest file missing: " + item.path); continue; }
    const digest = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
    if (digest !== item.sha256) errors.push("Checksum mismatch: " + item.path);
  }
  for (const required of ["worker.js","wrangler.jsonc","dist/index.html","dist/app-routes.json"]) fail(!seen.has(required), "Required file absent from manifest: " + required);
  fail(config.name !== PREVIEW.worker, "Root Worker target is not Preview.");
  fail(config.main !== "worker.js", "Worker entrypoint must be worker.js.");
  fail(config.assets?.directory !== "./dist" || config.assets?.binding !== "ASSETS", "Assets binding/directory mismatch.");
  fail(config.assets?.not_found_handling !== "none", "Preview must use not_found_handling=none.");
  fail(JSON.stringify(config.assets?.run_worker_first) !== JSON.stringify(["/*","!/assets/*"]), "Preview Worker-first routing mismatch.");
  fail(config.vars?.ENVIRONMENT !== "preview" || config.vars?.CANONICAL_ORIGIN !== PREVIEW.origin, "Root environment/origin mismatch.");
  fail(config.d1_databases?.length !== 1 || config.d1_databases?.[0]?.database_id !== PREVIEW.database || config.d1_databases?.[0]?.database_name !== PREVIEW.databaseName || config.d1_databases?.[0]?.binding !== "HQ_DB", "Root D1 binding is not isolated Preview D1.");
  const preview = config.env?.preview;
  fail(preview?.name !== PREVIEW.worker, "Named Preview Worker mismatch.");
  fail(preview?.vars?.ENVIRONMENT !== "preview" || preview?.vars?.CANONICAL_ORIGIN !== PREVIEW.origin, "Named Preview environment/origin mismatch.");
  fail(preview?.d1_databases?.length !== 1 || preview?.d1_databases?.[0]?.database_id !== PREVIEW.database, "Named Preview D1 mismatch.");
  fail(JSON.stringify((preview?.ratelimits || []).map(x=>x.namespace_id)) !== JSON.stringify(PREVIEW.limiters), "Preview rate-limit namespaces mismatch.");
  fail(config.env?.production?.name !== PRODUCTION.worker, "Production isolation declaration mismatch.");
  fail(config.env?.production?.vars?.CANONICAL_ORIGIN !== PRODUCTION.origin, "Production canonical origin mismatch.");
  fail(config.env?.production?.d1_databases?.[0]?.database_id !== PRODUCTION.database, "Production D1 declaration mismatch.");
  fail(JSON.stringify((config.env?.production?.ratelimits || []).map(x=>x.namespace_id)) !== JSON.stringify(PRODUCTION.limiters), "Production rate-limit namespace declaration mismatch.");
  fail(Array.isArray(config.routes) && config.routes.length > 0, "Custom routes are prohibited.");
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(process.argv[2] || "preview-artifact");
  const errors = validatePreviewArtifact(root, process.env.EXPECTED_SHA);
  if (errors.length) { console.error("Preview artifact validation FAILED"); errors.forEach(e=>console.error("- "+e)); process.exit(1); }
  console.log("Preview artifact provenance, checksums and isolation validation PASSED.");
}
