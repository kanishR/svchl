import path from "node:path";
import { pickDevice } from "../device.js";
import { loadFlow } from "../flow.js";
import { runFlow } from "../runner.js";

function parseTimeout(value) {
  if (!value) return 10000;
  const m = /^(\d+)(ms|s)?$/.exec(String(value).trim());
  if (!m) throw new Error(`--timeout must look like "10000" or "10s", got "${value}"`);
  const [, num, unit] = m;
  return unit === "s" ? Number(num) * 1000 : Number(num);
}

export async function run(flowPath, { device, timeout }) {
  const flow = loadFlow(flowPath);
  const adb = await pickDevice(device);
  const timeoutMs = parseTimeout(timeout);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "out", runId);

  console.log(`svchl run ${flowPath}  (device ${adb.serial}, timeout ${timeoutMs}ms)`);
  console.log("");

  const report = await runFlow({ adb, flow, timeoutMs, outDir });

  for (const step of report.steps) {
    const icon = step.status === "pass" ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${step.index}. ${step.action} "${step.target}" -> expect "${step.expect}" (${step.durationMs}ms)`);
    if (step.error) console.log(`        ${step.error}`);
  }

  console.log("");
  console.log(`${report.status.toUpperCase()}  results: ${path.relative(process.cwd(), outDir)}`);

  if (report.status !== "pass") process.exitCode = 1;
}
