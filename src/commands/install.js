import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAdb } from "../device.js";
import { Adb } from "../adb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "..", "..", "templates");

export async function install() {
  console.log("svchl install");
  console.log("");

  const adbBin = resolveAdb();
  if (adbBin) {
    console.log(`  adb found: ${adbBin}`);
    const devices = await new Adb(adbBin).devices();
    const connected = devices.filter((d) => d.state === "device");
    if (connected.length) {
      console.log(`  devices connected: ${connected.map((d) => d.serial).join(", ")}`);
    } else {
      console.log("  no devices connected yet — start an emulator or plug in a device.");
    }
  } else {
    console.log("  adb NOT found.");
    console.log("  install Android platform-tools and add it to your PATH, or set ANDROID_HOME.");
  }

  console.log("");

  const flowsDir = path.join(process.cwd(), "flows");
  const exampleDest = path.join(flowsDir, "example.yaml");
  if (fs.existsSync(exampleDest)) {
    console.log(`  ${path.relative(process.cwd(), exampleDest)} already exists, leaving it alone.`);
  } else {
    fs.mkdirSync(flowsDir, { recursive: true });
    fs.copyFileSync(path.join(templateDir, "example.yaml"), exampleDest);
    console.log(`  wrote ${path.relative(process.cwd(), exampleDest)}`);
  }

  console.log("");
  console.log("next steps:");
  console.log("  npx svchl devices");
  console.log("  npx svchl run flows/example.yaml");
}
