import fs from "node:fs";
import YAML from "yaml";

const ACTIONS = ["launch", "tap", "type"];

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
  });

  return doc;
}

export function actionOf(step) {
  const type = ACTIONS.find((a) => step[a] !== undefined);
  return { type, value: step[type] };
}
