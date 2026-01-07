I have completed the task. The Net Expected Won calculation now matches PokerTracker 4 with high precision (0 mismatches > 0.05 chips).

**Summary of Changes:**
1.  **Fixed Uncontested Side Pots:** Excluded from EV calculation to match PT4.
2.  **Fixed Voluntary Folds:** Implemented fallback to Profit when a player folds after voluntary action in an uncontested pot.
3.  **Fixed Dead Cards:** Accounted for known folded/all-in cards in side pot equity calculations.
4.  **Fixed Multi-Way Ties:** Corrected equity split logic for 3+ way ties.

**Final Stats:**
-   **Total Mismatches:** 0
-   **Total EV Difference:** -0.46 chips (0.0018%)

The codebase is updated and verified.