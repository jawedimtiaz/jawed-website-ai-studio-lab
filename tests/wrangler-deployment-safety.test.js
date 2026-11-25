import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runProductionDeploymentGuard, PRODUCTION_CONFIRMATION } from "../scripts/deploy-production.mjs";
import { validateWranglerConfig } from "../scripts/validate-wrangler-deployment-safety.mjs";

const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const clone = (value) => structuredClone(value);

test("default Wrangler configuration targets Preview Worker and Preview D1", () => {
  assert.equal(config.name, "jawed-website-ai-studio-lab-preview");
  assert.equal(config.vars.ENVIRONMENT, "preview");
  assert.equal(config.d1_databases[0].database_id, "623a828d-2909-47e7-a228-130b4eeefef5");
  assert.deepEqual(validateWranglerConfig(config), []);
});

test("Production Worker and D1 are isolated under explicit production environment", () => {
  assert.equal(config.env.production.name, "jawed-website-ai-studio-lab");
  assert.equal(config.env.production.d1_databases[0].database_id, "d9ec83ea-7114-4179-af8e-a22ba5494508");
  assert.notEqual(config.env.production.d1_databases[0].database_id, config.d1_databases[0].database_id);
});

test("package scripts provide explicit Preview and guarded Production commands", () => {
  assert.equal(packageJson.scripts["deploy:preview"], "wrangler deploy --env preview");
  assert.equal(packageJson.devDependencies.wrangler, "4.166.0");
  assert.equal(packageJson.scripts["deploy:production"], "node scripts/deploy-production.mjs");
});

test("validator rejects a missing Production environment without throwing", () => {
  const invalid = clone(config);
  delete invalid.env.production;
  assert.ok(validateWranglerConfig(invalid).some((message) => message.includes("Production environment")));
});

test("validator rejects Production D1 in Preview, including an extra D1 binding", () => {
  const invalid = clone(config);
  invalid.env.preview.d1_databases.push(clone(invalid.env.production.d1_databases[0]));
  const errors = validateWranglerConfig(invalid);
  assert.ok(errors.some((message) => message.includes("exactly one HQ_DB")));
  assert.ok(errors.some((message) => message.includes("match exactly")));
});

test("validator rejects shared or altered rate-limit namespaces", () => {
  const invalid = clone(config);
  invalid.env.preview.ratelimits[0].namespace_id = invalid.env.production.ratelimits[0].namespace_id;
  assert.ok(validateWranglerConfig(invalid).some((message) => message.includes("rate-limit")));
});

test("validator rejects missing AI binding and incorrect D1 binding metadata", () => {
  const invalid = clone(config);
  delete invalid.env.production.ai;
  invalid.env.production.d1_databases[0].binding = "OTHER_DB";
  invalid.env.production.d1_databases[0].migrations_dir = "migrations";
  const errors = validateWranglerConfig(invalid);
  assert.ok(errors.some((message) => message.includes("AI binding")));
  assert.ok(errors.some((message) => message.includes("HQ_DB")));
  assert.ok(errors.some((message) => message.includes("migrations_dir")));
});

test("validator rejects Preview environment variable drift and root/Preview binding drift", () => {
  const invalid = clone(config);
  invalid.env.preview.vars.ENVIRONMENT = "lab";
  invalid.env.preview.ai.binding = "OTHER_AI";
  const errors = validateWranglerConfig(invalid);
  assert.ok(errors.some((message) => message.includes("ENVIRONMENT must be preview")));
  assert.ok(errors.some((message) => message.includes("AI bindings must match")));
});

test("validator rejects routes and unexpected Wrangler environments", () => {
  const invalid = clone(config);
  invalid.routes = [{ pattern: "lab.jawed.co.in/*", zone_name: "jawed.co.in" }];
  invalid.env.staging = { name: "unexpected-worker" };
  const errors = validateWranglerConfig(invalid);
  assert.ok(errors.some((message) => message.includes("custom routes")));
  assert.ok(errors.some((message) => message.includes("Unexpected Wrangler environment")));
});

test("Production guard does not invoke Wrangler when confirmation is incorrect", () => {
  let invoked = false;
  const status = runProductionDeploymentGuard({
    answer: "wrong confirmation",
    spawn: () => { invoked = true; return { status: 0 }; },
    log: () => {}
  });
  assert.equal(status, 1);
  assert.equal(invoked, false);
});

test("Production guard invokes only the explicit Production environment after exact confirmation", () => {
  let invocation;
  const status = runProductionDeploymentGuard({
    answer: PRODUCTION_CONFIRMATION,
    platform: "linux",
    spawn: (...args) => { invocation = args; return { status: 0 }; },
    log: () => {}
  });
  assert.equal(status, 0);
  assert.deepEqual(invocation, [
    "wrangler",
    ["deploy", "--env", "production"],
    { stdio: "inherit", shell: false }
  ]);
});

test("Production guard enables shell command resolution on Windows", () => {
  let invocation;
  runProductionDeploymentGuard({
    answer: PRODUCTION_CONFIRMATION,
    platform: "win32",
    spawn: (...args) => { invocation = args; return { status: 0 }; },
    log: () => {}
  });
  assert.equal(invocation[2].shell, true);
});
