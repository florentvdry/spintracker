The fix for `WentToShowdown` logic is verified and correct.

### Changes Made
1.  **Refactored `BetclicParser.cs`**:
    -   Removed the incorrect logic block (lines 612-615) that was forcing `WentToShowdown = true` for Hero simply because they had hole cards during a showdown.
    -   Verified that the consolidation logic (lines 676+) correctly respects `p.Folded`.
    -   Cleaned up temporary debug logs.

2.  **Updated `ComparisonTool.cs`**:
    -   Fixed a bug in the comparison tool itself where it was comparing Hand-level showdown status against Player-level showdown status in the SQLite DB check. It now correctly compares `HeroWentToShowdown`.

### Verification Results
1.  **Specific Hand (`01KDZZZY2WYWA83GK1QF6VH1B6`)**:
    -   Debug import confirms `jmenfouu.WentToShowdown` is now `False`.
    -   Comparison tool no longer reports this hand as a mismatch against the DB (since the DB entry for this hand was updated by our test).

2.  **Overall Comparison (`dotnet run --compare`)**:
    -   **Total Mismatches with PT4: 0**
    -   Profit, EV, and Showdown counts match exactly between the Local Parser and PT4.

### Note on SQLite DB
The comparison tool reports mismatches against the SQLite DB ("Local=False, DB=True") for *other* hands. This is expected because the database contains old data imported with the previous buggy logic. To fully synchronize the database, a full re-import of the hands is recommended.
