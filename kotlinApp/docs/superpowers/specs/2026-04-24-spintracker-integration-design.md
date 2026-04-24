# SpinTracker Full Feature Integration Design

## Overview

Comprehensive feature integration for SpinTracker poker tracking app, implementing all 46 suggestions from todo.txt across 7 phases by category.

## Architecture

- **Platform:** Kotlin/Jetpack Compose desktop
- **Database:** SQLite with migrations
- **State:** Existing AppState pattern
- **UI:** Expand existing screens + new components

## Phases

### Phase 1: Real-Time HUD
- Features 1-2: Floating HUD overlay, dynamic player popups
- Requires active hand detection during import

### Phase 2: Opponent Intelligence
- Features 3-9: Auto-typing, badges, position stats, ranges
- Database: classification, badge columns

### Phase 3: Advanced Statistics
- Features 10-15: Board texture, confidence intervals, variance, aggression

### Phase 4: Leak Buster / AI
- Features 16-19: Auto-leak detection, GTO deviation, recommendations

### Phase 5: Study & Training
- Features 20-24: Equity calc, hand search, ICM analysis

### Phase 6: Session & Bankroll
- Features 25-28: Live tracker, bankroll graph, notes, stop limits

### Phase 7: Replayer Enhancements
- Features 29-31: Equity overlay, GTO comparison, note stickers

## Implementation Order

Per user preference: Phase by category (1 → 7)

## Notes

- GTO features use local approximation (no external APIs)
- UI follows existing dark theme patterns
- Database migrations for each phase