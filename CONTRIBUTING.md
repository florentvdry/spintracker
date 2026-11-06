# Contributing to SpinTracker

Thanks for your interest in SpinTracker! Every contribution helps: bug reports, parsers for new poker rooms, translations, UI polish, documentation.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- 🐛 **Report a bug** — [open a bug report](https://github.com/florentvdry/spintracker/issues/new?template=bug_report.yml)
- 💡 **Suggest a feature** — [open a feature request](https://github.com/florentvdry/spintracker/issues/new?template=feature_request.yml)
- 🎰 **Request a poker room** — [open a room support request](https://github.com/florentvdry/spintracker/issues/new?template=room_support.yml)
- 🌍 **Translate** — add a locale in `frontend/src/locales/`
- 🔧 **Fix or build something** — pick an issue labeled `good first issue` or `help wanted`

Not sure where to start? Ask in [Discussions](https://github.com/florentvdry/spintracker/discussions).

## Development setup

Prerequisites: Node.js 18+, Rust (stable, MSVC toolchain), Windows.

```bash
git clone https://github.com/<your-username>/spintracker.git
cd spintracker
npm run setup
npm run dev
```

Run the checks before opening a PR:

```bash
cargo test -p spintracker-core
npm run frontend:build && cargo check -p spintracker
```

## Workflow

1. Fork the repository and create a branch from `main`: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`… (kebab-case, English).
2. Keep your change small and focused — one concern per pull request.
3. Add or update tests (every bug fix and parser fix needs one).
4. Write the commit subject for the user: release notes are generated from commit subjects.
5. Open a pull request and fill in the template.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), in English, imperative, lowercase, no trailing period:

```
feat(session): add session filter to history
fix(parser): correct Unibet range analysis
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `build`, `ci`, `chore`.
Do **not** start a commit message with `V<number>.<number>.<number>` — that triggers a release.

## Project rules

The full conventions live in [AGENTS.md](AGENTS.md) and apply to humans and AI agents alike. Highlights:

- **Everything in the repo is in English** (code, comments, docs, commits). UI strings go through `frontend/src/locales/`, English being the reference locale.
- Backend layering: `api.rs` → `services/` → `engines/`, `stats/`, `repos/`. No business logic in `api.rs`.
- Database changes go through a new SQL file in `crates/core/src/db/sql/` registered in `db/migrations.rs` — never edit a published one.
- React function components with TypeScript (strict); backend calls only through `src/services/`.

## Adding or fixing a parser

Each poker room has its own parser in `crates/core/src/parsers/` (`winamax.rs`, `betclic.rs`, `unibet.rs`).

1. Get a few hand history samples from the room and **anonymize them completely** (player names, IDs, emails, file paths).
2. Place them in `crates/core/tests/fixtures/exemple-data/`.
3. Implement the parser, keeping room-specific behavior inside it.
4. Add tests in `crates/core/tests/` (see `parser_samples.rs` and `importer_samples.rs`).
5. Make sure re-importing the same file creates no duplicates.

> This repository is public: **never commit real player data**.

## Security

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
