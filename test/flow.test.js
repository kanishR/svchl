import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadFlow, FlowError, actionOf, toYaml } from "../src/flow.js";

function writeTmpFlow(yamlText) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "svchl-test-")), "flow.yaml");
  fs.writeFileSync(file, yamlText);
  return file;
}

test("loadFlow accepts a well-formed flow", () => {
  const file = writeTmpFlow(`
app: com.example
steps:
  - launch: {}
    expect: "Home"
  - tap: "Settings"
    expect: "Settings screen"
`);
  const flow = loadFlow(file);
  assert.equal(flow.steps.length, 2);
  assert.deepEqual(actionOf(flow.steps[1]), { type: "tap", value: "Settings" });
});

test("loadFlow rejects a step with no expect", () => {
  const file = writeTmpFlow(`
steps:
  - tap: "Settings"
`);
  assert.throws(() => loadFlow(file), FlowError);
});

test("loadFlow rejects a step with two actions", () => {
  const file = writeTmpFlow(`
steps:
  - tap: "Settings"
    launch: {}
    expect: "x"
`);
  assert.throws(() => loadFlow(file), FlowError);
});

test("loadFlow rejects an empty steps list", () => {
  const file = writeTmpFlow(`steps: []`);
  assert.throws(() => loadFlow(file), FlowError);
});

test("toYaml output round-trips through loadFlow (svchl_save_flow's contract)", () => {
  const recorded = {
    app: "com.android.settings",
    steps: [
      { launch: {}, expect: "Network & internet" },
      { tap: "Network & internet", expect: "Internet" },
      { type: { into: "Search", text: "wifi" }, expect: "Wi‑Fi" },
    ],
  };
  const file = writeTmpFlow(toYaml(recorded));
  const reloaded = loadFlow(file);
  assert.deepEqual(reloaded, recorded);
});
