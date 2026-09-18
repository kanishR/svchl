import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pickDevice, resolveAdb } from "./device.js";
import { Adb } from "./adb.js";
import { parseTree, findTappable, isVisible, visibleElements, labelFor } from "./locator.js";
import { retryUntil } from "./poll.js";
import { toYaml, loadFlow } from "./flow.js";
import { runFlow } from "./runner.js";

const DEFAULT_TIMEOUT_MS = 10000;

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}

async function currentElements(adb) {
  const nodes = visibleElements(parseTree(await adb.dumpUiTree()));
  return nodes.map((n) => ({
    label: n.text || n.desc,
    ...(n.id ? { id: n.id } : {}),
    clickable: n.clickable,
  }));
}

async function screenDump(adb) {
  return JSON.stringify(await currentElements(adb), null, 2);
}

// One MCP server process == one recording session. An agent drives the
// device through the tools below; every action that confirms its `expect`
// gets appended here. svchl_save_flow writes the accumulated steps out as
// a normal flow file, byte-for-byte what a human would have hand-written,
// runnable forever after by `svchl run` with no AI involved.
const session = { app: null, steps: [] };

export async function startMcpServer() {
  const server = new McpServer({ name: "svchl", version: "0.1.0" });

  server.registerTool(
    "svchl_devices",
    {
      title: "List connected devices",
      description: "List connected Android devices/emulators. Call this first if you don't know the target device.",
      inputSchema: {},
    },
    async () => {
      try {
        const bin = resolveAdb();
        if (!bin) return errorResult("adb not found on this machine.");
        const list = await new Adb(bin).devices();
        return textResult(JSON.stringify(list, null, 2));
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_inspect",
    {
      title: "Inspect the current screen",
      description:
        "List every labeled or tappable element currently visible on the device screen: label (visible text or content-description) and id (resource-id, only when present). Call this whenever you don't know what's on screen, e.g. before the first action and after any action whose result surprises you.",
      inputSchema: { device: z.string().optional() },
    },
    async ({ device }) => {
      try {
        const adb = await pickDevice(device);
        const elements = await currentElements(adb);
        if (elements.length === 0) {
          return textResult(
            "no labeled elements on screen — likely a custom-rendered UI (Canvas/some Compose/WebView) that svchl can't target by text."
          );
        }
        return textResult(JSON.stringify(elements, null, 2));
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_launch",
    {
      title: "Launch an app",
      description:
        'Launch an app by its package id (e.g. "com.google.android.apps.maps") and wait for `expect` text to appear. Fails loudly with the current screen contents if `expect` never shows — do not guess an app id, get it from the user or `adb shell pm list packages` first.',
      inputSchema: {
        device: z.string().optional(),
        app: z.string().min(1),
        expect: z.string().min(1),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ device, app, expect, timeoutMs }) => {
      try {
        const adb = await pickDevice(device);
        await adb.launchApp(app);
        const ok = await retryUntil(
          async () => isVisible(parseTree(await adb.dumpUiTree()), expect),
          timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        if (!ok) {
          return errorResult(
            `launched "${app}" but "${expect}" never appeared.\ncurrent screen:\n${await screenDump(adb)}`
          );
        }
        if (session.app === null || session.app === app) {
          session.app = app;
          session.steps.push({ launch: {}, expect });
        } else {
          session.steps.push({ launch: { app }, expect });
        }
        return textResult(`launched "${app}", "${expect}" confirmed.\nstep ${session.steps.length} recorded.\ncurrent screen:\n${await screenDump(adb)}`);
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_tap",
    {
      title: "Tap an element",
      description:
        'Tap the element matching `label` (its visible text or content-description, exact match — get it from svchl_inspect first, don\'t guess) or, if it has no label, `id` (its resource-id, exact or short form). Then wait for `expect` text to appear. Pass exactly one of label/id.',
      inputSchema: {
        device: z.string().optional(),
        label: z.string().optional(),
        id: z.string().optional(),
        expect: z.string().min(1),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ device, label, id, expect, timeoutMs }) => {
      if ((label ? 1 : 0) + (id ? 1 : 0) !== 1) {
        return errorResult("pass exactly one of label or id.");
      }
      const target = id ? { UNSAFE_id: id } : label;
      const budget = timeoutMs ?? DEFAULT_TIMEOUT_MS;
      try {
        const adb = await pickDevice(device);
        const found = await retryUntil(async () => findTappable(parseTree(await adb.dumpUiTree()), target), budget);
        if (!found) {
          return errorResult(`could not find "${labelFor(target)}" to tap.\ncurrent screen:\n${await screenDump(adb)}`);
        }
        await adb.tap(found.bounds.cx, found.bounds.cy);
        const ok = await retryUntil(async () => isVisible(parseTree(await adb.dumpUiTree()), expect), budget);
        if (!ok) {
          return errorResult(
            `tapped "${labelFor(target)}" but "${expect}" never appeared.\ncurrent screen:\n${await screenDump(adb)}`
          );
        }
        session.steps.push({ tap: target, expect });
        return textResult(`tapped "${labelFor(target)}", "${expect}" confirmed.\nstep ${session.steps.length} recorded.\ncurrent screen:\n${await screenDump(adb)}`);
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_type",
    {
      title: "Type into a field",
      description:
        'Tap the element matching `into` (visible text or content-description — for an empty input this is usually its placeholder/hint text, get it from svchl_inspect), type `text` into it, then wait for `expect` text to appear (often the typed text itself, or a resulting search/validation result).',
      inputSchema: {
        device: z.string().optional(),
        into: z.string().min(1),
        text: z.string().min(1),
        expect: z.string().min(1),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ device, into, text, expect, timeoutMs }) => {
      const budget = timeoutMs ?? DEFAULT_TIMEOUT_MS;
      try {
        const adb = await pickDevice(device);
        const found = await retryUntil(async () => findTappable(parseTree(await adb.dumpUiTree()), into), budget);
        if (!found) {
          return errorResult(`could not find "${into}" to type into.\ncurrent screen:\n${await screenDump(adb)}`);
        }
        await adb.tap(found.bounds.cx, found.bounds.cy);
        await adb.typeText(text);
        const ok = await retryUntil(async () => isVisible(parseTree(await adb.dumpUiTree()), expect), budget);
        if (!ok) {
          return errorResult(`typed "${text}" into "${into}" but "${expect}" never appeared.\ncurrent screen:\n${await screenDump(adb)}`);
        }
        session.steps.push({ type: { into, text }, expect });
        return textResult(`typed "${text}" into "${into}", "${expect}" confirmed.\nstep ${session.steps.length} recorded.\ncurrent screen:\n${await screenDump(adb)}`);
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_scroll",
    {
      title: "Scroll the screen",
      description:
        'Swipe the middle of the screen in `direction`, named for which way the CONTENT moves (not the finger) — "down" reveals content below, e.g. further down a list. Use when the element you need isn\'t in svchl_inspect\'s output yet because it\'s off-screen. Then wait for `expect` (usually the label you were scrolling to find).',
      inputSchema: {
        device: z.string().optional(),
        direction: z.enum(["down", "up", "left", "right"]),
        expect: z.string().min(1),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ device, direction, expect, timeoutMs }) => {
      try {
        const adb = await pickDevice(device);
        await adb.scroll(direction);
        const ok = await retryUntil(
          async () => isVisible(parseTree(await adb.dumpUiTree()), expect),
          timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        if (!ok) {
          return errorResult(`scrolled ${direction} but "${expect}" never appeared.\ncurrent screen:\n${await screenDump(adb)}`);
        }
        session.steps.push({ scroll: direction, expect });
        return textResult(`scrolled ${direction}, "${expect}" confirmed.\nstep ${session.steps.length} recorded.\ncurrent screen:\n${await screenDump(adb)}`);
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_back",
    {
      title: "Press the system back button",
      description: "Press the device back button, then wait for `expect` to appear (usually something on the screen you're returning to).",
      inputSchema: {
        device: z.string().optional(),
        expect: z.string().min(1),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ device, expect, timeoutMs }) => {
      try {
        const adb = await pickDevice(device);
        await adb.back();
        const ok = await retryUntil(
          async () => isVisible(parseTree(await adb.dumpUiTree()), expect),
          timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        if (!ok) {
          return errorResult(`pressed back but "${expect}" never appeared.\ncurrent screen:\n${await screenDump(adb)}`);
        }
        session.steps.push({ back: {}, expect });
        return textResult(`pressed back, "${expect}" confirmed.\nstep ${session.steps.length} recorded.\ncurrent screen:\n${await screenDump(adb)}`);
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "svchl_recording_status",
    {
      title: "Show the current recording",
      description: "Show the steps recorded so far in this session, without saving anything.",
      inputSchema: {},
    },
    async () => textResult(JSON.stringify({ app: session.app, steps: session.steps }, null, 2))
  );

  server.registerTool(
    "svchl_discard_last_step",
    {
      title: "Discard the last recorded step",
      description: "Undo the most recently recorded step, e.g. after exploring a dead end. Does not touch the device.",
      inputSchema: {},
    },
    async () => {
      if (session.steps.length === 0) return errorResult("nothing recorded yet.");
      const removed = session.steps.pop();
      if (session.steps.length === 0) session.app = null;
      return textResult(`discarded: ${JSON.stringify(removed)}\n${session.steps.length} step(s) remain.`);
    }
  );

  server.registerTool(
    "svchl_reset_recording",
    {
      title: "Clear the recording",
      description: "Discard all recorded steps and start over. Does not touch the device.",
      inputSchema: {},
    },
    async () => {
      session.steps = [];
      session.app = null;
      return textResult("recording cleared.");
    }
  );

  server.registerTool(
    "svchl_save_flow",
    {
      title: "Save the recording as a flow file",
      description:
        "Write the steps recorded so far to a YAML flow file at `path` (e.g. \"flows/book-ticket.yaml\"), in the exact format `svchl run` reads. Call this once you've completed the goal. The recording is NOT cleared afterward — call svchl_reset_recording if you're about to start a new, unrelated flow.",
      inputSchema: { path: z.string().min(1) },
    },
    async ({ path: relPath }) => {
      if (session.steps.length === 0) {
        return errorResult("nothing recorded yet — call svchl_launch/svchl_tap/svchl_type first.");
      }
      const flow = { app: session.app, steps: session.steps };
      const yamlText = toYaml(flow);
      const absPath = path.resolve(process.cwd(), relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, yamlText);
      return textResult(`wrote ${absPath} (${session.steps.length} steps)\n\n${yamlText}`);
    }
  );

  server.registerTool(
    "svchl_verify_flow",
    {
      title: "Replay a saved flow deterministically",
      description:
        "Run a saved flow file exactly as `svchl run` would — no AI reasoning, pure text/id matching — to confirm it replays cleanly after saving. Recommended right after svchl_save_flow, on a fresh app state.",
      inputSchema: { path: z.string().min(1), device: z.string().optional() },
    },
    async ({ path: relPath, device }) => {
      try {
        const absPath = path.resolve(process.cwd(), relPath);
        const flow = loadFlow(absPath);
        const adb = await pickDevice(device);
        const outDir = path.join(process.cwd(), "out", `mcp-verify-${Date.now()}`);
        const report = await runFlow({ adb, flow, timeoutMs: DEFAULT_TIMEOUT_MS, outDir });
        const result = textResult(JSON.stringify(report, null, 2));
        if (report.status !== "pass") result.isError = true;
        return result;
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
