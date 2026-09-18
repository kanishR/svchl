# MakeMyTrip: search a one-way flight

`search-blr-del.yaml` opens MakeMyTrip, picks Bengaluru → New Delhi explicitly (not relying on whatever city the app defaults to from a previous search), searches, and confirms real results load.

It stops there on purpose. Booking for real means logging in (OTP) and paying — not something an e2e test should do against a production account. If you need coverage past this point, point it at a staging build/test account instead of prod.

The last two steps (`scroll`, `back`) also demonstrate those actions. Fair warning: the scroll step's `expect: "Air India"` is live search-result data, not app structure — it's held up across every run so far, but a different day/route could reorder or drop it. That's inherent to asserting on real third-party data, not a svchl bug; prefer asserting on structural text over specific result content when you can.

Recorded live against a real device (Galaxy S23 FE, Android) by driving `svchl`'s own `tap`/`launch` primitives step by step, then verified twice from a cold app state with:

```bash
npx svchl run examples/makemytrip/search-blr-del.yaml --device <serial>
```

Both runs passed clean, ~55s each, no flakiness observed.
