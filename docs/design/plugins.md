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

A gallery is a JSON file whose plugins carry their pack **inline**, so nothing has to be downloaded:

```json
{ "format": "spingallery", "version": 1, "plugins": [ { "pack": { "format": "spinpack", "version": 1, "kind": "stat-pack", "id": "author.name", "name": "...", "description": "...", "pluginVersion": "1.0.0", "customStats": [ ... ] } } ] }
```

Settings > Packs > Gallery reads the file the user picks, lists its plugins with their kind and
description and, on "Look", shows the same summary and confirmation as for any pack. An entry that
is not a valid pack is skipped and counted; the others stay usable. Reading an index from a GitHub
repository is read-only and opt-in by design, but needs a network read outside the update flow, so
it is **not in v1**: the gallery file can be shared by any means (a repository, a forum, a chat).

Manifest rules: `id` is lowercase letters, digits, `.`, `_` and `-` (2 to 64 characters),
`pluginVersion` is `major.minor.patch`, `description` is at most 400 characters.

## Safety

Plugins are data: they are validated like a pack, never executed, and importing one asks first.
