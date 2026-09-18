# MakeMyTrip: search a one-way flight

`search-blr-del.yaml` opens MakeMyTrip, picks Bengaluru → New Delhi explicitly (not relying on whatever city the app defaults to from a previous search), searches, and confirms real results load.

It stops there on purpose. Booking for real means logging in (OTP) and paying — not something an e2e test should do against a production account. If you need coverage past this point, point it at a staging build/test account instead of prod.

Recorded live against a real device (Galaxy S23 FE, Android) by driving `svchl`'s own `tap`/`launch` primitives step by step, then verified twice from a cold app state with:

```bash
npx svchl run examples/makemytrip/search-blr-del.yaml --device <serial>
```

Both runs passed clean, ~55s each, no flakiness observed.
