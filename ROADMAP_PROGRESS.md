# Roadmap progress

Memory between sessions: re-read this file on every resume.
Phase 8 items are numbered P8-n here to avoid clashing with items 1-9 of phase 1.

## Baseline (before any change)
- `cargo test -p spintracker-core`: green
- `npm run frontend:test`: green (21 files, 227 tests)


## Phase 1 - Results & metrics

- [x] 8. PoolEV / evROI (editable multiplier table, dashboard + charts)
- [x] 9. Rakeback per room, PoolEV+RB and Winnings+RB charts
- [x] 10. CEV by table composition (vs Reg / vs Fish rows)
- [x] 11. CEV by multiplier
- [x] 12. CEV by session progress
- [x] 13. CEV after a bad beat
- [x] 14. Results heatmap by hour / weekday
- [x] 15. Soft table hours
- [x] 16. Profit per hour
- [x] 17. Volume and goals
- [x] 18. End-of-session summary
- [x] 19. Bankroll

## Phase 2 - Dashboard & My ranges

- [x] 20. Import screen progress per room
- [x] 21. Dashboard KPIs
- [x] 22. 3-curve main chart
- [x] 23. Multipliers histogram card
- [x] 24. Ranges legend with combo %
- [x] 25. Adherence ring
- [x] 26. Amber deviation cells in matrix
- [x] 27. Deviation list with hand drill-down

## Phase 3 - HUD

- [x] 28. Nitro / classic Expresso HUD split
- [x] 29. Colors vs pool average
- [x] 30. Last-hands hover popup
- [x] 31. Colour-blind palette

## Phase 4 - Replayer

- [x] 32. Per-street equity
- [x] 33. All-in EV badge
- [x] 34. Clickable timeline
- [x] 35. Stacks in bb
- [x] 36. HUD in replayer
- [x] 37. GTO Wizard export

## Phase 5 - Custom stats & filters

- [x] 38. Custom stat block builder
- [x] 39. Live preview with n
- [x] 40. Me / Regs / Fish table
- [x] 41. Saved filter presets
- [~] 42. (partial) "See hands" from any figure

## Phase 6 - Opponents & review

- [x] 43. Automatic player tags
- [x] 44. History against a player
- [x] 45. Review queue
- [x] 46. Keyboard shortcuts + help

## Phase 7 - Content & streaming

- [x] 47. Hand video export
- [x] 48. OBS overlay server
- [x] 49. Text export for Discord/forums

## Phase 8 - Rooms, import & platform

- [x] P8-1. (synthetic samples only) PokerStars + GGPoker parsers
- [x] P8-2. (synthetic samples only) iPoker + PMU parsers
- [x] P8-3. PT4 / H2N exports import
- [x] P8-4. First-run wizard
- [x] P8-5. Backup / restore
- [~] P8-6. (partial) macOS build without HUD
- [x] P8-7. ES / IT / PT locales
- [x] P8-8. History anonymizer
- [x] P8-9. Community fixtures corpus

## Phase 9 - Big bets

- [~] 50. Preflop exploit solver (heads-up all-in or fold only)
- [x] 51. Exploit training
- [~] 52. In-house preflop GTO (CFR) (heads-up all-in or fold only)
- [x] 53. Coach / student mode
- [~] 54. Open plugin platform (gallery from a local file, no URL fetch)

## Phase 10 - Docs

- [ ] 57. Remove "leak" wording
- [ ] 58. README repositioning

## Decisions

- P8-3: no dedicated reader for the databases of PokerTracker 4 or Hold'em Manager 3 (as asked: exports only). A new button next to Import picks a folder; every `.txt` and `.xml` under it, subfolders included, goes through the normal import (format detected file by file, other files reported as errors without stopping the run, re-import creates no duplicates). A PT4 export in the original room format or in the PokerStars layout is read by the matching parser; no real PT4 or H2N export sample was available to check, so a layout of their own would not be recognised.
- P8-4: first-run wizard (modal, once, only on a database with no hand): detects the history folders of Winamax and Unibet (already detected for the automatic import: Documents and Application Support paths, which covers Windows and macOS) and now Betclic (any `Documents` folder named like Betclic with hand files, plus its `Hand*`\/`History*` subfolders; Betclic only offers manual exports, so it is imported but not watched). The user ticks folders, optionally keeps the automatic import on for the watchable ones, and the import runs through the normal progress dialog (`import_detected_folders`, which only accepts folders the application itself detected). Detection logic is tested on temporary folders. The Betclic default location is a GUESS (name-based): no real Betclic install was available. No macOS machine was available either: macOS paths rely on Tauri's `document_dir`\/`config_dir`.
- P8-5: backup = `VACUUM INTO` a file the user picks (a consistent copy, safe while the app runs), then the copy is opened read-only and checked (`PRAGMA integrity_check`, the tables, the schema version). Restore = pick a file, same checks (a damaged file, a foreign file or one from a NEWER version is refused with a message), then it is added as a new database next to the others (a copy, named "Restored <date>", never active by itself): nothing is overwritten, the user switches with the existing databases list. The paths never go through the web side: both commands (`backup_database`, `restore_database`) are Tauri commands of the main window with native dialogs. Logic in `db/backup.rs`, tested (copy holds data, checks, refusals, registry).
- P8-6 (PARTIAL, not built on a Mac): the Rust shell already compiled the HUD as stubs outside Windows (`hud\/mod.rs`, the `windows` dependency is `cfg(windows)`). Added `src-tauri\/tauri.macos.conf.json` (dmg target, `.icns` icon, no updater artifacts, macOS 11), a `macos` job in `ci.yml` (backend tests + `cargo check -p spintracker` on `macos-latest`), and the HUD hidden on a Mac: the HUD switch of the filter bar is not drawn and the HUD page says it is Windows-only (`utils\/platform.ts`, from the webview user agent). NOT done: publishing a macOS build in the release workflow (needs an Apple signing and notarization setup, and a `darwin-*` entry in `latest.json` for the updater), so `deploy.yml` is unchanged. NOT verified: that the shell compiles and the app starts on macOS (no Mac here): the new CI job will tell on the first pull request. The main navigation is untouched: the HUD tab stays, with its explanation.
- P8-7: Spanish, Italian and Portuguese (Brazilian wording where it differs) locale files, complete: the 1442 strings of the English reference, written by me (no professional translator, no machine translation service: nothing leaves the machine) so they need a native read-through. A test (`locales.test.ts`) checks that every locale has exactly the keys of English and the same `{{placeholders}}` and tags, so a string added later must be added in all five files. The selector in Settings > General lists the five languages (`LANGUAGES` in `i18n.ts`). Wording fixed on the way: the variance simulator sentence no longer says "leak" (en, fr).
- P8-8: Settings > "Anonymise a hand history": pick a file, the room parser finds the players, every name is replaced everywhere by the same stand-in (`Hero`, `Player A`, `Player B`...) and the result is saved where the user chooses (`services/anonymizer.rs`, Tauri command `anonymize_history`, nothing leaves the machine). A name inside a longer word is left alone; figures do not change (tested by parsing before and after). Only names are changed: ids, dates and table names stay, so the user must read the file before sharing.
- P8-9: `crates/core/tests/fixtures/community/` with a README explaining how to contribute an anonymised file, and `community_corpus.rs` which parses EVERY file there (recognised by a parser, at least one hand, a hero, results adding up to the rake, no e-mail address). Seeded with copies of the three synthetic files (named `*-synthetic*`); real contributions are what is missing.

- Item 50: `engines/exploit.rs` (equity table of the 169 classes by Monte Carlo with a fixed seed, `top_range`, best responses of the small blind and of the big blind in chip EV), `services/exploit.rs` (reads the HUD figures `Call Shove` of the big blind and `Open Shove` of the small blind over the POOL rows, per stack-depth bucket, and refuses below 100 chances), route `POST /hud/exploit`, Analysis > Exploit tab (13x13 grids with the EV of acting and of folding in the tooltip, sample sizes shown). Only the heads-up all-in or fold tree: no limp, no raise sizes, no three-handed tree. The pool is ALL opponents (no regular/fish split yet, `load_pool_rows` has no such filter). The opponent range is "the top p % of hands" for a frequency p, an assumption; card removal is ignored. Chip EV only, never a tournament value, never the word mistake.
- Item 51: Analysis > Exploit > "Practise on my real hands": `POST /hud/exploit-spots` draws random heads-up hands the hero held as small or big blind (class of the cards, stack bucket), the player answers act/fold, then sees what pays most against the pool and whether it is the same. The score counts matches with what pays most (no error wording). The big blind spot is hypothetical: it always assumes an all-in from the small blind, the hand itself may not have gone that way.
- Item 52: `engines/cfr.rs` CFR+ (regret floor at zero, average strategy weighted by the round, 1500 iterations) on the same tree, `POST /reference/push-fold` for a stack of 3 to 25 BB, shown under Analysis > Exploit as a reference with its exploitability (tested below 0.05 BB at 5, 10 and 15 BB with a small equity table). Written from scratch, no solver code used. NEVER compared with the player's hands. Card removal ignored; equities are Monte Carlo, so the numbers are near an exact solution, not equal to one.
- Item 53: files `.spinpack` (ranges, custom stats, one HUD profile) and `.spinreport` (counts per scenario only). The envelope is checked in `utils/packs.ts` (format, version, kind, size, limits, kind matches content) with tests; each part is checked AGAIN by the module that stores it (ranges importer in merge mode, custom-stat validator, HUD profile sanitiser). UI in Settings > Packs. Decision: the envelope logic lives in the frontend, not in Rust, because every part that writes data already has its own Rust validator; no new route. A report holds the scenario names the student chose (own range names), counts and the pack name: no player name, no hand id, no date of a hand.
- Item 54: manifest fields (`id`, `description`, `pluginVersion`) on a pack, kinds `pack`, `stat-pack`, `hud-template`, `range-pack` (the kind must match the content), and a gallery file `spingallery` whose plugins carry the pack INLINE. NOT DONE: reading a gallery from a GitHub URL (it needs a network read outside the update flow, forbidden by the product rules); parser plugins are documented as not loaded (no user code is run).
- Design notes for all five items are in `docs/design/`.

## Phase 8 summary (done; P8-1, P8-2 synthetic only, P8-6 partial)
Items on `roadmap/phase-8-rooms-platform`. Migrations: none new in phase 8 (the review, tags, bankroll ones are phase 1 and 6). New Tauri commands: `import_hand_history_folder`, `import_detected_folders`, `backup_database`, `restore_database`, `anonymize_history`, `save_binary_file`. To test by hand: import a folder, first launch wizard (fresh database), backup then restore, switch language to ES/IT/PT, anonymise a file; the PokerStars, GGPoker and iPoker parsers need real files.

- Commit style follows AGENTS.md (`type(scope): description`); the item number goes in the commit body.
- Everything written in the repo is English (AGENTS.md section 0); UI strings exist in the fr and en locales.

- Item 8: PoolEV = P(first) x buy-in x mean multiplier - buy-in, with P(first) = (500 + chipEV) / 1500 (same model as the existing EV profit). Prize sharing in jackpot tiers is ignored: the mean already accounts for the total return. evROI = PoolEV / buy-ins of the covered tournaments.
- Item 8: multiplier tables live in a new `app_settings` table (migration 202611230001, additive); the frontend seeds it from `multiplierPresets.ts` on first launch (single source). Settings API: `GET/PUT /settings/{key}` with a key whitelist (`repos/app_settings.rs`).
- Item 8: `Room::from_name` now matches by prefix (`Betclic.fr` was classed as Other). Euro results are unchanged for Betclic (Other shared like Betclic), Unibet.fr now gets the Unibet prize sharing it was meant to have.
- No `lint` script exists in `frontend/package.json`; `tsc --noEmit` and the Vite build are used instead. Rust: `cargo check -p spintracker` clean.

- Item 9: rakeback = pct x 7% of the buy-in (RAKE_SHARE, matching the published 93% return of the multiplier tables). Rates in `app_settings` key `rakeback`. Chart lines Net Profit+RB and PoolEV+RB appear only once a rate is set.

- Items 10-13 (one engine, `engines/cev_breakdown.rs`, one route `POST /db/cev-breakdown`, one dashboard card + rows in the position block). Composition = number of opponents flagged `is_reg` in each hand: HU `vs Reg`/`vs Fish`, 3-way `2 fish`/`1 reg + 1 fish`/`2 regs`. Rows divide by total tournaments like the other position rows. Multiplier and session buckets show CEV per tournament; session = 2 h gap (same as sessions elsewhere); rank buckets 1-10, 11-20, 21-35, 36-50, 51+.
- Item 13: the equity columns (`equity_preflop`...) are never filled by the importer, so hero equity at a lost all-in is rebuilt from `ev_chips`: (EV + investment) / total pot. It is an estimate (antes and rake in the pot). Definitions: `elimination` = the lost all-in is the hero last hand of the tournament; `big_pot` = any lost all-in. N (default 5) and min equity (default 70 %) are editable on the card (not persisted).

- Items 14-17: new Analysis tab "Time" (not main navigation), `POST /db/time-stats`, `engines/time_stats.rs`. Cells use the tournament start hour and weekday in the stored (local) time of the hand histories. Soft hours = share of faced opponents not flagged `is_reg` per cell (metric toggle on the heatmap). Profit per hour uses merged play time (parallel tables counted once, 2 h gap = new session). Goals stored in `app_settings` `volume_goals`.

- Item 18: summary modal composed from existing endpoints (dashboard-stats, time-stats, multiplier-stats on the session range); opens automatically when the last session ended at least N minutes ago (default 30, 0 = off, editable in settings), at most 24 h ago and once per session (persisted in localStorage); reopen from the "Summary" link of each session in the dashboard list.
- Item 19: bankroll = deposits - withdrawals + cumulative euro result; new table `bankroll_transactions` (migration 202611230002). Buy-in recommendation uses the existing variance simulator (1000 Spins, 1500 simulations, fixed seed) with the average chip EV of the current filters and the main room table; limits 1 % (comfortable) and 5 % (acceptable).

## Phase 1 summary (done)
Items 8-19 delivered on `roadmap/phase-1-results-metrics`. Migrations: 202611230001 `app_settings`, 202611230002 `bankroll_transactions`. New routes: `GET/PUT /settings/{key}`, `POST /db/cev-breakdown`, `POST /db/time-stats`, `/bankroll/transactions`. To test by hand: Settings (PoolEV tables, rakeback, session summary), Dashboard (PoolEV line, CEV rows, breakdown card), Analysis > Time and Bankroll, session summary modal.

- Item 20: `ImportProgress` gains `tournaments`; the importer gets `inspect_files` (room + hand count per file); Tauri import emits `rooms[]` (per-room totals, hands, tournaments) and the progress dialog draws one bar per room. Tournament counts are per file (a tournament split across files would count twice). Not exercised in the real desktop app (needs a manual import).

- Items 21-23: KPI strip (profit, chip EV per tournament, tournaments, win %) above the hero card (these four figures left the hero card); main chart shows chips won, EV chips and non-showdown by default (showdown line is one legend click away, legend already existed); multipliers card gets a histogram with the share of each multiplier above the existing table.

- Items 24-27 (Adherence screen of My ranges): the editor already listed combos and % per action (ActionsCard); the adherence detail legend now shows the % of combos of each action too (All-in, Raise, Limp, Fold are the user own actions). Ring "Adhérence xx %" for the shown scenario (`AdherenceRing`). Item 26 already existed (amber `#f5c06b` ring and count badge on deviating cells with a hover card); kept. Item 27: new list `hand · planned → played · n hands`, a click opens a modal listing the hands (new route `GET /ranges/adherence/{scenario}/hands`) with a replay link per hand; the old "latest hands" list is folded in a details block. The modal is a stopgap: item 42 will send the same filter to the Hand History.

- Item 28: the format is already stored (Winamax tournament name, e.g. "Expresso Nitro", in `tournament_name`/`game_name`), so no migration or backfill: it is derived in SQL (`LIKE %nitro%`). `POST /hud/players` and `/hud/figure-hands` accept `spinFormat` (`nitro`/`classic`), the active-table list returns `spinFormat`, the Tauri HUD engine forwards it and the overlay sends it: figures of one format never include the other. Not verified against a real Nitro history (none in the repo fixtures: only classic Expresso); the Nitro detection rests on the tournament name containing "Nitro".

- Item 29: new route `POST /hud/pool` (same body as `/hud/players`) returns the figures of every opponent of the hero in the room, added together, filtered by `spinFormat`, cached 5 minutes in memory (the average of a whole base moves slowly; reading it is a pass over all hands). Profile options `poolColors` (off by default) and `poolThreshold` (points, 1-30, default 5): a figure with at least 10 opportunities more than the threshold above the pool average gets a red underline, below it a blue one; the underline sits next to the existing colour bands, which keep their text colour. Figures of custom stats and counts are not compared. Not looked at in the real HUD window.

- Item 30: the hover popup already existed (hold a stat for 1 s: stat title, player, one block per hand with cards, stack in bb, result and street-by-street actions). Aligned with the expected rendering: it opens with the 4 latest hands (was 30), each block shows the player seat (BTN/SB/BB, new `position` field of the figure-hands answer), and a "Show more hands" button loads up to 30.

- Item 31: global setting (Settings > Colour palette, stored in the browser storage, shared by the HUD window through the `storage` event). Okabe-Ito palette: gains blue, losses orange, deviations pink-purple. Tailwind `profit-positive`, `profit-negative` and `deviation` now read CSS variables (`--c-positive`...), so every place using them follows; charts (profit chart, bankroll, variance simulator), the adherence ring and bars and the HUD pool marks follow the palette in JS. Not converted: colours a user picks himself (range actions, HUD colour bands stored in layouts), the replayer and review box colours. In the variance simulator the chart option is memoised, a palette change shows after the next simulation.

## Phase 3 summary (done)
Items 28-31 on `roadmap/phase-3-hud`. No migration. New routes: `POST /hud/pool`; `spinFormat` on `/hud/players` and `/hud/figure-hands`. To test by hand in the real HUD (needs Winamax tables): Nitro vs classic separation, pool colours option in the profile inspector, hover popup with 4 hands, palette switch.

- Items 32-35 (replayer). 32: new `engines/replay_equity.rs` on top of the exact equity engine; `GET /analysis/replayer/{id}` puts an `equity` map (name -> %) on every deal of cards, for the players still in the hand whose cards are known (the preflop deal included); the seats show a bar and the percentage, updating when the deal of the current step changes. Needs at least two known hands, so a hand where villain never showed has none. 33: `allInEv` in the replay (EV minus actual profit, in bb, only when the hero was all-in and the hand has an EV) shown as the badge "All-in EV +x bb" over the table (the sign means the all-in was worth more than the result). 34 and 35 already existed (right timeline with the current action highlighted and clickable; stacks in bb with a Chips/BB switch remembered between sessions): I added the auto-scroll of the timeline to the current action. The seats default to chips (stored choice).

- Item 36: `POST /hud/players` accepts `before` (a stored date): figures count only the hands played before it (read once for the hand, not cached). The replayer shows, on each opponent seat, the first grid of the active HUD profile for the table size (HUD toggle in the controls, on by default, remembered); the replay also returns `spinFormat` so the figures follow the Nitro/classic split. Only the first grid of the layout is shown (not every grid and popup). Not looked at in the real replayer window.
- Item 37: the hand is written in the PokerStars layout, the one GTO Wizard documents for imports (copy to clipboard or save as .txt through `save_text_file`, which now takes an optional extension and is allowed from the replayer windows). Not tested against GTO Wizard itself (no access): uncalled bets returned and the tournament id are approximated. Needs a check by pasting a hand into GTO Wizard.

## Phase 4 summary (done)
Items 32-37 on `roadmap/phase-4-replayer`. No migration. Replay answer gains `equity` (per deal), `allInEv`, `spinFormat`; `/hud/players` gains `before`. To test by hand: replayer equity bars on a showdown hand, the all-in badge on an all-in hand, HUD toggle, Export > GTO Wizard (copy and file).

- Items 38-39: already present: the custom stat builder (Statistics page) has nested groups (all of / any of / not) of situation, position, stack, sizing and sequence conditions, reusing the custom stat engine, and a live preview. Only change: the preview text now starts with "n = xx opportunities".
- Item 40: new scope `me` on `GET /db/detailed-stats` (the hero hands only, needs `heroName`) and a card "Me, regs and fish" on the Statistics page: the preflop stats side by side with the sample size of each (3 requests, same filters as the page).

- Item 41: filter presets (name + one click) in the filter bar: they keep period, buy-in, position and result (not the hero, and a single session is kept as "all period"); stored in the browser storage, 20 at most, same name overwrites.

- Item 42 (PARTIAL): the mechanism is in place and tested: `POST /hud/figure-hand-ids` (hero or a player, one stat, every room), `handIds` filter on `POST /db/hands` (500 at most), `useHandsStore.showHands(title, ids)` and a banner in the hand history with a "show all hands" button. Wired to: the deviation list of My ranges (all the hands of a line, up to 200) and the detail window of a Statistics figure (only the sample hands the backend attaches to the figure, not every hand: the page figures carry no stat identity to ask the full list). NOT wired yet: dashboard CEV rows, multipliers, time heatmap cells, bankroll, the CEV breakdown card, the scope comparison table. Each needs its own hand query (by multiplier, by composition...).

## Phase 5 summary (done, 42 partial)
Items 38-42 on `roadmap/phase-5-custom-stats`. No migration. New: scope `me` on detailed-stats, hand-ids route, `handIds` filter. To test by hand: Statistics > Me, regs and fish; filter presets in the filter bar; deviation list > open in history.

- Item 43: tags put on players from their figures (new `services/auto_tags.rs`, table `player_auto_tags`, migration 202611230003). Rules are a list `{tag, stat, atLeast|atMost, threshold %, minSample}` saved under the setting `auto_tag_rules`, editable in Settings > Automatic player tags (default rules, my choice: Shover = Open Shove at least 60 % over 30 chances; Loose VPIP >= 75, Tight VPIP <= 45, Aggressive PFR >= 60, Passive PFR <= 20, each over 50 chances). Recomputed at the end of every manual import (not after each live-import hand: it reads every candidate player) and when the rules are saved. Tags are shown in the player list. They describe a style, never a verdict.
- Item 44: what the Players page had: the hands against a player with the CEV column, reg/fish toggle. Added `GET /players/summary`: games and hands in common, the hero CEV against them (total and per game), first and last game, automatic tags and an editable note (the HUD per-room note, same storage), shown at the top of the hands-against window.

- Item 45: queue of marked hands: table `review_hands` (migration 202611230004), `services/hand_review.rs` on the SAME boxes and intervals as the range cards (`review::next_state`: 0, 1, 3, 7, 21 days; a hand to look at again comes back tomorrow). Routes `/review-queue` (GET, POST, DELETE, `/answer`). Marking: bookmark button in the replayer and in the hand detail of the history (the M key arrives with item 46). Session: Analysis > Review tab: the hand due first is put forward with "I handled it well" / "Look at it again tomorrow" and a replay button; the rest of the queue is listed. The hand is replayed in the replayer window, the answer is given in the tab.

- Item 46: one list of shortcuts (`utils/shortcuts.ts`) read by the handlers and by the help screen opened with `?` (main window and replayer). Main window: `g` then `d`/`h`/`a`/`r`/`p`/`u`/`s` to go to a page, `m` marks the hand shown in the history, `?` help. Replayer: space, arrows, Home/End, `b` chips/bb, `h` HUD, `l` actions, `m` mark, `?` help. Ignored while typing in a field or with Ctrl/Alt/Meta. Not covered: the HUD windows and the dialogs (they keep their own keys).

## Phase 6 summary (done)
Items 43-46 on `roadmap/phase-6-opponents-review`. Migrations 202611230003 `player_auto_tags`, 202611230004 `review_hands`. New routes: `/players/auto-tags` (+ rules, recompute), `/players/summary`, `/review-queue`. To test by hand: Settings > automatic tags then an import, Players > hands against a player, mark a hand with M, Analysis > Review, press `?`.

- Item 49: replayer Export menu > "Copy as text for Discord or a forum": markdown with stakes, positions and stacks in bb, one line per street, showdown and result; the box "Hide the player names" (on by default) replaces the names with Hero, Villain, Villain 2 and drops the room, so no name or id leaves the app. Amounts are in big blinds (rounded to 2 decimals).

- Item 48: `services/overlay.rs`, a small HTTP server on the standard library only (no new dependency): off by default, listens on 127.0.0.1 only, answers GET `/` (the page) and GET `/stats.json` (latest session: Spins, profit, CEV per tournament, win rate, multipliers, plus the theme), refuses any request whose Host header is not `127.0.0.1:port` or `localhost:port` (DNS rebinding), other methods and paths. The page writes the figures with `textContent` and refreshes every 3 s. Settings (Settings > Streaming overlay): on/off, port (1024+, default 38417), text size, text and accent colours, transparent or dark background, figures shown; saved in `app_settings` through its own validated route (`/overlay/settings`, not the generic settings route). The server restarts when the settings change and starts with the app when it was on. It does not follow a change of the active database (restart it from the settings). Not tried inside OBS.

- Item 47: replayer Export > "Export as a video or a GIF": the table is DRAWN on a canvas (`utils/handVideo.ts`: felt, board, pot, seats with cards, stacks in bb or chips, bets, last action, equities) from the replay steps (`buildReplaySteps`, same rules as the replayer), in 16:9 (1280x720, GIF 640x360) or 9:16 (720x1280, GIF 360x640), one step every 0.6/1/1.5/2 s. Video: `MediaRecorder` on `canvas.captureStream`, MP4 (H.264) when the webview supports it, WebM otherwise (the file extension follows). GIF: own GIF89a encoder (`utils/gif.ts`, 3-3-2 palette, LZW checked against a reference decoder in the tests), no dependency. ffmpeg is NOT embedded, as asked. Saving goes through the new Tauri command `save_binary_file` (raw request body, mp4/webm/gif only, 256 MB max, main and replayer windows only). The video is recorded in real time (a 10-step hand at 1 s takes ~10 s). NOT verified here: whether the Windows webview (WebView2) records MP4 or only WebM, and the look of the frames (never seen on screen): to check by hand.

## Phase 7 summary (done)
Items 47-49 on `roadmap/phase-7-content-streaming`. No migration. New: overlay server (opt-in), `save_binary_file` command. To test by hand: Settings > Streaming overlay then open the URL in a browser and in an OBS browser source; replayer > Export > video/GIF/Discord text.

## Phase 9 summary (done; 50, 52 limited to the heads-up all-in or fold game, 54 without URL fetch)
Items 50-54 on `roadmap/phase-9-big-bets`. No migration. New routes: `POST /hud/exploit`, `POST /hud/exploit-spots`, `POST /reference/push-fold`. To test by hand: Analysis > Exploit (needs a player name in the filters and at least 100 chances at a depth; check the grids against what you know of the pool), the practice quiz, the reference strategy with the stack slider; Settings > Packs (create a pack of ranges, open it on a second database, apply, make a report, open it); open a gallery file.

## Blockers / missing real data

- **P8-1 PokerStars and GGPoker**: no real hand history of either room is in the repo. Both parsers (`parsers/stars_like.rs` shared body, `pokerstars.rs`, `ggpoker.rs`) are written from the documented layout and tested on SYNTHETIC hands (`crates/core/tests/fixtures/synthetic/`, with a README saying so), end to end (detection, import, re-import without duplicate). Real samples needed: a PokerStars Spin & Go file and a GGPoker Spin Gold file, ideally with their tournament summary (the prize pool / multiplier is not in the hand history, so these tournaments stay "unpriced" until a summary reader exists), including a hand with antes, an uncalled bet, a split pot and a walk. GGPoker header most uncertain. Dates are kept in the room time zone (PokerStars `ET`), not converted to UTC.
- **P8-2 iPoker and PMU (Twister)**: PMU Poker runs on the iPoker network, so one parser (`parsers/ipoker.rs`) covers both (room `PMU` when `<site>` says so, else `iPoker`). The XML is rewritten into the PokerStars-like text and read by the shared body parser. The XML layout is DOCUMENTED in the module header but was written WITHOUT a real file: tag names, the self-contained `<game>`, the suit-first card codes and above all the action codes (0 fold, 1 SB, 2 BB, 3 call, 4 check, 5 bet, 7 all-in, 15 ante, 23 raise) are the parts to check. Real samples needed: an iPoker XML export and a PMU Twister export, including a multi-hand file and a hand with an ante or side pot. Buy-in, level and the prize pool are not read from the hand (level fixed to I; multiplier unknown).

- Unibet has no multiplier preset in `multiplierPresets.ts`: its PoolEV table starts empty and Unibet tournaments are not counted until the user fills it. Real Unibet Power Spin distribution needed.
- The published distributions are for 1 EUR buy-ins only; the same table is used for every buy-in of a room unless the user adds a `room:buyin` override (backend supports it, the settings UI edits room tables only).

- **Phase 9 exploit solver**: only the heads-up all-in or fold game exists. The roadmap asks for an abstract tree with limp and raise sizes and the three-handed tree: not done. The model of the opponent is a frequency turned into "the top p % of hands", never a real range. No regular/fish split of the pool yet. The numbers need a check against a database with real Winamax tables; none was available here.
- **Phase 9 gallery**: no URL fetching (GitHub raw index) by design; nothing was tried with a real shared pack between two computers.
