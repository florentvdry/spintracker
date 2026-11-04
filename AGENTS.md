# AGENTS.md — SpinTracker

**Strict** rules for any agent (AI or human) modifying this repository. SpinTracker is an **open-source** project (MIT). When in doubt: make the smallest correct change, consistent with the existing code.

## 0. Language policy (STRICT)

**English only** across the whole project:
- Code: identifiers (classes, methods, variables, files, folders, DB tables/columns, API routes, JSON fields).
- Comments, XML docs, log messages, exception messages.
- Commit messages, branch names, PR titles/descriptions, issues.
- Documentation: README, `backend/README.md`, this file.
- Tests: names and descriptions.

Exception: user-facing UI text lives in `frontend-vue/src/locales/` and may exist in several languages (see §6). English is the reference locale; every key must exist in it.

Legacy French found in the codebase (comments, names, docs) must be translated to English when you touch that code. Do not leave mixed-language files. Do not do large translation sweeps mixed into functional changes: use a dedicated `refactor`/`docs` commit.

## 1. Stack & structure

| Area | Tech | Role |
|---|---|---|
| `backend/` | C# / .NET 8, ASP.NET Core, SQLite, FluentMigrator | API, parsing/import, stats |
| `frontend-vue/` | Vue 3, Vite, Tailwind, Pinia (`stores/`) | UI |
| `main.js` | Electron | Desktop main process, launches the backend (port `5050`) |
| `website/` | — | Landing site |
| `.github/workflows/deploy.yml` | GitHub Actions | Automated release |

Backend layering (never mix layers):
- `Controllers/`: HTTP endpoints only, **no business logic**.
- `Services/`: application logic.
- `Engines/`: pure analytical computations (stats, EV, leaks).
- `Parsers/`: per-room hand history parsing (Winamax, Unibet, Betclic…).
- `Data/Repositories/`: data access only.
- `Migrations/`: FluentMigrator.
- `Extensions/`, `Configuration/`: DI, pipeline, runtime paths.
- `Models/`, `Interfaces/`: DTOs/entities, contracts.

Allowed dependency direction: Controllers → Services → Engines/Repositories. Never the reverse.

## 2. Commands

```bash
npm run setup           # full install + backend build
npm run dev:electron    # desktop dev (recommended)
npm run dev             # backend + frontend separately
npm run build           # Windows build (installer)
cd backend && dotnet test Tests/SpinTrackerBackend.Tests.csproj
```

**Before declaring a task done**: backend builds (`dotnet build`), tests pass, `npm run react:build` passes. If a check could not be run, say so explicitly.

## 3. Commits (STRICT)

Format: **Conventional Commits**, in **English**, imperative mood, lowercase description, no trailing period, ≤ 72 characters for the subject.

```
<type>(<optional scope>): <description>
```

Allowed types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `build`, `ci`, `chore`.

Suggested scopes: `parser`, `import`, `stats`, `range`, `dashboard`, `session`, `replayer`, `db`, `migration`, `electron`, `ui`, `i18n`, `website`.

Valid examples:
- `feat(session): add session filter to history`
- `fix(parser): correct Unibet range analysis`
- `perf(stats): avoid recomputing dashboard cards`
- `chore: bump version to 1.1.8 [skip ci]`

Forbidden: `fix`, `update`, `wip`, `multiple fix`, `.`, vague messages, non-English messages, several unrelated topics in one commit.

Rules:
- **One commit = one logical change.** No catch-all commits.
- Body (optional): explain the *why*, not the *what*. Reference issues with `Fixes #123`.
- Breaking change: `feat(api)!: ...` plus a `BREAKING CHANGE:` footer.
- Never commit unless the user explicitly asks.
- Never use `--no-verify`, never force-push `main`, never rewrite published history.
- Never commit secrets, `.db`, `.sqlite`, `userData/`, `node_modules/`, `dist/`, `bin/`, `obj/` (see `.gitignore`).

### Release commit (SPECIAL — triggers CI)

A commit on `main` whose **first line starts with `V<major>.<minor>.<patch>`** builds the installer, creates tag `v<version>` and publishes the release.

```
V1.2.0
V1.2.0 - new range analysis
```

- Only produce such a commit on an explicit release request.
- The version must match `package.json`.
- The release notes are generated from the commit subjects since the previous tag (`deploy.yml`), so every subject must say clearly what changed for the user.
- No other commit may ever start with `V<digits>.<digits>.<digits>`.
- Automated bumps use `[skip ci]`; do not imitate them by hand unless asked.

## 4. Branches & pull requests

- `main` = stable/releasable.
- Naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `refactor/<slug>`, `docs/<slug>` (kebab-case, ASCII, English).
- PR title follows the commit format (§3). PR description: what changed, why, how it was tested, screenshots for UI changes.
- Keep PRs small and focused; one concern per PR.

## 5. C# conventions (backend)

- Nullable enabled; do not add `!` to silence a warning without justification.
- Naming: `PascalCase` (types, methods, properties), `camelCase` (locals, parameters), `_camelCase` (private fields), interfaces prefixed `I`.
- One public type per file; file name = type name.
- `async`/`await` end to end, `Async` suffix, never `.Result` / `.Wait()`.
- Constructor dependency injection; no hidden static singletons.
- SQL: **parameterized only**, never string concatenation with user input.
- DB schema: **every** change goes through a new FluentMigrator migration. Never edit a published migration.
- No silent `catch (Exception)`; log or rethrow. No leftover `Console.WriteLine` debugging.
- Stat computations belong in `Engines/` and must be deterministic and testable.
- No magic numbers: use named constants (buy-ins, prize pool multipliers…).

## 6. Vue / JS conventions (frontend)

- Vue 3 **Composition API** with `<script setup>`. No Options API in new code.
- Components: `PascalCase.vue`. Composables: `useXxx.js`. Pinia stores: `xxxStore.js` / `useXxxStore`.
- API calls only through `src/services/`; never `fetch`/`axios` inside a component.
- Shared state in `stores/`; do not duplicate server state in components.
- Styling: Tailwind classes; no inline CSS except dynamic values. No new CSS library.
- **i18n**: all visible text goes through `locales/`. Add the key to **every** locale file, English first. No hardcoded strings in templates. Locale keys are English identifiers.
- No leftover `console.log`, no dead commented-out code.
- `const` by default, `let` when needed, never `var`. `===` only.
- Typed/validated props, events declared with `defineEmits`.
- Lists: stable unique `:key` (never the index for mutable lists).
- Performance: no heavy computation in templates; use `computed`, and virtualization for long hand/tournament lists.

## 7. Parsers & import (sensitive area)

- Each room has its own parser in `Parsers/`; never put room-specific behavior in another one.
- **Every parser fix ships with a test** (`Tests/*ImportTests.cs`) based on a sample from `exemple-data/`.
- Sample data must be **fully anonymized** (player names, IDs, emails, paths). This repository is public: never commit real player data.
- Import must remain **idempotent**: re-importing the same file creates no duplicates.

## 8. Tests

- New backend code in `Engines/`, `Parsers/`, `Services/` → accompanying unit test.
- A fixed bug = a test that fails before and passes after.
- Tests must not depend on network, system time, or `userData/`.
- Never delete or disable a test to make the build pass.
- Test names in English, descriptive (`Parse_UnibetHand_ReturnsExpectedRange`).

## 9. Security, privacy & open source

- User data is **local** (SQLite in `userData/`). Send nothing externally without explicit request; no telemetry without opt-in.
- Validate all Controller inputs (size, type, file paths: no path traversal).
- No secret, token or key in code, history or workflows; use GitHub secrets. Public repo: anything committed is public forever.
- Dependencies: add a NuGet/npm package only if necessary, justify it, pin versions, check its license is MIT-compatible. Do not hand-edit `package-lock.json`.
- Do not copy code from incompatible-license sources. Keep the `LICENSE` file and headers intact.
- Security issues: do not open public issues with exploit details; follow `SECURITY.md`.

## 10. General code quality

- Readability over cleverness. Short functions, single responsibility.
- No duplication: reuse existing code first (search `utils/`, `Extensions/`, `Engines/`).
- Comments explain the *why*, never the *what*, in English. No context-free TODOs; track tasks in GitHub issues.
- No opportunistic refactoring outside the requested scope; mention it instead.
- No mass reformatting mixed into functional changes.
- Encoding: **UTF-8** for all files.
- Line endings and indentation: follow the existing file.

## 11. Documentation & release notes

- There is no changelog file: release notes come from the commit subjects (§3), so write them for the user.
- Architecture, command or config change → update `README.md` (root or `backend/README.md`).
- New feature → mention it in `README.md` if it changes what the app does.

## 12. Expected agent behavior

1. **Read before writing**: explore the relevant code and follow existing patterns.
2. **Stay in scope**: do not touch unrelated files.
3. **Do not guess**: if a requirement is ambiguous and changes the outcome, ask.
4. **Destructive or irreversible actions** (data deletion, `git reset --hard`, table drop, release, push): **ask for confirmation first**.
5. **Never modify**: `bin/`, `obj/`, `node_modules/`, `*.lscache`, `publish/`, `.github/workflows/` (unless explicitly asked).
6. **Report honestly**: state what was tested, what was not, and any failure with its output.
7. **Platform**: development happens on Windows; scripts must work in PowerShell/Git Bash and handle path separators correctly.
8. **Reply to the user in the language they write in**, but everything written into the repo is English (§0).

## 13. Pre-delivery checklist

- [ ] Builds (`dotnet build`, `npm run react:build`)
- [ ] Backend tests green; new test added for any bug/feature
- [ ] No hardcoded strings (i18n), no leftover `console.log`/debug
- [ ] Migration added if the schema changes
- [ ] README updated if needed
- [ ] Everything written is in English (code, comments, docs, commit)
- [ ] Commit message follows §3
- [ ] No out-of-scope file modified
- [ ] No personal data or secret added (public repo)
