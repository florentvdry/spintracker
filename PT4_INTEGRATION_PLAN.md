# Plan d'Intégration PT4 — SpinTracker

> **Objectif**: Aligner SpinTracker avec PokerTracker 4 en activant TOUTES les tables inutilisées et en comblant les écarts fonctionnels.
> **Date**: 2026-04-30

---

## PRINCIPE DIRECTEUR

Chaque table définie dans le schéma SpinTracker doit avoir un usage concret dans le code. Chaque table PT4 pertinente doit avoir un équivalent fonctionnel dans SpinTracker.

---

## PHASE 1: NETTOYAGE & ALIGNEMENT INTERNE (Semaines 1-2)

### 1.1 Supprimer la table `stats` (orpheline)

**Problème**: Créée dans Migration001, remplacée par `player_stats_cache` (M007).

**Actions**:
- [ ] Créer `Migration015_DropStatsTable.kt` — `DROP TABLE IF EXISTS stats`
- [ ] Vérifier qu'aucune référence ne subsiste dans le code (search: `stats` table)
- [ ] Nettoyer `deleteAllHands()` et `deleteAllData()` dans Database.kt (supprimer les `DELETE FROM stats`)

**Impact**: Nettoyage, aucune perte de données fonctionnelles.

---

### 1.2 Synchroniser ORM Exposed avec la DB réelle

**Problème**: `Tables.kt` et `Entities.kt` ne référencent que ~56 colonnes de `player_hands` alors que la DB en a ~90+.

**Fichiers concernés**:
- `kotlinApp/src/desktopMain/kotlin/spintracker/data/Tables.kt`
- `kotlinApp/src/desktopMain/kotlin/spintracker/data/Entities.kt`

**Colonnes à ajouter dans `PlayerHands` (Tables.kt)**:

| Migration | Colonnes manquantes |
|-----------|-------------------|
| M003 | `site_id` |
| M010 | `flg_vpip_opp`, `flg_pfr_opp`, `flg_3bet_opp`, `flg_4bet_opp`, `flg_cbet_flop_opp`, `flg_cbet_turn_opp`, `flg_cbet_river_opp`, `flg_donk_flop_opp`, `flg_float_flop_opp`, `flg_checkraise_flop_opp`, `flg_checkraise_turn_opp`, `flg_checkraise_river_opp`, `flg_saw_flop_opp`, `flg_went_to_showdown_opp`, `flg_folded_to_cbet_opp`, `flg_steal_opp`, `flg_blind_def_opp`, `flg_sb_steal_fold_opp`, `flg_bb_steal_fold_opp`, `flg_has_position_flop_opp`, `flg_has_position_turn_opp`, `flg_has_position_river_opp`, `flg_was_steal_attempt_opp`, `flg_faced_3bet_opp`, `flg_faced_4bet_opp`, `flg_faced_squeeze_opp`, `flg_def_cbet_flop_opp`, `flg_def_cbet_turn_opp`, `flg_def_cbet_river_opp`, `flg_donk_flop_def_opp`, `flg_float_flop_def_opp` (27+ flags _opp) |
| M010 | `equity_percent_real`, `expected_won_real`, `expected_won_icm` |
| M011 | `aggressor_position_flop`, `aggressor_position_turn`, `aggressor_position_river`, `spr_turn`, `spr_river`, `flg_face_raise_opp`, `flg_p_open` |
| M012 | `cnt_raise_flop`, `cnt_raise_turn`, `cnt_raise_river`, `cnt_call_flop`, `cnt_call_turn`, `cnt_call_river`, `total_bounty_won`, `combo_type`, `pot_flop`, `pot_turn`, `pot_river` |
| M011 | `amt_bet_flop`, `amt_bet_turn`, `amt_bet_river`, `amt_raise_facing_flop`, `amt_raise_facing_turn`, `amt_raise_facing_river` |

**Colonnes à ajouter dans `Hands` (Tables.kt)**:
- `site_id` (M003)
- `players_flop`, `players_turn`, `players_river` (M011)
- `imported_at` (M011)
- `pot_flop`, `pot_turn`, `pot_river` (M012)

**Colonnes à ajouter dans `Players` (Tables.kt)**:
- `site_id` (M003)

**Dans Entities.kt**: Répliquer exactement les mêmes colonnes dans les DAO correspondants.

---

### 1.3 Activer `lookup_hole_cards`

**Problème**: 169 combinaisons seedées mais jamais utilisées. `PlayerHand.holeCardId` existe dans le modèle mais pas dans l'ORM.

**Actions**:
- [ ] Ajouter `holeCardId` dans `PlayerHands` (Tables.kt) comme `reference("hole_card_id", LookupHoleCards).nullable()`
- [ ] Créer DAO `LookupHoleCards` dans Entities.kt
- [ ] Créer `LookupHoleCardsRepository.kt`
- [ ] Modifier ImportService pour:
  - Convertir `hole_cards` TEXT (ex: "AsKs") en `id_holecard` (ex: 169)
  - Stocker `holeCardId` au lieu de TEXT
  - Garder `hole_cards` TEXT comme fallback/legacy
- [ ] Créer une migration `Migration016_AddHoleCardIdFk.kt`:
  - `ALTER TABLE player_hands ADD COLUMN hole_card_id INTEGER REFERENCES lookup_hole_cards(id)`
  - Backfill: convertir les TEXT existants en IDs via une requête de mapping

**Bénéfice**: Normalisation, requêtes par type de main (ex: "toutes les mains AKs"), cohérence avec PT4.

---

### 1.4 Lier `tourney_types` à `tournaments`

**Problème**: Table créée et peuplée (6 types) mais aucun lien FK.

**Actions**:
- [ ] Créer `Migration017_AddTourneyTypeFk.kt`:
  - `ALTER TABLE tournaments ADD COLUMN tourney_type_id INTEGER REFERENCES tourney_types(id)`
- [ ] Ajouter `tourneyTypeId` dans `Tournaments` (Tables.kt)
- [ ] Ajouter `tourneyTypeId` dans `Tournament` DAO (Entities.kt)
- [ ] Ajouter `tourneyTypeId: Int?` dans `Tournament` model (Models.kt) — **déjà présent**
- [ ] Modifier ImportService pour détecter le type de tournoi:
  - "Hyper" / speed level → `id=2` (Speed)
  - "KO" / "PKO" dans le nom → `id=4/5/6`
  - Default → `id=1` (Regular)
- [ ] Modifier `getTournaments()` dans Database.kt pour inclure `tt.name AS tourney_type_name` via JOIN
- [ ] Afficher le type dans TournamentsScreen.kt

---

### 1.5 Décider du sort de `blind_structures`

**Deux options**:

#### Option A: Implémenter (recommandé si SpinTracker gère des tournois multi-tables)

**Actions**:
- [ ] Créer `BlindStructure` model (Models.kt): `id, tournamentId, level, smallBlind, bigBlind, ante, durationMinutes`
- [ ] Créer `BlindStructures` table (Tables.kt)
- [ ] Créer `BlindStructureEntity` (Entities.kt)
- [ ] Créer `BlindStructuresRepository.kt` avec CRUD
- [ ] Parser la structure de blinds depuis les hand histories (si disponible dans les fichiers)
- [ ] Afficher la structure dans TournamentsScreen (timeline des blinds)
- [ ] Calculer le niveau de blind courant pour un tournoi en cours

#### Option B: Supprimer (si SpinTracker reste uniquement Spin & Go)

**Actions**:
- [ ] Créer `Migration018_DropBlindStructures.kt`: `DROP TABLE IF EXISTS blind_structures`
- [ ] Supprimer toute référence dans le code

**Recommandation**: Option B par défaut. Les Spin & Go ont une structure fixe connue (10 levels). Stocker cette information est redondant. Implémenter uniquement si support de tournois MTT ajouté.

---

## PHASE 2: CALCUL DES FLAGS OPPONENT (Semaines 3-4)

### 2.1 Calculer les 27+ flags _opp/_def_opp pendant l'import

**Problème**: Les colonnes existent en DB mais ImportService ne les calcule jamais.

**Fichier**: `kotlinApp/src/desktopMain/kotlin/spintracker/services/ImportService.kt`

**Architecture de calcul**:

```
Pour chaque main:
  1. Identifier le HERO vs les OPPONENTS
  2. Pour chaque OPPONENT, calculer les flags par rapport au HERO:
     - flg_vpip_opp: a fait un call/raise preflop (sans SB/BB si fold)
     - flg_pfr_opp: a raise preflop
     - flg_3bet_opp: a 3-bet preflop
     - flg_4bet_opp: a 4-bet preflop
     - flg_cbet_flop_opp: a cbet au flop
     - flg_donk_flop_opp: a donk bet au flop
     - flg_float_flop_opp: a callé cbet au flop
     - flg_checkraise_flop_opp: a check-raise au flop
     - flg_saw_flop_opp: a vu le flop
     - flg_went_to_showdown_opp: est allé au showdown
     - flg_folded_to_cbet_opp: a fold face à un cbet
     - flg_steal_opp: a tenté un steal
     - flg_blind_def_opp: a défendu sa blind
     - flg_sb_steal_fold_opp: a fold SB face à un steal
     - flg_bb_steal_fold_opp: a fold BB face à un steal
     - flg_has_position_flop_opp: a position au flop
     - flg_was_steal_attempt_opp: faisait face à un steal attempt
     - flg_faced_3bet_opp: a fait face à un 3-bet
     - flg_faced_4bet_opp: a fait face à un 4-bet
     - flg_faced_squeeze_opp: a fait face à un squeeze
     - flg_def_cbet_flop_opp: a défendu vs cbet flop (call/raise)
     - ... et tous les variants _def_opp
  3. Sauvegarder les flags pour chaque joueur dans la main
```

**Implémentation**:
- [ ] Créer `calculateOpponentFlags(hand: ParsedHand, heroName: String): Map<String, PlayerHandFlags>` dans ImportService
- [ ] La fonction prend le `ParsedHand`, identifie le héros, et calcule les flags pour chaque opponent
- [ ] Intégrer dans le pipeline d'import après `calculateActionFlags`
- [ ] Ajouter les colonnes _opp aux prepared statements d'insertion

**Colonnes à insérer** (exemple pour un joueur donné dans une main):
```sql
INSERT INTO player_hands (..., flg_vpip_opp, flg_pfr_opp, flg_3bet_opp, ...)
VALUES (..., ?, ?, ?, ...)
```

### 2.2 Utiliser les flags _opp dans les statistiques

**Fichier**: `kotlinApp/src/desktopMain/kotlin/spintracker/data/Database.kt`

**Nouvelles requêtes**:

| Requête | Description | Colonnes utilisées |
|---------|-------------|-------------------|
| `getOpponentVPIP(playerId)` | VPIP d'un opponent spécifique vs hero | `flg_vpip_opp`, `flg_saw_flop_opp` |
| `getOpponentPFR(playerId)` | PFR d'un opponent vs hero | `flg_pfr_opp`, `flg_saw_flop_opp` |
| `getOpponent3Bet(playerId)` | 3-bet% d'un opponent vs hero | `flg_3bet_opp`, `flg_faced_3bet_opp` |
| `getOpponentCBet(playerId)` | CBet% d'un opponent | `flg_cbet_flop_opp`, `flg_saw_flop_opp` |
| `getOpponentFoldToCBet(playerId)` | Fold to CBet% d'un opponent | `flg_folded_to_cbet_opp`, `flg_def_cbet_flop_opp` |
| `getOpponentSteal(playerId)` | Steal% d'un opponent | `flg_steal_opp`, `flg_was_steal_attempt_opp` |
| `getOpponentBlindDef(playerId)` | Blind Defense% d'un opponent | `flg_blind_def_opp` |
| `getOpponentAllStats(playerId)` | Toutes les stats vs un opponent | Toutes les colonnes _opp |

**Intégration UI**:
- [ ] PlayersScreen.kt: Afficher les stats détaillées vs chaque player
- [ ] AnalyticsScreen.kt: Section "Against Specific Opponent"
- [ ] PlayerPopup.kt: Ajouter les stats _opp dans le popup

---

## PHASE 3: COLONNES NON UTILISÉES (Semaines 5-6)

### 3.1 Calculer et stocker les montants par rue

**Colonnes concernées**: `amt_bet_flop/turn/river`, `amt_raise_facing_flop/turn/river`

**Actions**:
- [ ] Modifier ImportService pour calculer ces montants pendant le parsing:
  - `amt_bet_flop`: total misé par le joueur au flop
  - `amt_raise_facing_flop`: montant du raise auquel le joueur fait face
- [ ] Ajouter ces colonnes aux prepared statements
- [ ] Créer des requêtes d'analyse utilisant ces montants:
  - `getAvgBetSizeFlop(playerId)`: avg bet size au flop
  - `getBetSizingByStreet(playerId)`: sizing par rue

### 3.2 Calculer et stocker les compteurs d'actions

**Colonnes concernées**: `cnt_raise_flop/turn/river`, `cnt_call_flop/turn/river`

**Actions**:
- [ ] Modifier ImportService pour compter les raises/calls par rue
- [ ] Ajouter aux prepared statements
- [ ] Utiliser dans les stats avancées (ex: "cnt_raise_flop / hands_with_action_flop" = Raise Frequency Flop)

### 3.3 Utiliser `aggressor_position_flop/turn/river`

**Actions**:
- [ ] Calculer pendant l'import: identifier la position de l'agresseur initial à chaque rue
- [ ] Utiliser dans l'analyse: "Quand le BTN est agresseur au flop, quel est mon winrate?"

### 3.4 Utiliser `total_bounty_won` et `combo_type`

**Actions**:
- [ ] `total_bounty_won`: Calculer le total des bounties gagnés par joueur sur un tournoi KO/PKO
  - Ajouter au calcul du profit total dans Dashboard
  - Afficher dans TournamentsScreen pour les tournois KO
- [ ] `combo_type`: Déterminer si la main est jouée en 3-bet pot, 4-bet pot, single raised, multiway
  - Utiliser pour filtrer les mains par type de pot dans RangeResearchScreen

### 3.5 Utiliser `pot_flop/turn/river`

**Actions**:
- [ ] Calculer la taille du pot à chaque rue pendant l'import
- [ ] Afficher dans le replayer pour plus de contexte
- [ ] Utiliser pour les calculs de SPR (déjà implémentés mais peuvent être améliorés)

### 3.6 Utiliser `equity_percent_real`, `expected_won_real`, `expected_won_icm`

**Problème**: Ces champs existent dans le modèle `PlayerHand` mais pas dans l'ORM.

**Actions**:
- [ ] Créer `Migration019_AddRealEquityColumns.kt` si les colonnes n'existent pas en DB
- [ ] Ajouter dans `Tables.kt` et `Entities.kt`
- [ ] Calculer via AnalyticsService pendant l'import (déjà implémenté, juste brancher)
- [ ] Afficher dans le Dashboard: "Realized EV" vs "Chip EV"

---

## PHASE 4: NOUVELLES FONCTIONNALITÉS PT4 (Semaines 7-9)

### 4.1 Ajouter `id_gametype` (distinction Hold'em / Omaha)

**Actions**:
- [ ] Créer `Migration020_AddGameType.kt`:
  - `ALTER TABLE tournaments ADD COLUMN id_gametype INTEGER DEFAULT 1` (1=Hold'em)
  - `ALTER TABLE hands ADD COLUMN id_gametype INTEGER DEFAULT 1`
  - `ALTER TABLE player_hands ADD COLUMN id_gametype INTEGER DEFAULT 1`
- [ ] Créer une table lookup `game_types` (id, name): `(1, 'Hold'em'), (2, 'Omaha'), (3, 'Omaha Hi/Lo')`
- [ ] Détecter le type de jeu pendant le parsing:
  - 2 cartes = Hold'em
  - 4 cartes = Omaha
- [ ] Ajouter le filtre par game type dans Header.kt
- [ ] Filtrer toutes les requêtes de stats par `id_gametype`

### 4.2 Pré-calculer les pourcentages `val_*_pct`

**Concept**: PT4 stocke les pourcentages pré-calculés pour éviter de les recalculer à chaque requête.

**Actions**:
- [ ] Créer `Migration021_AddPrecomputedPctColumns.kt`:
  - `ALTER TABLE player_stats_cache ADD COLUMN val_vpip_pct REAL`
  - `ALTER TABLE player_stats_cache ADD COLUMN val_pfr_pct REAL`
  - `ALTER TABLE player_stats_cache ADD COLUMN val_3bet_pct REAL`
  - `ALTER TABLE player_stats_cache ADD COLUMN val_cbet_flop_pct REAL`
  - `ALTER TABLE player_stats_cache ADD COLUMN val_fold_to_cbet_pct REAL`
  - `ALTER TABLE player_stats_cache ADD COLUMN val_steal_pct REAL`
  - `ALTER TABLE player_stats_cache ADD COLUMN val_blind_def_pct REAL`
- [ ] Modifier `StatsCacheRepository` pour calculer et stocker les pourcentages
- [ ] Utiliser les valeurs pré-calculées dans le HUD (plus rapide)

### 4.3 Ajouter `str_actors` et `str_aggressors` (encodage compact des acteurs)

**Concept**: PT4 encode les joueurs qui ont agi à chaque rue dans un string compact (ex: "134" = joueurs 1, 3, 4 ont agi au flop).

**Actions**:
- [ ] Créer `Migration022_AddActorStrings.kt`:
  - `ALTER TABLE hands ADD COLUMN str_actors_preflop TEXT`
  - `ALTER TABLE hands ADD COLUMN str_actors_flop TEXT`
  - `ALTER TABLE hands ADD COLUMN str_actors_turn TEXT`
  - `ALTER TABLE hands ADD COLUMN str_actors_river TEXT`
  - `ALTER TABLE hands ADD COLUMN str_aggressors_flop TEXT`
  - `ALTER TABLE hands ADD COLUMN str_aggressors_turn TEXT`
  - `ALTER TABLE hands ADD COLUMN str_aggressors_river TEXT`
- [ ] Calculer pendant l'import:
  - `str_actors_flop`: IDs des joueurs ayant fait une action au flop
  - `str_aggressors_flop`: ID du dernier agresseur au flop
- [ ] Utiliser dans le replayer pour reconstruire l'action plus précisément

### 4.4 Table `tourney_results` (résultats par joueur par tournoi)

**Concept**: PT4 a une table dédiée pour les résultats au lieu de calculer à la volée.

**Actions**:
- [ ] Créer `Migration023_CreateTourneyResults.kt`:
  ```sql
  CREATE TABLE IF NOT EXISTS tourney_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    place INTEGER,
    prize REAL,
    profit REAL,
    cnt_rebuy INTEGER DEFAULT 0,
    cnt_addon INTEGER DEFAULT 0,
    bounty_won REAL DEFAULT 0,
    ev REAL,
    realized_ev REAL,
    bb_per_100 REAL
  );
  CREATE INDEX idx_results_tournament ON tourney_results(tournament_id);
  CREATE INDEX idx_results_player ON tourney_results(player_id);
  ```
- [ ] Créer le modèle `TourneyResult` (Models.kt)
- [ ] Créer la table Exposed et le DAO
- [ ] Créer `TourneyResultsRepository.kt`
- [ ] Peupler lors de l'import d'un tournoi complet (après toutes les mains)
- [ ] Remplacer les calculs à la volée dans TournamentsScreen par des requêtes sur cette table

### 4.5 Table `lookup_hand_groups` (groupes de mains)

**Concept**: PT4 classe les mains en groupes (PP, Broadway, Suited Connectors, etc.)

**Actions**:
- [ ] Créer `Migration024_CreateLookupHandGroups.kt`:
  ```sql
  CREATE TABLE IF NOT EXISTS lookup_hand_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    hand_pattern TEXT -- ex: "PP" pour pocket pairs
  );
  ```
- [ ] Seeder les groupes:
  - Pocket Pairs (AA-22)
  - Broadways (AK-AQ-AJ-KQ)
  - Suited Connectors (T9s-43s)
  - Suited Aces (A5s-A2s)
  - Offsuit Connectors
  - Trash
- [ ] Mapper `hand_group` dans `player_hands` vers cette table
- [ ] Utiliser pour les filtres dans RangeResearchScreen

---

## PHASE 5: INTÉGRATION FRONTEND & HUD (Semaines 10-12)

### 5.1 HUD amélioré

**Actions**:
- [ ] StatsOverlay.kt: Afficher 10+ stats au lieu de 3:
  - VPIP, PFR, 3Bet, CBet Flop, Fold to CBet, Steal, WTSD, W$SD, AFq, Hands
- [ ] Color-coding basé sur des seuils:
  - VPIP: vert (<20), jaune (20-30), rouge (>30)
  - PFR: vert (>15), jaune (10-15), rouge (<10)
- [ ] Afficher le sample size (nombre de mains)
- [ ] Support du filtrage positionnel (VPIP en position vs hors position)

### 5.2 PlayerPopup enrichi

**Actions**:
- [ ] Onglet "Vs Hero" avec stats _opp
- [ ] Onglet "Global" avec stats générales
- [ ] Graphique de tendance (évolution VPIP/PFR sur les 100 dernières mains)
- [ ] Notes intégrées (déjà implémenté, mais améliorer l'UX)

### 5.3 AnalyticsScreen — Nouvelles sections

**Actions**:
- [ ] Section "Bet Sizing": avg bet size par rue, sizing vs cbet, sizing en position
- [ ] Section "Pot Types": performance par combo_type (3-bet pot, 4-bet pot, multiway)
- [ ] Section "Game Types": comparer les stats Hold'em vs Omaha (si supporté)
- [ ] Section "Tourney Types": performance par type de tournoi (Regular, Speed, KO, PKO)
- [ ] Section "Realized EV": comparaison Chip EV vs Realized EV

### 5.4 TournamentsScreen amélioré

**Actions**:
- [ ] Afficher le type de tournoi (via FK tourney_types)
- [ ] Afficher le nombre de mains (via tourney_results)
- [ ] Timeline des blinds (si blind_structures implémenté)
- [ ] Résultats détaillés par joueur (via tourney_results)
- [ ] Total bounty won pour les tournois KO

### 5.5 Dashboard amélioré

**Actions**:
- [ ] Ajouter "Realized EV" aux métriques clés
- [ ] Ajouter "Total Bounty Won" si KO/PKO
- [ ] Breakdown par type de tournoi
- [ ] Breakdown par game type

---

## PHASE 6: MIGRATION & BACKFILL (Semaine 13)

### 6.1 Services de backfill

**Créer des services pour peupler les nouvelles colonnes sur les données existantes**:

| Service | Colonnes backfillées |
|---------|---------------------|
| `OpponentFlagsBackfillService` | Tous les flags _opp/_def_opp |
| `BetAmountsBackfillService` | amt_bet_flop/turn/river, amt_raise_facing |
| `ActionCountsBackfillService` | cnt_raise/call par rue |
| `PotSizesBackfillService` | pot_flop/turn/river |
| `ActorStringsBackfillService` | str_actors_*, str_aggressors_* |
| `TourneyResultsBackfillService` | Données tourney_results |
| `HoleCardIdBackfillService` | hole_card_id depuis hole_cards TEXT |

**Architecture**:
- Chaque service extends `StatsBackfillService` (abstraction existante)
- Exécution en batch avec transaction par lot de 1000 mains
- Progress reporting pour l'UI

### 6.2 Script de migration complète

**Actions**:
- [ ] Créer un mode "Full Migration" dans les Settings
- [ ] Exécuter tous les backfill services séquentiellement
- [ ] Validation: comparer les stats avant/après migration
- [ ] Option de rollback (garder un backup de la DB)

---

## RÉCAPITULATIF DES MIGRATIONS

| # | Migration | Description | Priorité |
|---|-----------|-------------|----------|
| 15 | `Migration015_DropStatsTable` | Supprimer table stats orpheline | 🔴 P0 |
| 16 | `Migration016_AddHoleCardIdFk` | Ajouter FK hole_card_id | 🟡 P1 |
| 17 | `Migration017_AddTourneyTypeFk` | FK tourney_type_id sur tournaments | 🟡 P1 |
| 18 | `Migration018_DropBlindStructures` | Supprimer blind_structures (optionnel) | 🟢 P2 |
| 19 | `Migration019_AddRealEquityColumns` | equity_percent_real, expected_won_real, icm | 🟡 P1 |
| 20 | `Migration020_AddGameType` | id_gametype sur tournaments/hands/player_hands | 🔴 P0 |
| 21 | `Migration021_AddPrecomputedPctColumns` | val_*_pct dans player_stats_cache | 🟡 P1 |
| 22 | `Migration022_AddActorStrings` | str_actors/str_aggressors sur hands | 🟢 P2 |
| 23 | `Migration023_CreateTourneyResults` | Table tourney_results | 🟡 P1 |
| 24 | `Migration024_CreateLookupHandGroups` | Table lookup_hand_groups | 🟢 P2 |

---

## RÉCAPITULATIF DES FICHIERS À MODIFIER

| Fichier | Phase | Modifications |
|---------|-------|---------------|
| `data/Tables.kt` | 1.2 | +40 colonnes sur PlayerHands, +4 sur Hands, +1 sur Players |
| `data/Entities.kt` | 1.2 | +40 colonnes sur PlayerHandEntity, +4 sur HandEntity |
| `data/Database.kt` | 2.2, 3.x, 4.x | +10 requêtes, modification des INSERT prepared statements |
| `services/ImportService.kt` | 2.1, 3.x | calculateOpponentFlags(), calcul montants/compteurs |
| `models/Models.kt` | 1.3, 4.x | holeCardId, tourneyTypeId, id_gametype, nouveaux modèles |
| `data/StatsCacheRepository.kt` | 4.2 | Pré-calcul des pourcentages |
| `ui/components/StatsOverlay.kt` | 5.1 | +7 stats, color-coding |
| `ui/components/PlayerPopup.kt` | 5.2 | Onglet Vs Hero |
| `ui/screens/AnalyticsScreen.kt` | 5.3 | +4 sections |
| `ui/screens/TournamentsScreen.kt` | 5.4 | Type, mains, results |
| `ui/screens/DashboardScreen.kt` | 5.5 | +3 métriques |

---

## MATRICE D'ACTIVATION DES TABLES

| Table | État actuel | Action | État final |
|-------|-------------|--------|------------|
| `stats` | Orpheline | **SUPPRIMER** (M015) | N/A |
| `blind_structures` | Orpheline | **SUPPRIMER** (M018) ou implémenter | Active ou N/A |
| `lookup_hole_cards` | Partiellement orpheline | **ACTIVER** (FK, backfill, import) | **ACTIVE** |
| `tourney_types` | Minimalement utilisée | **ACTIVER** (FK, import, display) | **ACTIVE** |
| `player_stats_cache` | Active (4 stats) | **ÉTENDRE** (7+ pct pré-calculés) | **ACTIVE++** |
| `lookup_hand_groups` | N'existe pas | **CRÉER** (M024, seed, mapper) | **ACTIVE** |
| `tourney_results` | N'existe pas | **CRÉER** (M023, peupler à l'import) | **ACTIVE** |
| `preflop_equity_lookup` | Active (partielle) | **ÉTENDRE** (plus de situations) | **ACTIVE++** |
| `players` | Active | Ajouter site_id dans ORM | **ACTIVE++** |
| `tournaments` | Active | Ajouter FK tourney_type_id, id_gametype | **ACTIVE++** |
| `hands` | Active | Ajouter actor strings, pot per street | **ACTIVE++** |
| `player_hands` | Active (56/90 cols ORM) | Ajouter 34+ cols dans ORM, calculer _opp | **ACTIVE++** |

---

## ESTIMATION DE L'EFFORT TOTAL

| Phase | Semaines | Complexité | Risque |
|-------|----------|------------|--------|
| 1. Nettoyage & Alignement | 2 | Moyenne | Faible |
| 2. Flags Opponent | 2 | Haute | Moyen |
| 3. Colonnes non utilisées | 2 | Moyenne | Faible |
| 4. Nouvelles fonctionnalités | 3 | Haute | Moyen |
| 5. Frontend & HUD | 3 | Moyenne | Faible |
| 6. Migration & Backfill | 1 | Haute | Moyen |
| **Total** | **~13 semaines** | | |

---

## CRITÈRES DE SUCCÈS

- [ ] **Zéro table orpheline**: Toutes les tables ont au moins un SELECT et un INSERT dans le code
- [ ] **ORM synchronisé**: Tables.kt/Entities.kt matchent 100% les colonnes en DB
- [ ] **Flags _opp calculés**: 100% des 27+ flags opponent sont calculés pendant l'import
- [ ] **HUD amélioré**: 10+ stats affichées avec color-coding
- [ ] **id_gametype fonctionnel**: Filtrage Hold'em/Omaha opérationnel
- [ ] **tourney_results**: Résultats pré-calculés, plus de requêtes à la volée
- [ ] **lookup_hole_cards**: hole_cards TEXT mappés vers FK
- [ ] **tourney_types FK**: 100% des tournois ont un type lié
- [ ] **Backfill OK**: Données existantes migrées sans perte
