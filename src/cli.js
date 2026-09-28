import { Command } from "commander";
import { install } from "./commands/install.js";
import { devices } from "./commands/devices.js";
import { inspect } from "./commands/inspect.js";
import { run as runCmd } from "./commands/run.js";
import { mcp } from "./commands/mcp.js";
import { crawl } from "./commands/crawl.js";
import { view } from "./commands/view.js";

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

  program
    .command("crawl <app>")
    .description("explore an app's screens automatically and build a navigation map (screenshots + transitions)")
    .option("--device <serial>", "target device (required if more than one is connected)")
    .option("--max-depth <n>", "how many taps deep to explore from the home screen", "2")
    .option("--max-nodes <n>", "stop after discovering this many distinct screens", "12")
    .option("--settle <ms>", "fixed wait after each action before reading the screen", "500")
    .option("--skip <labels>", "comma-separated labels to never tap, added to the built-in denylist (call, pay, login, delete, ...)")
    .action((app, opts) => crawl(app, opts));

  program
    .command("view <mapDir>")
    .description("serve a crawled map (from `svchl crawl`) as a browsable navigation graph")
    .option("--port <port>", "local port to serve on", "4884")
    .action((mapDir, opts) => view(mapDir, opts));

  await program.parseAsync(argv);
}
