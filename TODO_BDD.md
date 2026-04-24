# Todo - Améliorations BDD inspirées de PT4

## [x] 2026-04-24 - Migration010_PT4Parity

### Fait:
- [x] lookup_hole_cards - table de normalisation (~91 combinaisons Hold'em)
- [x] Flags _opp/_def_opp - 25+ nouvelles colonnes pour opportunites
- [x] Equity pré-calculées - equity_percent, expected_won, expected_won_icm, amt_before, amt_*_facing
- [x] Indexes - idx_hands_tournament, idx_hands_position, idx_hands_site

### Annulé:
- [ ] Timestamp avec timezone - SQLite ne supporte pas nativement (nécessite PostgreSQL)

### Notes:
- Fichier: BDD_COMPARISON.md
- Migration: Migration010_PT4Parity.kt
- Modèle mis à jour: Models.kt (PlayerHand)