# Preflop solver: exploit against the pool, and a baseline

Status: design note. No v1 yet. Two outputs are planned, each with its own review.

## Goal

1. **Exploit**: the best answer to the ranges that the pool actually plays, estimated from the
   player's own database, split by player type (regular or fish), stack depth and position. The
   answer is what earns the most against this pool, never "an error".
2. **Baseline**: a preflop strategy computed from scratch (counterfactual regret minimisation over
   the same small tree), to compare with the exploit. No code from a source under a licence that is
   incompatible with MIT (for example AGPL solvers) is read or copied.

## Scope of v1

- Formats: 3-handed and heads-up, stacks of 25 bb or less (Spin & Go).
- Actions: fold, limp, raise, all-in; then call or fold against a raise.
- Utility: chip EV, the same figure the app already computes.

## Algorithm (sketch)

- Opponent ranges: for each type, depth bucket and position, the frequency of each action in the
  player's own hands of that group. Built from the stored actions, not from any shared database.
- Exploit: best response to those frequencies, one decision at a time, over the small tree.
- Baseline: CFR on the same tree, with the chip EV utility and a fixed iteration budget.
- Output: the action frequencies of each decision, and the chip EV gap between the two answers.

## Data and samples

- A group is shown only when it has enough hands. Below the threshold the app shows the sample size
  and does not give a conclusion.
- Every figure is computed in Rust, deterministic, and tested on synthetic trees with known answers.

## UI

- A "spot" view: the tree, the frequencies of each answer, the sample sizes, and the wording
  "what earns the most against this pool".
- Training on the player's real spots, hooked on the existing training screen.

## Limits

- The estimate is only as good as the player's own sample; a small sample is not a result.
- The baseline is an approximation on a small tree, not a full solver.
- No real-time advice: this is study, not play.

## Open points

1. The minimum sample per group (a number needs a decision).
2. Whether the baseline is shown at all in v1, or only the exploit.
