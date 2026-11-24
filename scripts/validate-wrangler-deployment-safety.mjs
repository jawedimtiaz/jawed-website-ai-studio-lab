import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const errors = [];
const fail = (message) => errors.push(message);
const previewDb = "623a828d-2909-47e7-a228-130b4eeefef5";
const productionDb = "d9ec83ea-7114-4179-af8e-a22ba5494508";

if (config.name !== "jawed-website-ai-studio-lab-preview") fail("Default Wrangler target must be the Preview Worker.");
if (config.vars?.ENVIRONMENT !== "preview") fail("Default ENVIRONMENT must be preview.");
if (config.vars?.CANONICAL_ORIGIN !== "https://preview.lab.jawed.co.in") fail("Default canonical origin must be the Preview origin.");
if (config.d1_databases?.length !== 1 || config.d1_databases[0]?.database_id !== previewDb) fail("Default HQ_DB must point only to Preview D1.");
if (config.env?.preview?.name !== config.name) fail("The named preview environment must resolve to the Preview Worker.");
if (config.env?.preview?.d1_databases?.[0]?.database_id !== previewDb) fail("The named preview environment must point to Preview D1.");

const production = config.env?.production;
if (production?.name !== "jawed-website-ai-studio-lab") fail("Production must use the explicitly named Production Worker.");
if (production?.vars?.ENVIRONMENT !== "lab") fail("Production ENVIRONMENT must remain lab.");
if (production?.vars?.CANONICAL_ORIGIN !== "https://lab.jawed.co.in") fail("Production canonical origin mismatch.");
if (production?.d1_databases?.length !== 1 || production.d1_databases[0]?.database_id !== productionDb) fail("Production HQ_DB must point only to Production D1.");
if (production.d1_databases[0]?.database_id === previewDb) fail("Production and Preview D1 databases must remain separate.");
if (config.env?.preview?.d1_databases?.[0]?.database_id === productionDb) fail("Preview must never reference Production D1.");

if (errors.length) {
  console.error("Wrangler deployment safety validation FAILED");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}
console.log("Wrangler deployment safety validation PASSED");
console.log("Default target: Preview Worker + Preview D1");
console.log("Production target: explicit --env production only");
