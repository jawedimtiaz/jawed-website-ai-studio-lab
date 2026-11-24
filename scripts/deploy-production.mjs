import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const confirmation = "DEPLOY jawed-website-ai-studio-lab PRODUCTION";
const terminal = createInterface({ input: stdin, output: stdout });

try {
  console.log("\nPRODUCTION DEPLOYMENT GUARD");
  console.log("This command targets the Production Worker and Production D1 binding.");
  console.log("It does not run D1 migrations, but the deployed code will use Production D1.");
  const answer = await terminal.question(`To continue, type exactly: ${confirmation}\n> `);
  if (answer.trim() !== confirmation) {
    console.log("Production deployment cancelled. No Wrangler command was run.");
    process.exitCode = 1;
  } else {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const result = spawnSync(command, ["wrangler", "deploy", "--env", "production"], {
      stdio: "inherit",
      shell: false
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  terminal.close();
}
