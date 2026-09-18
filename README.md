# svchl

A very small Android e2e testing CLI. No app instrumentation, no SDK to link in — it drives your app over `adb` the same way a person would: read what's on screen, tap it, type into it, check what appeared.

## Why

Most Android e2e setups (Espresso, UI Automator, Appium) need a test APK built against your app, and flake for reasons that have nothing to do with your product. `svchl` skips that: it reads the accessibility tree over `adb`, so it works against any installed app, debug or release.

It borrows one idea from [Shopify's mobile e2e work](https://shopify.engineering/mobile-e2e-testing): every step names what it expects to see afterward, and the runner polls for that instead of sleeping a fixed amount. A step with no expectation is a parse error, not a maybe.

## Install

```bash
npx svchl install
```

Checks for `adb`, lists connected devices, and writes `flows/example.yaml`.

## Quickstart

```bash
npx svchl devices
npx svchl run flows/example.yaml
```

## Writing a flow

```yaml
app: com.android.settings
steps:
  - launch: {}
    expect: "Network & internet"

  - tap: "Network & internet"
    expect: "Internet"
```

Every step is exactly one action (`launch`, `tap`, or `type`) plus an `expect` — the text that must appear on screen afterward. The runner retries every 300ms until `expect` is satisfied or `--timeout` (default 10s) runs out, then fails the step.

**Actions**

- `launch: {}` — launch `app`, or `launch: { app: "com.other.app" }` for a different one.
- `tap: "Some text"` — tap the element with that exact text or content-description. Also accepts `tap: { text: "..." }`, `tap: { desc: "..." }`, or the escape hatch `tap: { UNSAFE_id: "some_id" }` for elements with no visible label (resource-id, exact or short form).
- `type: { into: "Email", text: "qa@test.com" }` — tap the `into` target, then type `text`.

Not sure what's on screen? Run:

```bash
npx svchl inspect --device <serial>
```

It lists every labeled element currently visible, marking which ones are tappable.

## Writing flows with an AI agent

`svchl mcp` starts an MCP server exposing `inspect`/`tap`/`type`/`launch` as tools. It does **not** call any LLM itself — it's driven by whatever agent is attached (Claude Code, Claude Desktop, any MCP client). The split stays the same as the rest of this tool: the agent only does the *authoring*, live, once. What it saves is a plain flow file, replayed forever after by `svchl run` with no AI involved and no per-run cost or flakiness.

Add it to your agent's MCP config, pointed at the app repo you're testing (so `flows/` lands there):

```json
{
  "mcpServers": {
    "svchl": { "command": "npx", "args": ["svchl", "mcp"] }
  }
}
```

Then just ask, in either form:

- **Natural language**: "Use svchl to record a flow: book a one-way flight on MakeMyTrip from Bengaluru to Delhi."
- **A PRD**: point the agent at a PRD file and ask it to turn each acceptance criterion into a flow. It should list the scenarios it plans to record first so you can confirm before it starts driving the device.

The agent's loop is exactly the tool set: `svchl_inspect` to see the screen, `svchl_tap`/`svchl_type`/`svchl_launch` to act (each requires the same `expect` every hand-written step does — the tool schema won't let it skip that), `svchl_save_flow` to write `flows/*.yaml`, and `svchl_verify_flow` to replay the saved file once, deterministically, as a sanity check before you trust it in CI.

## Output

Each run writes `out/<run-id>/`:

- a screenshot after every passing step
- `result.json` — status, timing, and target for every step
- on failure: a screenshot and the raw UI dump (`*.ui.xml`) for the failing step, no rerun needed

Exit code is `0` on pass, `1` on fail — wire it into CI as-is.

## Examples

[`examples/makemytrip`](examples/makemytrip) — a flow searching a real one-way flight (Bengaluru → New Delhi), recorded and verified against a real device. Ends at search results, deliberately, before login/payment.

## What v1 doesn't do

- iOS
- Elements with no accessibility label (raw Canvas/some Compose without `testTag`, WebViews) — `inspect` will show you an empty screen in that case
- `scroll` and `back` actions — a real screen with a list below the fold, or a flow needing a back-navigation assertion, will hit this
- A `--repeat` flakiness gate before a new test blocks CI
- Video/annotated recordings, OCR fallback, a device farm runner
- A standalone `svchl generate "..."` that works without any agent attached (today `svchl mcp` needs an MCP client, e.g. Claude Code, doing the reasoning)

These are the natural next steps, not accidents — see [software-mansion/argent](https://github.com/software-mansion/argent) and [google/artemis](https://github.com/google/artemis) for where this can go.

## Learning log

[`LEARNING_LOG.md`](LEARNING_LOG.md) — dated notes on gotchas and performance findings discovered while building/using this, kept so they don't get rediscovered from scratch.

## License

MIT
