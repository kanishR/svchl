import { Command } from "commander";
import { install } from "./commands/install.js";
import { devices } from "./commands/devices.js";
import { inspect } from "./commands/inspect.js";
import { run as runCmd } from "./commands/run.js";
import { mcp } from "./commands/mcp.js";

export async function run(argv) {
  const program = new Command();
  program.name("svchl").description("a very small Android e2e testing CLI").version("0.1.0");

  program
    .command("install")
    .description("check for adb and scaffold a flows/ directory with an example")
    .action(install);

  program
    .command("devices")
    .description("list connected Android devices/emulators")
    .action(devices);

  program
    .command("inspect")
    .description("list tappable text/ids on the current screen, to help write flows")
    .option("--device <serial>", "target device (required if more than one is connected)")
    .action((opts) => inspect(opts));

  program
    .command("run <flow>")
    .description("run a YAML flow against a device")
    .option("--device <serial>", "target device (required if more than one is connected)")
    .option("--timeout <duration>", 'per-step timeout, e.g. "10000" or "10s"', "10s")
    .action((flow, opts) => runCmd(flow, opts));

  program
    .command("mcp")
    .description("start an MCP server exposing inspect/tap/type/launch, so an AI agent can author flows by driving a real device")
    .action(mcp);

  await program.parseAsync(argv);
}
