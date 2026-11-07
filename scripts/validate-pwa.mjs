import fs from "node:fs";

const fail = [];
const exists = (path) => fs.existsSync(path);
const read = (path) => fs.readFileSync(path, "utf8");
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) fail.push(message);
};

if (!exists("manifest.json")) fail.push("Missing manifest.json");
if (!exists("service-worker.js")) fail.push("Missing service-worker.js");
if (!exists("offline.html")) fail.push("Missing offline.html");
if (!exists("assets/icons/pwa-192.svg") || !exists("assets/icons/pwa-512.svg")) {
  fail.push("Missing PWA SVG icons");
}

let manifest = null;
if (exists("manifest.json")) {
  try {
    manifest = JSON.parse(read("manifest.json"));
  } catch {
    fail.push("manifest.json invalid JSON");
  }
}

for (const key of ["name", "short_name", "description", "start_url", "scope", "display", "theme_color", "background_color"]) {
  if (typeof manifest?.[key] !== "string" || !manifest[key]) fail.push("Manifest missing " + key);
}
if (manifest?.start_url !== "/") fail.push("Manifest start_url must be /");
if (manifest?.scope !== "/") fail.push("Manifest scope must be /");
if (manifest?.display !== "standalone") fail.push("Manifest display must be standalone");
for (const size of ["192x192", "512x512"]) {
  if (!manifest?.icons?.some((icon) => icon.sizes === size)) fail.push("Manifest missing " + size + " icon");
}

const serviceWorker = exists("service-worker.js") ? read("service-worker.js") : "";
const serviceWorkerContracts = [
  [/caches\s*\.open\s*\(\s*CACHE_NAME\s*\)/, "Service worker cache initialization missing"],
  [/self\.skipWaiting\s*\(\s*\)/, "Service worker skipWaiting missing"],
  [/self\.clients\.claim\s*\(\s*\)/, "Service worker clients.claim missing"],
  [/request\.mode\s*===\s*["']navigate["']/, "Service worker navigation handling missing"],
  [/url\.pathname\.startsWith\(\s*["']\/api\/["']\s*\)/, "Service worker API exclusion missing"],
  [/request\.method\s*!==\s*["']GET["']/, "Service worker non-GET exclusion missing"],
  [/caches\.match\(\s*request\s*\)/, "Service worker navigation cache fallback missing"],
  [/caches\.match\(\s*["']\/["']\s*\)/, "Service worker home fallback missing"],
  [/caches\.match\(\s*["']\/offline\.html["']\s*\)/, "Service worker offline fallback missing"]
];
for (const [pattern, message] of serviceWorkerContracts) requireMatch(serviceWorker, pattern, message);

const mainPath = "assets/js/main.js";
if (!exists(mainPath)) {
  fail.push("Missing assets/js/main.js");
} else {
  const main = read(mainPath);
  requireMatch(main, /navigator\.serviceWorker\.register\(\s*["']\/service-worker\.js["']/, "main.js service-worker registration missing");
  requireMatch(main, /rel\s*=\s*["']manifest["']/, "main.js manifest injection missing");
  requireMatch(main, /theme-color/, "main.js theme-color injection missing");
}

const indexPath = "index.html";
if (!exists(indexPath)) {
  fail.push("Missing index.html");
} else {
  const index = read(indexPath);
  requireMatch(
    index,
    /<link\b(?=[^>]*\brel\s*=\s*["']manifest["'])(?=[^>]*\bhref\s*=\s*["']\/manifest\.json["'])[^>]*\/?>/i,
    "index.html manifest link missing"
  );
}

if (fail.length) {
  console.error("PWA validation FAILED");
  fail.forEach((message) => console.error(" - " + message));
  process.exit(1);
}
console.log("PWA validation PASSED");
