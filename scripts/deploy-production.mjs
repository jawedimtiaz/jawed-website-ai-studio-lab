import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PRODUCTION_CONFIRMATION = "DEPLOY jawed-website-ai-studio-lab PRODUCTION";

export function runProductionDeploymentGuard({
  answer,
  spawn = spawnSync,
  wranglerEntry = fileURLToPath(import.meta.resolve("wrangler")),
  log = console.log
}) {
  if (typeof answer !== "string" || answer.trim() !== PRODUCTION_CONFIRMATION) {
    log("Production deployment cancelled. No Wrangler command was run.");
    return 1;
  }

  const result = spawn(process.execPath, [wranglerEntry, "deploy", "--env", "production"], {
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error("Production deployment requires an interactive terminal. No Wrangler command was run.");
    process.exitCode = 1;
    return;
  }

  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    console.log("\nPRODUCTION DEPLOYMENT GUARD");
    console.log("This command targets the Production Worker and Production D1 binding.");
    console.log("It does not run D1 migrations, but the deployed code will use Production D1.");
    const answer = await terminal.question(`To continue, type exactly: ${PRODUCTION_CONFIRMATION}\n> `);
    process.exitCode = runProductionDeploymentGuard({ answer });
  } finally {
    terminal.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
