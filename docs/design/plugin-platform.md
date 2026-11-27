# Open platform: plugin formats and a read-only gallery

Status: design note. No code yet. Nothing runs from a plugin without the player's explicit choice.

## Goal

Let people share three kinds of extension, each as a documented file format:

1. **Parsers** for hand histories of a room that is not supported yet.
2. **Stat packs**: a set of custom stats (conditions as the custom-stats builder stores them).
3. **HUD models**: a grid layout, as the HUD editor exports its profiles.

## What a plugin is, and is not

- A plugin is **data**, not code. A parser plugin would be a declarative description of the room's
  format (the fields and separators), not a program. Nothing is executed from a plugin file.
- The format is versioned, documented in the repository, and checked against a schema before it is
  used; a file that does not match is refused with the reason.
- A plugin never reads the player's database and never sends anything. It only adds a definition.

## Gallery

- A list of plugins, read from a public GitHub repository, **read-only** and **opt-in**: off by
  default, turned on in Settings, and each download is a single request the player starts.
- The gallery shows name, version, room or kind, and the author. Nothing is installed without a
  confirmation; the installed plugins can be removed at any time.

## Trust and safety

- Only the documented formats are read; no script, no macro, no executable file type is accepted.
- Size limits and a schema check before storage, as for every file the app reads.
- The gallery says that a plugin is third-party and not reviewed by the project.

## Limits

- A declarative parser covers only the formats that fit the declared fields; a room with an unusual
  layout still needs a parser written in the repository.
- The gallery depends on network access that the player turns on; without it the app works as before.

## Open points

1. The exact parser description (fields, separators, date formats) and its version rule.
2. Whether stat packs and HUD models are imported in v1, or only parsers.
