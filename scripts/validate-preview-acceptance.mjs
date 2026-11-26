const ALLOWED_PREVIEW_ORIGINS = new Set([
  "https://preview.lab.jawed.co.in",
  "https://jawed-website-ai-studio-lab-preview.jawed-eee.workers.dev"
]);
const requestedBase = (process.env.PREVIEW_ACCEPTANCE_ORIGIN || "https://preview.lab.jawed.co.in").replace(/\/+$/, "");
if (!ALLOWED_PREVIEW_ORIGINS.has(requestedBase)) {
  throw new Error("Refusing unapproved acceptance target: " + requestedBase);
}
const BASE = requestedBase;
const PRODUCTION_HOST = "lab.jawed.co.in";
const REQUIRED_HEADERS = ["strict-transport-security","x-frame-options","x-content-type-options","cross-origin-opener-policy","referrer-policy","permissions-policy","content-security-policy"];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function probe(path, options={}) {
  const response = await fetch(BASE + path, { redirect: "manual", signal: AbortSignal.timeout(10000), ...options });
  assert(response.status < 300 || response.status >= 400, path + " returned redirect " + response.status + ".");
  const location = response.headers.get("location");
  if (location) {
    const targetHost = new URL(location, BASE).hostname.toLowerCase();
    assert(targetHost !== PRODUCTION_HOST, path + " redirects toward Production.");
  }
  return response;
}

const home = await probe("/");
assert(home.status === 200, "Preview homepage must return HTTP 200.");
assert((home.headers.get("content-type") || "").includes("text/html"), "Preview homepage must be HTML.");
const ai = await probe("/api/ai");
assert(ai.status === 200, "/api/ai readiness must return HTTP 200.");
assert((ai.headers.get("content-type") || "").includes("application/json"), "/api/ai must return JSON.");
const aiBody = await ai.json();
assert(typeof aiBody === "object" && aiBody !== null, "/api/ai readiness JSON is invalid.");
const unknownApi = await probe("/api/unknown-route");
assert(unknownApi.status === 404 && (unknownApi.headers.get("content-type") || "").includes("application/json"), "Unknown API route must return JSON 404.");
const missingAsset = await probe("/assets/phase-8-0-24i-missing-asset.js");
assert(missingAsset.status === 404, "Missing static asset must return HTTP 404.");
const unknownPage = await probe("/phase-8-0-24i-route-that-does-not-exist", { headers: { accept: "text/html", "sec-fetch-mode": "navigate" } });
assert(unknownPage.status === 404 && (unknownPage.headers.get("content-type") || "").includes("text/html"), "Unknown browser route must return branded HTML 404.");
const privateApi = await probe("/api/hq/projects");
assert(privateApi.status === 401, "Unauthenticated HQ projects endpoint must return HTTP 401.");
for (const [name,response] of [["homepage",home],["ai",ai],["unknown API",unknownApi],["missing asset",missingAsset],["unknown page",unknownPage],["private API",privateApi]]) {
  for (const header of REQUIRED_HEADERS) assert(response.headers.has(header), name + " missing security header " + header + ".");
}
console.log("Live Preview acceptance passed: homepage, AI readiness, API 404, missing asset, browser 404, HQ 401 and security headers.");
