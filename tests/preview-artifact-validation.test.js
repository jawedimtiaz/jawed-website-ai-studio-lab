import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { validatePreviewArtifact } from "../scripts/validate-preview-artifact.mjs";

const sha = "a".repeat(40);
const PRODUCTION_DB = "d9ec83ea-7114-4179-af8e-a22ba5494508";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-artifact-"));
  fs.mkdirSync(path.join(root, "dist"));
  fs.writeFileSync(path.join(root, "worker.js"), "export default {};");
  fs.writeFileSync(path.join(root, "dist/index.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "dist/app-routes.json"), '{"routes":[]}');
  const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
  fs.writeFileSync(path.join(root, "wrangler.jsonc"), JSON.stringify(config));
  const files = ["worker.js", "wrangler.jsonc", "dist/index.html", "dist/app-routes.json"].map((p) => ({
    path: p,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex")
  }));
  fs.writeFileSync(path.join(root, "preview-artifact-manifest.json"), JSON.stringify({ schema: 1, source_sha: sha, files }));
  return root;
}

test("accepts an intact SHA-pinned Preview artifact", () => {
  const root = fixture();
  assert.deepEqual(validatePreviewArtifact(root, sha), []);
});

test("rejects missing manifest", () => {
  const root = fixture();
  fs.rmSync(path.join(root, "preview-artifact-manifest.json"));
  assert.ok(validatePreviewArtifact(root, sha).some((x) => x.includes("Artifact manifest is missing")));
});

test("rejects missing required files on disk and absent from manifest", () => {
  const rootMissingOnDisk = fixture();
  fs.rmSync(path.join(rootMissingOnDisk, "dist/index.html"));
  assert.ok(validatePreviewArtifact(rootMissingOnDisk, sha).some((x) => x.includes("Manifest file missing: dist/index.html")));

  const rootAbsentFromManifest = fixture();
  fs.rmSync(path.join(rootAbsentFromManifest, "dist/app-routes.json"));
  const manifestPath = path.join(rootAbsentFromManifest, "preview-artifact-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.files = manifest.files.filter((entry) => entry.path !== "dist/app-routes.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.ok(validatePreviewArtifact(rootAbsentFromManifest, sha).some((x) => x.includes("Required file absent from manifest: dist/app-routes.json")));
});

test("rejects invalid manifest schema, empty file list, and invalid checksum entry", () => {
  const rootBadSchema = fixture();
  const mPath1 = path.join(rootBadSchema, "preview-artifact-manifest.json");
  const m1 = JSON.parse(fs.readFileSync(mPath1, "utf8"));
  m1.schema = 99;
  fs.writeFileSync(mPath1, JSON.stringify(m1));
  assert.ok(validatePreviewArtifact(rootBadSchema, sha).some((x) => x.includes("Unsupported artifact manifest schema")));

  const rootEmptyFiles = fixture();
  const mPath2 = path.join(rootEmptyFiles, "preview-artifact-manifest.json");
  const m2 = JSON.parse(fs.readFileSync(mPath2, "utf8"));
  m2.files = [];
  fs.writeFileSync(mPath2, JSON.stringify(m2));
  assert.ok(validatePreviewArtifact(rootEmptyFiles, sha).some((x) => x.includes("no file checksums")));

  const rootBadHash = fixture();
  const mPath3 = path.join(rootBadHash, "preview-artifact-manifest.json");
  const m3 = JSON.parse(fs.readFileSync(mPath3, "utf8"));
  m3.files[0].sha256 = "not-a-sha256";
  fs.writeFileSync(mPath3, JSON.stringify(m3));
  assert.ok(validatePreviewArtifact(rootBadHash, sha).some((x) => x.includes("Invalid checksum manifest entry")));
});

test("rejects invalid JSON/JSONC in manifest or wrangler config", () => {
  const rootBadManifestJson = fixture();
  fs.writeFileSync(path.join(rootBadManifestJson, "preview-artifact-manifest.json"), "{invalid json");
  assert.ok(validatePreviewArtifact(rootBadManifestJson, sha).some((x) => x.includes("Artifact manifest is missing or invalid JSON")));

  const rootBadWranglerJson = fixture();
  fs.writeFileSync(path.join(rootBadWranglerJson, "wrangler.jsonc"), "{ /* unclosed comment");
  assert.ok(validatePreviewArtifact(rootBadWranglerJson, sha).some((x) => x.includes("Artifact Wrangler config is missing or invalid JSON")));
});

test("rejects source SHA mismatch", () => {
  const root = fixture();
  assert.ok(validatePreviewArtifact(root, "b".repeat(40)).some((x) => x.includes("source SHA")));
});

test("rejects checksum tampering", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "worker.js"), "tampered");
  assert.ok(validatePreviewArtifact(root, sha).some((x) => x.includes("Checksum mismatch")));
});

test("rejects unsafe paths and symlinks inside artifact", () => {
  const rootTraversal = fixture();
  const p = path.join(rootTraversal, "preview-artifact-manifest.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.files.push({ path: "../escape", sha256: "0".repeat(64) });
  m.files.push({ path: "..\\backslash-escape", sha256: "0".repeat(64) });
  fs.writeFileSync(p, JSON.stringify(m));
  const pathErrors = validatePreviewArtifact(rootTraversal, sha);
  assert.ok(pathErrors.some((x) => x.includes("Unsafe artifact path: ../escape")));
  assert.ok(pathErrors.some((x) => x.includes("Unsafe artifact path: ..\\backslash-escape")));

  const rootSymlink = fixture();
  const outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "outside-target-"));
  fs.writeFileSync(path.join(outsideTarget, "secret.txt"), "do-not-bundle");
  const linkPath = path.join(rootSymlink, "dist/linked-dir");
  fs.symlinkSync(outsideTarget, linkPath, process.platform === "win32" ? "junction" : "dir");
  assert.ok(validatePreviewArtifact(rootSymlink, sha).some((x) => x.includes("Symlinks are not allowed")));
});

test("rejects duplicate manifest paths", () => {
  const root = fixture();
  const p = path.join(root, "preview-artifact-manifest.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.files.push({ ...m.files[0] });
  fs.writeFileSync(p, JSON.stringify(m));
  assert.ok(validatePreviewArtifact(root, sha).some((x) => x.includes("Duplicate artifact path")));
});

test("rejects Production D1 ID substitution in root or named preview environment", () => {
  const rootSub = fixture();
  const p1 = path.join(rootSub, "wrangler.jsonc");
  const c1 = JSON.parse(fs.readFileSync(p1, "utf8"));
  c1.d1_databases[0].database_id = PRODUCTION_DB;
  fs.writeFileSync(p1, JSON.stringify(c1));
  assert.ok(validatePreviewArtifact(rootSub, sha).some((x) => x.includes("Root D1 binding is not isolated Preview D1")));

  const namedSub = fixture();
  const p2 = path.join(namedSub, "wrangler.jsonc");
  const c2 = JSON.parse(fs.readFileSync(p2, "utf8"));
  c2.env.preview.d1_databases[0].database_id = PRODUCTION_DB;
  fs.writeFileSync(p2, JSON.stringify(c2));
  assert.ok(validatePreviewArtifact(namedSub, sha).some((x) => x.includes("Named Preview D1 mismatch")));
});

test("rejects Production rate-limit namespace substitution", () => {
  const root = fixture();
  const p = path.join(root, "wrangler.jsonc");
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.env.preview.ratelimits[0].namespace_id = "620261114";
  fs.writeFileSync(p, JSON.stringify(c));
  assert.ok(validatePreviewArtifact(root, sha).some((x) => x.includes("Preview rate-limit namespaces mismatch")));
});

test("rejects incorrect Worker name in root or named preview environment", () => {
  const rootWrongName = fixture();
  const p1 = path.join(rootWrongName, "wrangler.jsonc");
  const c1 = JSON.parse(fs.readFileSync(p1, "utf8"));
  c1.name = "jawed-website-ai-studio-lab";
  fs.writeFileSync(p1, JSON.stringify(c1));
  assert.ok(validatePreviewArtifact(rootWrongName, sha).some((x) => x.includes("Root Worker target")));

  const namedWrongName = fixture();
  const p2 = path.join(namedWrongName, "wrangler.jsonc");
  const c2 = JSON.parse(fs.readFileSync(p2, "utf8"));
  c2.env.preview.name = "jawed-website-ai-studio-lab";
  fs.writeFileSync(p2, JSON.stringify(c2));
  assert.ok(validatePreviewArtifact(namedWrongName, sha).some((x) => x.includes("Named Preview Worker mismatch")));
});

test("rejects unexpected artifact files in manifest and on disk", () => {
  const rootUnexpectedManifest = fixture();
  const mPath = path.join(rootUnexpectedManifest, "preview-artifact-manifest.json");
  const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  m.files.push({ path: "scripts/extra.js", sha256: "0".repeat(64) });
  fs.writeFileSync(mPath, JSON.stringify(m));
  assert.ok(validatePreviewArtifact(rootUnexpectedManifest, sha).some((x) => x.includes("Unexpected artifact path")));

  const rootUnexpectedDisk = fixture();
  fs.writeFileSync(path.join(rootUnexpectedDisk, "dist/rogue.js"), "console.log('unverified')");
  fs.writeFileSync(path.join(rootUnexpectedDisk, "unlisted-top.txt"), "extra");
  const diskErrors = validatePreviewArtifact(rootUnexpectedDisk, sha);
  assert.ok(diskErrors.some((x) => x.includes("Unexpected artifact file on disk: dist/rogue.js")));
  assert.ok(diskErrors.some((x) => x.includes("Unexpected artifact file on disk: unlisted-top.txt")));
});

test("manifest generator and CLI validator work end-to-end", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-cli-"));
  fs.mkdirSync(path.join(root, "dist"));
  fs.writeFileSync(path.join(root, "worker.js"), "export default {};");
  fs.writeFileSync(path.join(root, "dist/index.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "dist/app-routes.json"), '{"routes":[]}');
  fs.copyFileSync("wrangler.jsonc", path.join(root, "wrangler.jsonc"));

  execFileSync(process.execPath, [path.resolve("scripts/create-preview-artifact-manifest.mjs"), sha, root], {
    stdio: "pipe"
  });

  const okRun = spawnSync(process.execPath, [path.resolve("scripts/validate-preview-artifact.mjs"), root], {
    env: { ...process.env, EXPECTED_SHA: sha },
    encoding: "utf8"
  });
  assert.equal(okRun.status, 0, okRun.stderr);

  fs.writeFileSync(path.join(root, "dist/tampered.js"), "rogue");
  const failRun = spawnSync(process.execPath, [path.resolve("scripts/validate-preview-artifact.mjs"), root], {
    env: { ...process.env, EXPECTED_SHA: sha },
    encoding: "utf8"
  });
  assert.equal(failRun.status, 1);
  assert.match(failRun.stderr, /Unexpected artifact file on disk: dist\/tampered\.js/);
});
