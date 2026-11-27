# Import from PokerTracker 4 and Hold'em Manager 2

Status: design note, no code. Needs real exports before a parser is written.

## Goal

Import the hands a player exported from PokerTracker 4 (PT4) or Hold'em Manager 2 (H2N), from a
folder of exported files. The app never opens their databases: only the files they write.

## Why no parser yet

Neither format is in the repository, and the export layout of these tools depends on their version
and on the options chosen at export. Writing a parser from memory would be a guess, and an import
that reads the wrong fields corrupts the statistics silently. Each format needs a real export to
test against.

## What is needed

- One hand history export of each tool, anonymised (see `tests/fixtures/community/README.md`).
- The export options used, and the tool version.
- The tournament summary, if the tool writes it separately.

## How it would fit

- The import reads a folder, like the existing history import, and detects the format of each
  file with the same detection the room parsers use (`get_parser` on the content).
- Each format gets its own parser module in `crates/core/src/parsers/`, with the same trait and a
  parser sample test. Nothing room-specific goes in another parser.
- The import stays idempotent: a re-import creates no duplicate hand.

## Open points

1. The export format of each tool, from real files.
2. Whether the tools' hand ids can be used for idempotence, or the normal hand id is needed.
