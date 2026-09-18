import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const execFileP = promisify(execFile);

// Resolve an adb binary: PATH first, then common Android SDK locations.
export function resolveAdb() {
  const candidates = [
    "adb",
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, "platform-tools", "adb"),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, "platform-tools", "adb"),
    path.join(os.homedir(), "Library", "Android", "sdk", "platform-tools", "adb"),
    path.join(os.homedir(), "Android", "Sdk", "platform-tools", "adb"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["version"], { stdio: "ignore" });
    if (!result.error) return candidate;
  }
  return null;
}

export class Adb {
  constructor(binPath, serial) {
    this.bin = binPath;
    this.serial = serial;
  }

  async devices() {
    const { stdout } = await execFileP(this.bin, ["devices", "-l"]);
    return stdout
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("*"))
      .map((line) => {
        const [serial, state, ...rest] = line.split(/\s+/);
        return { serial, state, extra: rest.join(" ") };
      });
  }

  args(extra) {
    return this.serial ? ["-s", this.serial, ...extra] : extra;
  }

  async shell(cmd) {
    const { stdout } = await execFileP(this.bin, this.args(["shell", ...cmd]));
    return stdout;
  }

  async tap(x, y) {
    await this.shell(["input", "tap", String(Math.round(x)), String(Math.round(y))]);
  }

  async typeText(text) {
    // adb's `input text` needs spaces escaped and can't handle most non-ASCII.
    const escaped = text.replace(/\s/g, "%s").replace(/(['"$`\\])/g, "\\$1");
    await this.shell(["input", "text", escaped]);
  }

  async launchApp(appId) {
    await this.shell(["monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
  }

  // Dumps the accessibility/UI hierarchy and returns it as an XML string.
  //
  // `uiautomator dump` itself costs ~2s+ on a real device with a complex
  // screen (Android walking the whole view tree) — that's not ours to
  // shave. What IS ours: doing it as one adb round-trip instead of two.
  // `exec-out ... dump /dev/tty` writes the XML straight to our stdout
  // instead of a device file we'd then need a second `cat` call to fetch,
  // saving ~500ms per dump. It also appends a trailing status line after
  // the XML ("UI hierchary dumped to: /dev/tty") that we trim off.
  async dumpUiTree() {
    const { stdout } = await execFileP(
      this.bin,
      this.args(["exec-out", "uiautomator", "dump", "/dev/tty"]),
      { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }
    );
    const end = stdout.lastIndexOf("</hierarchy>");
    return end === -1 ? stdout : stdout.slice(0, end + "</hierarchy>".length);
  }

  async screenshot(outPath) {
    const { stdout } = await execFileP(
      this.bin,
      this.args(["exec-out", "screencap", "-p"]),
      { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }
    );
    fs.writeFileSync(outPath, stdout);
  }
}
