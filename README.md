# svchl

Experimental Android e2e testing CLI. Drives a real app over `adb` — no test APK, no SDK to link in, just reading the screen and tapping/typing like a person would.

**Status: WIP, built for personal use, sharing as-is.** Rough edges expected.

## Idea

Every step is one action plus `expect` — what should be on screen afterward. The runner polls for that instead of guessing how long to sleep. No `expect`, no flow — it won't parse.

## Install

```bash
npx svchl install
```

## Quickstart

```bash
npx svchl devices
npx svchl run flows/example.yaml
```

## A flow

```yaml
app: com.android.settings
steps:
  - launch: {}
    expect: "Network & internet"
  - tap: "Network & internet"
    expect: "Internet"
```

**Actions** (each needs `expect`):

- `launch: {}` — or `launch: { app: "com.other.app" }`
- `tap: "text"` — also `{ text }`, `{ desc }`, or `{ UNSAFE_id: "..." }` for unlabeled elements
- `type: { into: "Email", text: "..." }`
- `scroll: "down"` — `down`/`up`/`left`/`right`, named by which way content moves
- `back: {}` — one press; a focused text field can eat the first one, may need two in a row

`npx svchl inspect --device <serial>` shows what's tappable on the current screen.

## Recording flows with an AI agent

`npx svchl mcp` exposes the same actions as MCP tools. Nothing inside `svchl` calls an LLM — whatever agent is attached drives it live, and what gets saved is a plain flow file, no AI needed to replay it after.

```bash
claude mcp add -s user svchl -- node /path/to/svchl/bin/svchl.js mcp
```

Then in a terminal: "book a ticket from X to Y on \<app\>", or point it at a PRD.

## Output

`out/<run-id>/` — a screenshot per passing step, `result.json`, and on failure a screenshot + the raw UI dump. Exit code 0/1.

## License

MIT
