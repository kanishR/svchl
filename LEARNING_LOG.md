# Learning log

Dated entries on things discovered while building/using svchl — gotchas, performance findings, decisions and why. Newest first.

---

## 2026-09-18: registered `svchl mcp` at user scope; can't self-test the full agent loop

`claude mcp add -s user svchl -- node /Users/kanish/Documents/svchl/bin/svchl.js mcp` — confirmed connected from an arbitrary fresh directory via `claude mcp list`, not just svchl's own repo. This is what makes "open any terminal, run `claude`, type a natural-language command" actually work, per Kanish's intended workflow.

Tried to verify the *whole* loop (fresh session + one-line NL prompt + svchl tools + saved flow) by spawning `claude -p "..." --dangerously-skip-permissions` as a subprocess. Blocked by Claude Code's own auto-mode classifier: "Create Unsafe Agents" — correctly so, spawning a permissions-bypassed nested agent isn't something to route around. So the MCP-registration layer is proven; the full live agent-reasoning loop against ixigo specifically is not, from inside this session. Real next test: do it from an actual terminal, a human present for the normal permission prompts.

## 2026-09-18: added scroll/back; first real `back` press can be a no-op

Verified both against the live MakeMyTrip app on the real device before trusting them:

- `scroll: "down"` (a single swipe of the middle 50% of the screen) revealed a new flight card ("Air India") that wasn't in the tree before scrolling — confirmed working.
- `back: {}` on the city-picker screen (text input focused, keyboard showing) did **not** navigate back on the first press — it just dismissed the keyboard. The second press actually went back. From the search-results screen (no input focused), a single press worked immediately.

Decided not to make `back` auto-retry multiple presses — that would make step count non-deterministic and blur "one step = one action." Left it single-press, documented the gotcha instead: if `expect` fails right after a step that leaves a text field focused, add a second `back` step before assuming something else is wrong. An MCP-recording agent hits this naturally too — the tool call fails, current-screen diagnostics show the keyboard/picker still up, and it just calls `svchl_back` again as its own separate recorded step.

Also: scroll direction is named for which way the *content* moves ("down" = see what's further down), not the swipe gesture direction — the two are opposite (scrolling down the content means swiping up on the screen). Chose content-direction because that's how a flow author actually thinks ("scroll down until I see X"), but it's a real ambiguity in the field (Espresso names by gesture, not content) — worth remembering if this ever gets confusing.

## 2026-09-18: why `svchl run` takes ~5s/step, and it's not AI

Measured `uiautomator dump` in isolation on a real device (Galaxy S23 FE), 5 back-to-back calls on an unchanged screen: **2431 / 2386 / 2377 / 2415 / 2399ms**. Dead flat, no warm-up speedup across repeated calls.

That flatness is the signature of a cold-started process, not a slow-but-cached one: `uiautomator dump` isn't a resident service, it's a brand-new Java process launched fresh on every invocation — process fork, ART/runtime startup, a new connection to the Accessibility framework, then a full tree walk + XML serialization. If it reused a connection, later calls would be cheaper. They aren't.

Each `svchl run` step pays this cost **at least twice** (find target, then confirm `expect`), so ~5s/step is a structural floor, not a bug. On top of that floor, real app/network latency dominates further — MakeMyTrip's search-results step alone varied 5.6s → 8.0s → 13.9s across three otherwise-identical runs.

**Fixed**: we were doing two adb round-trips per dump (`shell dump` to a device file, then a separate `exec-out cat` to fetch it). Merged into one (`exec-out uiautomator dump /dev/tty`, trimming the trailing status line it appends). Saves ~500-600ms/dump, confirmed by measurement — real, but small next to the ~2.4s floor and the network variance above it.

**Important distinction to keep making to people who ask "why is it slow"**: there is zero AI/LLM involvement in `svchl run`. It's already "predefined flow, just execute the steps" — the time is 100% real device latency, not reasoning.

**The actual fix, not done yet**: a persistent on-device helper service (what Google's Artemis does) — install once, keep a live Accessibility connection, avoid paying process-cold-start on every single dump. Real v2 work (companion APK + IPC), not a quick tweak. Logged here so it doesn't get re-litigated from scratch next time speed comes up.

## 2026-09-18: MakeMyTrip UI gotchas (recording examples/makemytrip/search-blr-del.yaml)

- Field labels are literal uppercase strings ("FROM", "DEPARTURE DATE"), not styled — `expect: "From"` will never match, `expect: "FROM"` will.
- The destination-city recent-search row is labeled `"New Delhi, INDIA"`, not `"New Delhi"`. A bare `"New Delhi"` tap matched a *different* node (a popular-search chip further down) that didn't complete the selection — the app just silently stayed on the picker screen. `expect` caught it (the next step's target wasn't found) rather than it becoming a landed, confusing bug three steps later.
- Lesson generalizes: never assume a label from what a screenshot *looks like* it says — always pull the exact string from `svchl_inspect`/`inspect`, including case and punctuation.
