import fs from "node:fs";
import path from "node:path";
import { parseTree, visibleElements, findTappable, screenSignature } from "./locator.js";
import { retryUntil } from "./poll.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Skipped by default (case-insensitive substring match against an
// element's visible text/desc) — actions that place a call, start a
// payment, sign someone out, or delete something. The crawler taps
// through an app autonomously and can't tell intent from a label alone;
// this is a conservative denylist, not a guarantee. Extend with --skip.
export const DEFAULT_DENYLIST = [
  "call", "dial", "whatsapp", "share",
  "log in", "login", "sign in", "signin", "sign up", "signup",
  "log out", "logout", "sign out",
  "delete", "remove account", "deactivate",
  "pay", "payment", "checkout", "buy now", "book now", "confirm booking", "purchase",
  "donate", "subscribe",
  "rate us", "review", "feedback",
];

function isDenied(label, denylist) {
  const l = label.toLowerCase();
  return denylist.some((d) => l.includes(d.toLowerCase()));
}

function targetFor(el) {
  if (el.text) return el.text;
  if (el.desc) return el.desc;
  if (el.id) return { UNSAFE_id: el.id };
  return null;
}

// Best-effort return to `node`'s screen: a couple of back presses (a
// text field eating the first one is a known gotcha — see
// LEARNING_LOG.md), falling back to relaunching the app and replaying
// the recorded tap path from root if back doesn't get there.
async function returnTo(adb, app, node, log) {
  for (let i = 0; i < 2; i++) {
    await adb.back();
    await sleep(400);
    if (screenSignature(parseTree(await adb.dumpUiTree())) === node.signature) return true;
  }
  log(`  (back didn't return to the expected screen — relaunching and replaying ${node.path.length} step(s))`);
  await adb.launchApp(app);
  await sleep(800);
  for (const step of node.path) {
    const found = await retryUntil(
      async () => findTappable(await freshTree(adb), step),
      6000
    );
    if (!found) {
      log(`  (replay failed at "${typeof step === "string" ? step : JSON.stringify(step)}" — giving up on this branch)`);
      return false;
    }
    await adb.tap(found.bounds.cx, found.bounds.cy);
    await sleep(500);
  }
  return screenSignature(parseTree(await adb.dumpUiTree())) === node.signature;
}

async function freshTree(adb) {
  return parseTree(await adb.dumpUiTree());
}

// A dump right after launch/tap can catch the screen mid-render — a splash
// screen or cold app start is the worst case, seconds slower than a warm
// tap. An empty tree (no labeled elements at all) is a strong signal of
// "still loading", not "this screen is genuinely blank" — real Android
// screens almost always have SOME chrome. Retry until non-empty rather
// than trusting a single dump, which otherwise silently records a
// content-less signature and a dead end.
async function settledTree(adb, timeoutMs = 10000) {
  const tree = await retryUntil(async () => {
    const t = await freshTree(adb);
    return visibleElements(t).length > 0 ? t : null;
  }, timeoutMs);
  return tree ?? (await freshTree(adb)); // give up gracefully: whatever's there, even if empty
}

// `dumpsys window`'s mCurrentFocus is briefly null during a screen
// transition (nothing focused yet) — treating that as "left the app" was
// a real bug: it fired on completely normal in-app navigation (e.g.
// tapping "Network & internet"), costing a full unnecessary
// relaunch+replay cycle every time. Retry until we get an actual window,
// not just whatever the first reading happened to catch.
async function settledPackage(adb, timeoutMs = 3000) {
  return (await retryUntil(async () => await adb.currentPackage(), timeoutMs)) ?? null;
}

export async function crawl({ adb, app, outDir, maxDepth, maxNodes, settleMs, denylist, log = () => {} }) {
  const imagesDir = path.join(outDir, "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const nodes = new Map(); // signature -> { signature, depth, path, screenshot, package }
  const edges = [];
  let visitedCount = 0;

  // `tapPath` is the replay-ready target list (strings or {UNSAFE_id}) —
  // `reachedVia` is just the human-readable label for the log line.
  async function recordNode(signature, depth, tapPath, reachedVia) {
    const screenshotFile = `${signature}.png`;
    await adb.screenshot(path.join(imagesDir, screenshotFile));
    const node = {
      signature,
      depth,
      path: tapPath,
      screenshot: `images/${screenshotFile}`,
      package: await settledPackage(adb),
    };
    nodes.set(signature, node);
    visitedCount++;
    log(`  [${visitedCount}/${maxNodes}] depth ${depth}: screen ${signature}${reachedVia ? ` (via "${reachedVia}")` : " (root)"}`);
    return node;
  }

  log(`launching ${app}...`);
  await adb.launchApp(app);
  await sleep(settleMs);
  const rootSig = screenSignature(await settledTree(adb));
  const root = await recordNode(rootSig, 0, []);

  async function explore(node) {
    if (node.depth >= maxDepth || nodes.size >= maxNodes) return;

    // Not filtered to n.clickable — most real UI rows are a non-clickable
    // label (e.g. "Network & internet") inside a clickable, unlabeled
    // wrapper. findTappable() below does the same ancestor-climb a real
    // tap needs; pre-filtering here would silently skip almost every row
    // in a typical list-style screen (this WAS a bug — see LEARNING_LOG.md).
    const tree = await settledTree(adb);
    const candidates = visibleElements(tree);
    const tried = new Set();

    for (const el of candidates) {
      if (nodes.size >= maxNodes) break;
      const label = el.text || el.desc || el.id;
      if (!label || tried.has(label)) continue;
      tried.add(label);
      if (isDenied(label, denylist)) continue;

      const target = findTappable(await freshTree(adb), targetFor(el));
      if (!target) continue; // gone (dynamic content) — skip, don't block the crawl on it

      await adb.tap(target.bounds.cx, target.bounds.cy);
      await sleep(settleMs);

      const pkg = await settledPackage(adb);
      if (pkg !== app) {
        edges.push({ from: node.signature, to: null, label, kind: "left-app" });
        log(`  (left the app via "${label}" — backing out)`);
        await adb.back();
        await sleep(settleMs);
        if ((await settledPackage(adb)) !== app) await adb.launchApp(app);
        await returnTo(adb, app, node, log);
        continue;
      }

      const childSig = screenSignature(await settledTree(adb));
      let child = nodes.get(childSig);
      const isNew = !child;
      // Store the actual tap TARGET for replay (findTappable's shape:
      // a string for text/desc, {UNSAFE_id} for id-only elements) — not
      // just the human-readable `label`. Replaying an id-only tap by
      // searching for a node whose TEXT equals its raw resource-id
      // string would never match anything.
      if (isNew) child = await recordNode(childSig, node.depth + 1, [...node.path, targetFor(el)], label);
      edges.push({ from: node.signature, to: childSig, label, kind: "tap" });

      if (isNew) await explore(child);

      // A tap that lands back on `node`'s own screen (a toggle, a tab
      // you're already on) needs no recovery — and MUST skip it, since
      // returnTo() presses back at least once, which would navigate us
      // AWAY from a screen we're already correctly on.
      if (childSig !== node.signature && !(await returnTo(adb, app, node, log))) {
        log(`  (couldn't recover to depth ${node.depth} screen — stopping this branch)`);
        return;
      }
    }
  }

  await explore(root);

  const graph = {
    app,
    createdAt: new Date().toISOString(),
    maxDepth,
    maxNodes,
    nodes: [...nodes.values()].map(({ signature, depth, screenshot, package: pkg }) => ({
      id: signature,
      depth,
      screenshot,
      package: pkg,
    })),
    edges,
  };
  fs.writeFileSync(path.join(outDir, "graph.json"), JSON.stringify(graph, null, 2));
  return graph;
}
