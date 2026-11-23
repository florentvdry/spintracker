# Coach / student mode without a server (item 53)

## Goal

A coach shares a **pack** (ranges, an HUD profile, custom stats); the student imports it and sees
their adherence to it; the student can export an **anonymised report** the coach opens in their own
SpinTracker. No account, no server, no telemetry.

## Formats

`.spinpack` is JSON:

```json
{ "format": "spinpack", "version": 1, "kind": "pack", "name": "...", "author": "...", "createdAt": "...",
  "ranges": { ...the ranges export... }, "hudProfile": { ...one HUD profile... }, "customStats": [ ...definitions... ] }
```

`.spinreport` is JSON:

```json
{ "format": "spinreport", "version": 1, "createdAt": "...", "pack": "name of the pack",
  "adherence": { "compared": 0, "matches": 0, "deviations": 0, "scenarios": [ { "name": "...", "depth": 10, "decisions": 0, "matches": 0 } ] } }
```

A report holds counts per scenario: no player name, no hand id, no date of a hand.

## Flow

Coach: Settings > Packs > "Create a pack" (choose what goes in) > file. Student: "Open a pack" > a
summary of what it holds and what it will do (ranges are merged as new scenarios, never
replaced) > confirm. The adherence screen then works as it always does. Student: "Export a report";
coach: "Open a report" shows the figures read-only.

## Safety

Every file is validated (format, version, size limits, each part through the validator of its own
module) before anything is written. A pack never runs code.

## Not in v1

Fetching a pack from a GitHub raw URL: it needs a network read outside the update flow, which the
product rules reserve for updates. It can be added behind an explicit opt-in.
