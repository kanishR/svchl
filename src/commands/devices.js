import { resolveAdb } from "../device.js";
import { Adb } from "../adb.js";

export async function devices() {
  const bin = resolveAdb();
  if (!bin) {
    throw new Error("adb not found. Run `npx svchl install` to diagnose.");
  }
  const list = await new Adb(bin).devices();
  if (list.length === 0) {
    console.log("no devices found.");
    return;
  }
  for (const d of list) {
    console.log(`${d.serial}\t${d.state}${d.extra ? `\t${d.extra}` : ""}`);
  }
}
