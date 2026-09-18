# Learning log

Dated entries on things discovered while building/using svchl — gotchas, performance findings, decisions and why. Newest first.

---

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
