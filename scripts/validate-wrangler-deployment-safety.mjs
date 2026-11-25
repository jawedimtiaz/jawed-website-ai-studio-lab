import fs from "node:fs";

export const PREVIEW_WORKER = "jawed-website-ai-studio-lab-preview";
export const PRODUCTION_WORKER = "jawed-website-ai-studio-lab";
export const PREVIEW_DB = "623a828d-2909-47e7-a228-130b4eeefef5";
export const PRODUCTION_DB = "d9ec83ea-7114-4179-af8e-a22ba5494508";

const PREVIEW_ORIGIN = "https://preview.lab.jawed.co.in";
const PRODUCTION_ORIGIN = "https://lab.jawed.co.in";
const PREVIEW_LIMITERS = [
  { name: "HQ_SESSION_LIMITER", namespace_id: "620261117", simple: { limit: 10, period: 60 } },
  { name: "HQ_WRITE_LIMITER", namespace_id: "620261118", simple: { limit: 30, period: 60 } },
  { name: "HQ_RATE_LIMITER", namespace_id: "620261119", simple: { limit: 120, period: 60 } }
];
const PRODUCTION_LIMITERS = [
  { name: "HQ_SESSION_LIMITER", namespace_id: "620261114", simple: { limit: 10, period: 60 } },
  { name: "HQ_WRITE_LIMITER", namespace_id: "620261115", simple: { limit: 30, period: 60 } },
  { name: "HQ_RATE_LIMITER", namespace_id: "620261116", simple: { limit: 120, period: 60 } }
];

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const failIf = (errors, condition, message) => { if (condition) errors.push(message); };

function validateD1(errors, environment, expectedDatabaseId, expectedDatabaseName) {
  const databases = environment?.d1_databases;
  failIf(errors, !Array.isArray(databases) || databases.length !== 1,
    "Each deployment environment must declare exactly one HQ_DB database.");
  const database = Array.isArray(databases) ? databases[0] : undefined;
  failIf(errors, database?.binding !== "HQ_DB", "D1 binding must be named HQ_DB.");
  failIf(errors, database?.database_id !== expectedDatabaseId, "D1 database ID does not match its isolated environment.");
  failIf(errors, database?.database_name !== expectedDatabaseName, "D1 database name does not match its isolated environment.");
  failIf(errors, database?.migrations_dir !== "migrations/hq", "D1 migrations_dir must be migrations/hq.");
}

function validateRateLimiters(errors, environment, expected) {
  const actual = environment?.ratelimits;
  failIf(errors, !Array.isArray(actual) || !sameJson(actual, expected),
    "Rate-limit bindings, limits, periods, and namespace IDs must match the environment's approved configuration.");
}

function validateEnvironmentVars(errors, environment, name, origin) {
  failIf(errors, environment?.vars?.ENVIRONMENT !== name, "ENVIRONMENT must be " + name + ".");
  failIf(errors, environment?.vars?.CANONICAL_ORIGIN !== origin, "CANONICAL_ORIGIN must be " + origin + ".");
}

function validateNoCustomRoutes(errors, environment, label) {
  failIf(errors, Array.isArray(environment?.routes) && environment.routes.length > 0,
    label + " must not declare custom routes.");
  failIf(errors, environment?.custom_domain === true,
    label + " must not enable a custom domain.");
}

export function validateWranglerConfig(config) {
  const errors = [];
  const preview = config?.env?.preview;
  const production = config?.env?.production;

  failIf(errors, config?.name !== PREVIEW_WORKER, "Default Wrangler target must be the Preview Worker.");
  failIf(errors, config?.main !== "worker.js", "Worker entrypoint must remain worker.js.");
  failIf(errors, config?.assets?.directory !== "./dist" || config?.assets?.binding !== "ASSETS",
    "Root static assets must use ASSETS from ./dist.");
  failIf(errors, config?.ai?.binding !== "AI", "Default environment must declare the AI binding.");
  validateEnvironmentVars(errors, config, "preview", PREVIEW_ORIGIN);
  validateD1(errors, config, PREVIEW_DB, "jawed-studio-hq-preview");
  validateRateLimiters(errors, config, PREVIEW_LIMITERS);

  failIf(errors, preview?.name !== PREVIEW_WORKER, "The named preview environment must resolve to the Preview Worker.");
  validateEnvironmentVars(errors, preview, "preview", PREVIEW_ORIGIN);
  failIf(errors, !sameJson(preview?.ai, config?.ai), "Root and named Preview AI bindings must match.");
  failIf(errors, !sameJson(preview?.d1_databases, config?.d1_databases), "Root and named Preview D1 bindings must match exactly.");
  failIf(errors, !sameJson(preview?.ratelimits, config?.ratelimits), "Root and named Preview rate-limit bindings must match exactly.");
  validateNoCustomRoutes(errors, config, "Default Preview environment");
  validateNoCustomRoutes(errors, preview, "Named Preview environment");

  failIf(errors, !production || typeof production !== "object", "An explicit Production environment must be declared.");
  failIf(errors, production?.name !== PRODUCTION_WORKER, "Production must use the explicitly named Production Worker.");
  validateEnvironmentVars(errors, production, "lab", PRODUCTION_ORIGIN);
  failIf(errors, production?.ai?.binding !== "AI", "Production must declare the AI binding.");
  validateD1(errors, production, PRODUCTION_DB, "jawed-studio-hq");
  validateRateLimiters(errors, production, PRODUCTION_LIMITERS);
  validateNoCustomRoutes(errors, production, "Production environment");

  const previewNamespaces = new Set(PREVIEW_LIMITERS.map((item) => item.namespace_id));
  failIf(errors, PRODUCTION_LIMITERS.some((item) => previewNamespaces.has(item.namespace_id)),
    "Preview and Production rate-limit namespace IDs must be disjoint.");
  failIf(errors, Object.keys(config?.env || {}).some((key) => !["preview", "production"].includes(key)),
    "Unexpected Wrangler environment found; review its deployment target explicitly.");

  return errors;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1].replaceAll("\\\\", "/")) {
  const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
  const errors = validateWranglerConfig(config);
  if (errors.length) {
    console.error("Wrangler deployment safety validation FAILED");
    for (const error of errors) console.error("- " + error);
    process.exit(1);
  }
  console.log("Wrangler deployment safety validation PASSED");
  console.log("Default target: Preview Worker + Preview D1");
  console.log("Production target: explicit --env production only");
}
