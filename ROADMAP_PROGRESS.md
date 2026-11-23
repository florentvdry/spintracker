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
- [ ] 14. Results heatmap by hour / weekday
- [ ] 15. Soft table hours
- [ ] 16. Profit per hour
- [ ] 17. Volume and goals
- [ ] 18. End-of-session summary
- [ ] 19. Bankroll

## Phase 2 - Dashboard & My ranges

- [ ] 20. Import screen progress per room
- [ ] 21. Dashboard KPIs
- [ ] 22. 3-curve main chart
- [ ] 23. Multipliers histogram card
- [ ] 24. Ranges legend with combo %
- [ ] 25. Adherence ring
- [ ] 26. Amber deviation cells in matrix
- [ ] 27. Deviation list with hand drill-down

## Phase 3 - HUD

- [ ] 28. Nitro / classic Expresso HUD split
- [ ] 29. Colors vs pool average
- [ ] 30. Last-hands hover popup
- [ ] 31. Colour-blind palette

## Phase 4 - Replayer

- [ ] 32. Per-street equity
- [ ] 33. All-in EV badge
- [ ] 34. Clickable timeline
- [ ] 35. Stacks in bb
- [ ] 36. HUD in replayer
- [ ] 37. GTO Wizard export

## Phase 5 - Custom stats & filters

- [ ] 38. Custom stat block builder
- [ ] 39. Live preview with n
- [ ] 40. Me / Regs / Fish table
- [ ] 41. Saved filter presets
- [ ] 42. "See hands" from any figure

## Phase 6 - Opponents & review

- [ ] 43. Automatic player tags
- [ ] 44. History against a player
- [ ] 45. Review queue
- [ ] 46. Keyboard shortcuts + help

## Phase 7 - Content & streaming

- [ ] 47. Hand video export
- [ ] 48. OBS overlay server
- [ ] 49. Text export for Discord/forums

## Phase 8 - Rooms, import & platform

- [ ] P8-1. PokerStars + GGPoker parsers
- [ ] P8-2. iPoker + PMU parsers
- [ ] P8-3. PT4 / H2N exports import
- [ ] P8-4. First-run wizard
- [ ] P8-5. Backup / restore
- [ ] P8-6. macOS build without HUD
- [ ] P8-7. ES / IT / PT locales
- [ ] P8-8. History anonymizer
- [ ] P8-9. Community fixtures corpus

## Phase 9 - Big bets

- [ ] 50. Preflop exploit solver
- [ ] 51. Exploit training
- [ ] 52. In-house preflop GTO (CFR)
- [ ] 53. Coach / student mode
- [ ] 54. Open plugin platform

## Phase 10 - Docs

- [ ] 57. Remove "leak" wording
- [ ] 58. README repositioning

## Decisions

- Commit style follows AGENTS.md (`type(scope): description`); the item number goes in the commit body.
- Everything written in the repo is English (AGENTS.md section 0); UI strings exist in the fr and en locales.

- Item 8: PoolEV = P(first) x buy-in x mean multiplier - buy-in, with P(first) = (500 + chipEV) / 1500 (same model as the existing EV profit). Prize sharing in jackpot tiers is ignored: the mean already accounts for the total return. evROI = PoolEV / buy-ins of the covered tournaments.
- Item 8: multiplier tables live in a new `app_settings` table (migration 202611230001, additive); the frontend seeds it from `multiplierPresets.ts` on first launch (single source). Settings API: `GET/PUT /settings/{key}` with a key whitelist (`repos/app_settings.rs`).
- Item 8: `Room::from_name` now matches by prefix (`Betclic.fr` was classed as Other). Euro results are unchanged for Betclic (Other shared like Betclic), Unibet.fr now gets the Unibet prize sharing it was meant to have.
- No `lint` script exists in `frontend/package.json`; `tsc --noEmit` and the Vite build are used instead. Rust: `cargo check -p spintracker` clean.

- Item 9: rakeback = pct x 7% of the buy-in (RAKE_SHARE, matching the published 93% return of the multiplier tables). Rates in `app_settings` key `rakeback`. Chart lines Net Profit+RB and PoolEV+RB appear only once a rate is set.

- Items 10-13 (one engine, `engines/cev_breakdown.rs`, one route `POST /db/cev-breakdown`, one dashboard card + rows in the position block). Composition = number of opponents flagged `is_reg` in each hand: HU `vs Reg`/`vs Fish`, 3-way `2 fish`/`1 reg + 1 fish`/`2 regs`. Rows divide by total tournaments like the other position rows. Multiplier and session buckets show CEV per tournament; session = 2 h gap (same as sessions elsewhere); rank buckets 1-10, 11-20, 21-35, 36-50, 51+.
- Item 13: the equity columns (`equity_preflop`...) are never filled by the importer, so hero equity at a lost all-in is rebuilt from `ev_chips`: (EV + investment) / total pot. It is an estimate (antes and rake in the pot). Definitions: `elimination` = the lost all-in is the hero last hand of the tournament; `big_pot` = any lost all-in. N (default 5) and min equity (default 70 %) are editable on the card (not persisted).

## Blockers / missing real data

- Unibet has no multiplier preset in `multiplierPresets.ts`: its PoolEV table starts empty and Unibet tournaments are not counted until the user fills it. Real Unibet Power Spin distribution needed.
- The published distributions are for 1 EUR buy-ins only; the same table is used for every buy-in of a room unless the user adds a `room:buyin` override (backend supports it, the settings UI edits room tables only).
