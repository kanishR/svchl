import { pickDevice } from "../device.js";
import { parseTree, visibleElements } from "../locator.js";

export async function inspect({ device }) {
  const adb = await pickDevice(device);
  const xml = await adb.dumpUiTree();
  const nodes = visibleElements(parseTree(xml));

  if (nodes.length === 0) {
    console.log("no labeled elements found on screen (custom-rendered UI, e.g. Compose/Canvas/WebView).");
    return;
  }

  for (const n of nodes) {
    const label = n.text || n.desc || "";
    const tag = n.clickable ? "tap" : "   ";
    const idPart = n.id ? `  id=${n.id}` : "";
    console.log(`[${tag}] "${label}"${idPart}`);
  }
}
