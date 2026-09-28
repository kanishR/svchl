import path from "node:path";
import { pickDevice } from "../device.js";
import { crawl as runCrawl, DEFAULT_DENYLIST } from "../crawl.js";

export async function crawl(app, { device, maxDepth, maxNodes, settle, skip }) {
  const adb = await pickDevice(device);
  const denylist = [...DEFAULT_DENYLIST, ...(skip ? skip.split(",").map((s) => s.trim()) : [])];

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "map", runId);

  console.log(`svchl crawl ${app}  (device ${adb.serial}, max ${maxNodes} screens, depth ${maxDepth})`);
  console.log(`skipping labels containing: ${denylist.join(", ")}`);
  console.log("");

  const graph = await runCrawl({
    adb,
    app,
    outDir,
    maxDepth: Number(maxDepth),
    maxNodes: Number(maxNodes),
    settleMs: Number(settle),
    denylist,
    log: (line) => console.log(line),
  });

  console.log("");
  console.log(`${graph.nodes.length} screen(s), ${graph.edges.length} transition(s) -> ${path.relative(process.cwd(), outDir)}`);
  console.log(`view it: npx svchl view ${path.relative(process.cwd(), outDir)}`);
}
