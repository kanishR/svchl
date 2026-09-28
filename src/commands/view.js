import path from "node:path";
import { spawn } from "node:child_process";
import { startViewer } from "../viewer.js";

export async function view(mapDir, { port }) {
  const abs = path.resolve(process.cwd(), mapDir);
  const url = `http://localhost:${port}/`;

  startViewer(abs, Number(port));
  console.log(`serving ${mapDir} at ${url}`);
  console.log("press ctrl+C to stop");

  if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore" }).unref();
}
