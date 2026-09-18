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

## Output

Each run writes `out/<run-id>/`:

- a screenshot after every passing step
- `result.json` — status, timing, and target for every step
- on failure: a screenshot and the raw UI dump (`*.ui.xml`) for the failing step, no rerun needed

Exit code is `0` on pass, `1` on fail — wire it into CI as-is.

## What v1 doesn't do

- iOS
- Elements with no accessibility label (raw Canvas/some Compose without `testTag`, WebViews) — `inspect` will show you an empty screen in that case
- A `--repeat` flakiness gate before a new test blocks CI
- Video/annotated recordings, OCR fallback, a device farm runner

These are the natural next steps, not accidents — see [software-mansion/argent](https://github.com/software-mansion/argent) and [google/artemis](https://github.com/google/artemis) for where this can go.

## License

MIT
