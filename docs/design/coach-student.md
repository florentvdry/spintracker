# Coach and student mode

Status: design note. No code yet. No server: the exchange is a file, or a public GitHub raw link.

## Goal

A coach publishes a **pack**: the ranges, the HUD profile and the custom stats he wants a student to
use. The student imports it, sees how closely he follows the ranges, and sends back an **anonymised
report** that the coach opens in his own SpinTracker.

## The pack (`.spinpack`)

- A JSON file with a `format` and a `version` (integer), so a newer app can refuse an older or
  unknown pack with a clear message.
- Contents: the ranges (the same structure as the existing ranges export), a HUD profile (the layout
  of the grids), and the custom stats definitions.
- No player name, no hand, no figure from a real player: a pack holds how to play and how to read,
  not someone's results.
- Size limit and a schema check before anything is stored.

## Import and adherence

- The student imports the file; the import shows what it will add or replace, as the ranges import
  does, and nothing is replaced without a confirmation.
- Adherence is then measured with the existing adherence view, against the imported ranges.

## The anonymised report

- Built locally from the student's adherence figures per scenario: decisions compared, matches,
  deviations. No hand history, no cards, no player names, no dates of play.
- Exported as a `.spinreport` file. The coach opens it in his own SpinTracker, read-only.

## Transport

- A pack or a report is a file. A pack can also be read from a public GitHub raw URL, the student
  typing it in: a single read, no account, no tracking.
- The app contacts the network only when the student asks for a URL, never in the background.

## Limits

- The report shows adherence, not the student's results. It says nothing about his winnings.
- Anyone who has the pack can use it: a pack is shared on purpose, nothing in it is secret.

## Open points

1. Whether the HUD profile is part of v1 (the HUD layout format is large).
2. Whether a URL import is in v1, or the file only.
