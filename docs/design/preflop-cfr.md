# In-house preflop reference strategy (item 52)

## Goal

A preflop strategy computed locally, written from scratch, to show what an unexploitable play looks
like at a given depth. It is **never** used to grade the player's hands (no comparison with a
solution, as decided for the product); it is a reference to look at and, later, a baseline for
hands an opponent never played.

## Algorithm

Counterfactual regret minimisation (CFR+) on the same abstract tree as the exploit solver:
small blind all-in or fold, big blind call or fold, heads-up, stacks of 3 to 25 bb.

- 169 hand classes per player, weighted by their number of combinations; the pair of classes that
  cannot be dealt together (blockers) is left out of the weights.
- Payoffs from the equity matrix `eq[i][j]` (Monte Carlo, fixed seed) in chips.
- Each iteration: expected value of each action of every class against the opponent's current
  strategy (a matrix product), regret update with the positive floor of CFR+, strategy = normalised
  positive regrets, average strategy weighted by the iteration.
- Stop after a fixed number of iterations; the gap between each side's best response and the value
  of the game (the exploitability) is reported.

## Licence

Nothing is taken from another solver. `postflop-solver` is AGPL and is not used or read. CFR is a
published textbook algorithm.

## Limits

Heads-up push or fold only; no limp, no raise sizes, no three-handed tree; Monte Carlo equities.
