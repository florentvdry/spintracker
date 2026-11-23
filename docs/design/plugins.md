# Open platform: plugins and gallery (item 54)

## Goal

Let people share stat packs, HUD templates and range packs, and describe parsers, without
changing the application.

## Format

A plugin is a `.spinpack` file (see `coach-student.md`) with a `kind` and a manifest:

```json
{ "format": "spinpack", "version": 1, "kind": "stat-pack" | "hud-template" | "range-pack" | "pack",
  "id": "author.name", "name": "...", "description": "...", "author": "...", "pluginVersion": "1.0.0",
  ...payload... }
```

Payload by kind: `customStats` for a stat pack, `hudProfile` for an HUD template, `ranges` for a
range pack.

## Parsers

A **parser plugin is documented but not loaded**: running a user's code inside the application is a
risk the product does not take. The contribution path for a room is a pull request with the parser
and a sample in `tests/fixtures/community/`.

## Gallery

A gallery is a JSON index:

```json
{ "format": "spingallery", "version": 1, "plugins": [ { "id": "...", "name": "...", "description": "...", "kind": "...", "url": "...", "sha256": "..." } ] }
```

v1 reads an index from a **file** the user picks. Reading it from a GitHub repository is read-only
and opt-in by design, but needs a network read outside the update flow, so it is not in v1.

## Safety

Plugins are data: they are validated like a pack, never executed, and importing one asks first.
