import { spawn } from "child_process";
import { join } from "path";

// Run Zoom and Gong sync scripts in parallel
async function runScript(name: string, args: string[]): Promise<{ name: string; exitCode: number }> {
  return new Promise((resolve) => {
    const scriptPath = join(process.cwd(), "scripts", `sync-${name}.ts`);
    const child = spawn("npx", ["tsx", scriptPath, ...args], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      resolve({ name, exitCode: code ?? 1 });
    });

    child.on("error", (err) => {
      console.error(`Failed to start ${name} sync:`, err);
      resolve({ name, exitCode: 1 });
    });
  });
}

async function main(): Promise<void> {
  // Pass through command line args (--force, --years=N, --months=N)
  const args = process.argv.slice(2);

  console.log("🚀 Starting parallel sync (Zoom + Gong)...\n");
  console.log("─".repeat(50));

  const startTime = Date.now();

  // Run both syncs in parallel
  const results = await Promise.all([
    runScript("zoom", args),
    runScript("gong", args),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "─".repeat(50));
  console.log(`\n✅ Parallel sync completed in ${elapsed}s`);

  for (const result of results) {
    const status = result.exitCode === 0 ? "✓" : "✗";
    console.log(`   ${status} ${result.name}: exit code ${result.exitCode}`);
  }

  // Exit with error if any script failed
  const anyFailed = results.some((r) => r.exitCode !== 0);
  if (anyFailed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
