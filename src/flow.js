import fs from "node:fs";
import YAML from "yaml";

const ACTIONS = ["launch", "tap", "type", "scroll", "back"];
const SCROLL_DIRECTIONS = ["down", "up", "left", "right"];

export class FlowError extends Error {}

export function loadFlow(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = YAML.parse(raw);

  if (!doc || typeof doc !== "object") {
    throw new FlowError(`${filePath}: empty or invalid YAML`);
  }
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    throw new FlowError(`${filePath}: needs a non-empty "steps" list`);
  }

  doc.steps.forEach((step, i) => {
    const actionKeys = ACTIONS.filter((a) => step[a] !== undefined);
    if (actionKeys.length !== 1) {
      throw new FlowError(
        `${filePath}: step ${i + 1} must have exactly one of ${ACTIONS.join(", ")} (got ${
          actionKeys.length ? actionKeys.join(", ") : "none"
        })`
      );
    }
    if (typeof step.expect !== "string" || step.expect.trim() === "") {
      throw new FlowError(
        `${filePath}: step ${i + 1} (${actionKeys[0]}) has no "expect" — every step must assert what it caused`
      );
    }
    if (actionKeys[0] === "scroll" && !SCROLL_DIRECTIONS.includes(step.scroll)) {
      throw new FlowError(
        `${filePath}: step ${i + 1} (scroll) must be one of ${SCROLL_DIRECTIONS.join(", ")}, got "${step.scroll}"`
      );
    }
  });

  return doc;
}

export function actionOf(step) {
  const type = ACTIONS.find((a) => step[a] !== undefined);
  return { type, value: step[type] };
}

// Serializes a { app, steps } flow back to the same YAML shape loadFlow()
// reads. Used by `svchl mcp` to persist a recorded session.
export function toYaml(flow) {
  return YAML.stringify(flow, { indent: 2 });
}
