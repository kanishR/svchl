import fs from "node:fs";
import path from "node:path";
import { actionOf } from "./flow.js";
import { parseTree, findTappable, isVisible, labelFor } from "./locator.js";
import { retryUntil } from "./poll.js";

class StepError extends Error {}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "step";
}

export async function runFlow({ adb, flow, timeoutMs, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });

  const report = {
    startedAt: new Date().toISOString(),
    device: adb.serial || null,
    timeoutMs,
    status: "pass",
    steps: [],
  };

  let lastXml = "";
  const dump = async () => {
    lastXml = await adb.dumpUiTree();
    return parseTree(lastXml);
  };

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const { type, value } = actionOf(step);
    const label = type === "launch" ? value?.app || flow.app || "app" : labelFor(value);
    const stepStart = Date.now();
    const record = { index: i + 1, action: type, target: label, expect: step.expect };

    try {
      if (type === "launch") {
        await adb.launchApp(value?.app || flow.app);
      } else if (type === "tap") {
        const target = await retryUntil(async () => findTappable(await dump(), value), timeoutMs);
        if (!target) throw new StepError(`could not find "${label}" to tap`);
        await adb.tap(target.bounds.cx, target.bounds.cy);
      } else if (type === "type") {
        const target = await retryUntil(
          async () => findTappable(await dump(), value.into),
          timeoutMs
        );
        if (!target) throw new StepError(`could not find "${value.into}" to type into`);
        await adb.tap(target.bounds.cx, target.bounds.cy);
        await adb.typeText(value.text);
      }

      const ok = await retryUntil(async () => isVisible(await dump(), step.expect), timeoutMs);
      if (!ok) throw new StepError(`expected "${step.expect}" but it never appeared`);

      record.status = "pass";
      record.durationMs = Date.now() - stepStart;
      const shotPath = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${slug(label)}.png`);
      await adb.screenshot(shotPath);
      record.screenshot = path.basename(shotPath);
    } catch (err) {
      record.status = "fail";
      record.durationMs = Date.now() - stepStart;
      record.error = err.message;

      const base = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${slug(label)}-FAILED`);
      try {
        await adb.screenshot(`${base}.png`);
        record.screenshot = path.basename(`${base}.png`);
      } catch {
        /* device may already be gone; report the original error, not this one */
      }
      fs.writeFileSync(`${base}.ui.xml`, lastXml);
      record.uiDump = path.basename(`${base}.ui.xml`);

      report.steps.push(record);
      report.status = "fail";
      report.finishedAt = new Date().toISOString();
      fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(report, null, 2));
      return report;
    }

    report.steps.push(record);
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(report, null, 2));
  return report;
}
