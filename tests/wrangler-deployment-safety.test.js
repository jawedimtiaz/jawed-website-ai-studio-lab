import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runProductionDeploymentGuard, PRODUCTION_CONFIRMATION } from "../scripts/deploy-production.mjs";

const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const validator = fs.readFileSync("scripts/validate-wrangler-deployment-safety.mjs", "utf8");
const guard = fs.readFileSync("scripts/deploy-production.mjs", "utf8");

test("default Wrangler configuration targets Preview Worker and Preview D1", () => {
  assert.equal(config.name, "jawed-website-ai-studio-lab-preview");
  assert.equal(config.vars.ENVIRONMENT, "preview");
  assert.equal(config.d1_databases[0].database_id, "623a828d-2909-47e7-a228-130b4eeefef5");
});

test("Production Worker and D1 are available only under explicit production environment", () => {
  assert.equal(config.env.production.name, "jawed-website-ai-studio-lab");
  assert.equal(config.env.production.d1_databases[0].database_id, "d9ec83ea-7114-4179-af8e-a22ba5494508");
  assert.notEqual(config.env.production.d1_databases[0].database_id, config.d1_databases[0].database_id);
});

test("package scripts provide explicit Preview and guarded Production commands", () => {
  assert.equal(packageJson.scripts["deploy:preview"], "wrangler deploy --env preview");
  assert.equal(packageJson.devDependencies.wrangler, "4.166.0");
  assert.equal(packageJson.scripts["deploy:production"], "node scripts/deploy-production.mjs");
  assert.match(guard, /DEPLOY jawed-website-ai-studio-lab PRODUCTION/);
  assert.match(guard, /spawnSync\("wrangler", \["deploy", "--env", "production"\]/);
});

test("deployment safety validator asserts environment separation", () => {
  assert.match(validator, /Default HQ_DB must point only to Preview D1/);
  assert.match(validator, /Production HQ_DB must point only to Production D1/);
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
