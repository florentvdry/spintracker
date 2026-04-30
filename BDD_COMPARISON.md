# Comparaison BDD: SpinTracker vs PokerTracker 4

> Analyse complète de l'alignement de la base de données SpinTracker avec PokerTracker 4.
> Date: 2026-04-30

---

## 1. LISTE DES TABLES

### 1.1 Tables PT4 (PostgreSQL)

| Table | Description | Colonnes approx. |
|-------|-------------|------------------|
| `player` | Joueurs | ~10 |
| `tourney_summary` | Résumé tournois | ~48 |
| `tourney_hand_summary` | Résumé mains tournois | ~48 |
| `tourney_hand_player_statistics` | Stats joueurs par main tournoi | **300+** |
| `tourney_results` | Résultats joueurs par tournoi | ~15 |
| `tourney_cache` | Cache stats tournois | variable |
| `tourney_custom_cache` | Cache stats personnalisées tournois | variable |
| `cash_hand_summary` | Résumé mains cash | ~48 |
| `cash_hand_player_statistics` | Stats joueurs par main cash | **300+** |
| `cash_cache` | Cache stats cash | variable |
| `cash_custom_cache` | Cache stats personnalisées cash | variable |
| `cash_limit` | Limites cash (incl. Zoom) | ~10 |
| `cash_table` | Infos tables cash | ~10 |
| `lookup_actions` | Actions poker normalisées | ~10 |
| `lookup_positions` | Positions normalisées | ~10 |
| `lookup_hand_ranks` | Classements de mains | ~10 |
| `lookup_hand_groups` | Groupes de mains | ~20 |
| `lookup_hole_cards` | Combinaisons de cartes | 169 (Hold'em) |
| `lookup_suits_omaha` | Suits Omaha | ~10 |
| `lookup_sites` | Sites de poker | ~10 |
| `lookup_tourney_type` | Types de tournois | ~10 |

### 1.2 Tables SpinTracker (SQLite)

| Table | Créée dans | Colonnes | Utilisée ? |
|-------|-----------|----------|------------|
| `players` | Migration001 | 5 (+ site_id) | **ACTIVE** |
| `tournaments` | Migration001 | 13 (+ extensions M008/M012) | **ACTIVE** (via requêtes hands) |
| `hands` | Migration001 | 24 (+ extensions M003/M011/M012) | **ACTIVE** |
| `player_hands` | Migration001 | 16 (+ 90+ flags/extensions) | **ACTIVE** |
| `stats` | Migration001 | 8 | **ORPHELINE** (voir §2) |
| `config` | Migration001 | 2 (+ M013) | **PARTIELLE** |
| `hand_histories` | Migration006 | 3 | **ACTIVE** |
| `lookup_actions` | Migration002 | 3 | **ACTIVE** (seed uniquement) |
| `lookup_positions` | Migration002 | 8 | **ACTIVE** (seed uniquement) |
| `lookup_hand_ranks` | Migration002 | 4 | **ACTIVE** (seed uniquement) |
| `lookup_sites` | Migration002 | 3 | **ACTIVE** (seed uniquement) |
| `lookup_hole_cards` | Migration010 | 7 | **ORPHELINE** (voir §2) |
| `tags` | Migration005 | 4 | **ACTIVE** (via TagsRepository) |
| `player_tags` | Migration005 | 2 | **ACTIVE** (via TagsRepository) |
| `notes` | Migration005 | 6 | **ACTIVE** (via NotesRepository) |
| `player_stats_cache` | Migration007 | 8 | **ACTIVE** (via StatsCacheRepository) |
| `tourney_types` | Migration012 | 4 | **MINIMALE** (seed + 1 SELECT) |
| `blind_structures` | Migration013 | 7 | **ORPHELINE** (voir §2) |
| `preflop_equity_lookup` | Migration014 | 6 | **ACTIVE** |
| `schema_migrations` | interne | 3 | **INTERNE** (MigrationRunner) |

---

## 2. TABLES DÉFINIES MAIS NON IMPLÉMENTÉES

### 2.1 `stats` — COMPLÈTEMENT ORPHELINE

**Problème:** Créée dans Migration001, remplacée fonctionnellement par `player_stats_cache` (Migration007).

- Aucune opération INSERT (sauf DELETE dans `deleteAllHands()` et `deleteAllData()`)
- Aucun SELECT, aucun repository, aucun DAO
- Colonnes: `id, player_id, hero_name, buy_in, vpip, pfr, three_bet, c_bet, hands_played`

**Recommandation:** Supprimer la table dans une migration de nettoyage.

### 2.2 `blind_structures` — COMPLÈTEMENT ORPHELINE

**Problème:** Créée dans Migration013 mais jamais référencée dans le code applicatif.

- Aucun SELECT, INSERT, UPDATE
- Aucun repository, aucun modèle, aucun composant UI
- Colonnes: `id, tournament_id, level_num, small_blind, big_blind, ante, duration_minutes`

**Recommandation:** Soit implémenter la fonctionnalité (structure de blinds progressive), soit supprimer.

### 2.3 `lookup_hole_cards` — PARTIELLEMENT ORPHELINE

**Problème:** Table créée et peuplée (169 combinaisons Hold'em) mais non utilisée.

- Le modèle `PlayerHand` a un champ `holeCardId: Int?` qui ne correspond à rien
- Les `hole_cards` sont stockés en TEXT directement dans `player_hands` au lieu d'utiliser cette lookup
- Aucun repository ni DAO pour cette table
- La table `Tables.kt` ne définit pas cet objet

**Recommandation:** Soit mapper `player_hands.hole_cards` vers `lookup_hole_cards.id`, soit supprimer la colonne `holeCardId` du modèle.

### 2.4 `tourney_types` — MINIMALEMENT UTILISÉE

**Problème:** Table créée et peuplée (6 types) mais presque inutilisée.

- Un seul SELECT: `getTournamentTypes()` dans Database.kt:1750
- Aucune liaison FK vers `tournaments`
- Pas d'INSERT/UPDATE après le seed initial
- Le champ `id_tourney_type` n'existe pas dans la table `tournaments`

**Recommandation:** Ajouter une colonne `tourney_type_id` FK dans `tournaments` pour lier les deux tables.

### 2.5 Colonnes présentes dans les modèles mais non dans les migrations/DAO

| Modèle | Colonne | Status |
|--------|---------|--------|
| `PlayerHand` (Models.kt) | `holeCardId: Int?` | Pas dans DB (Exposed Tables.kt) |
| `PlayerHand` (Models.kt) | `flgLimpBehind: Boolean` | Pas dans DB (Exposed Tables.kt) |
| `PlayerHand` (Models.kt) | `equityPercentReal: Double` | Pas dans DB (Exposed Tables.kt) |
| `PlayerHand` (Models.kt) | `expectedWonReal: Double` | Pas dans DB (Exposed Tables.kt) |
| `PlayerHand` (Models.kt) | `expectedWonIcm: Double` | Pas dans DB (Exposed Tables.kt) |
| `PlayerHand` (Models.kt) | `amtBefore: Double` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `amtRaiseFacing: Double` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `amt2betFacing: Double` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `amt3betFacing: Double` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `aggressorPositionFlop/Turn/River` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `cntRaiseFlop/Turn/River` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `cntCallFlop/Turn/River` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `totalBountyWon: Double` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `PlayerHand` (Models.kt) | `comboType: String?` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `Hand` (Models.kt) | `playersFlop/Turn/River` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `Hand` (Models.kt) | `importedAt: String?` | Pas dans Exposed Tables.kt (mais existe en DB) |
| `Hand` (Models.kt) | `potFlop/Turn/River` | Pas dans Exposed Tables.kt (mais existe en DB) |

**Note importante:** Il y a un **désalignement** entre:
1. Les migrations SQL (créent les colonnes en DB)
2. Le fichier `Tables.kt` (Exposed ORM — ne référence PAS toutes les colonnes)
3. Le fichier `Entities.kt` (DAO Exposed — ne référence PAS toutes les colonnes)
4. Le fichier `Models.kt` (data classes Kotlin — référence TOUTES les colonnes)
5. Le fichier `Database.kt` (JDBC brut — sauvegarde/utilise un sous-ensemble)

---

## 3. DIFFÉRENCES TABLE PAR TABLE

### 3.1 Joueurs: `players` vs `player`

| Aspect | SpinTracker `players` | PT4 `player` |
|--------|----------------------|--------------|
| PK | `id INTEGER AUTOINCREMENT` | `id_player integer` |
| Nom | `name TEXT NOT NULL` | `player_name text` |
| Recherche | ❌ Pas d'index de recherche | `player_name_search text` |
| Alias | ❌ | `id_player_alias integer` |
| Notes flags | `is_reg INTEGER` (0/1) | `flg_note, flg_tag boolean` |
| Anonyme | ❌ | `flg_anonymous boolean` |
| Site | `room TEXT` + `site_id INTEGER` | `id_site smallint` (FK vers lookup_sites) |
| **SpinTracker manque** | `player_name_search`, `id_player_alias`, `flg_note`, `flg_tag`, `flg_anonymous` | |

### 3.2 Mains tournois: `hands` + `player_hands` vs `tourney_hand_summary` + `tourney_hand_player_statistics`

#### `hands` vs `tourney_hand_summary`

| Aspect | SpinTracker `hands` | PT4 `tourney_hand_summary` |
|--------|---------------------|---------------------------|
| PK | `id INTEGER AUTOINCREMENT` | `id_hand integer` |
| ID externe | `hand_id TEXT UNIQUE` | `hand_no varchar(32) UNIQUE` |
| Date | `date_time TEXT` (ISO string) | `date_played timestamp with time zone` |
| Joueurs | `player_count INTEGER` | `cnt_players smallint` |
| Pot | `total_pot REAL` | `amt_pot numeric(14,2)` |
| Acteurs | ❌ | `str_actors_p/f/t/r` (encodage compact) |
| Agressors | ❌ | `str_aggressors_p/f/t/r` |
| Cartes | `flop/turn/river TEXT` | `card_1 à card_5` (smallint 0-51) |
| Flags | ❌ | `flg_note, flg_tag, flg_autonote` |
| Game type | ❌ | `id_gametype smallint` (1=Hold'em, 2=Omaha, 3=O/8) |
| **SpinTracker manque** | Encodage acteurs/agressors, game type, cartes encodées, timestamps timezone | |

#### `player_hands` vs `tourney_hand_player_statistics`

| Aspect | SpinTracker `player_hands` | PT4 `tourney_hand_player_statistics` |
|--------|---------------------------|-------------------------------------|
| Colonnes | **~90+** | **300+** |
| Flags _opp | 27 flags (_opp, _def_opp) | Chaque flag a _opp et _def_opp |
| Montants (amt_*) | 9 colonnes | 30+ colonnes |
| Compteurs (cnt_*) | 6 colonnes | 20+ colonnes |
| Pourcentages (val_*) | ❌ | Nombreux `val_*_pct` |
| Hole cards | TEXT libre | `id_holecard` FK vers lookup |
| Position | `position TEXT` + `position_type TEXT` | Position encodée dans les strings |
| **SpinTracker manque** | val_*_pct, amt_*_bet_made, amt_*_bet_made_2, id_holecard FK, enum_* pour actions/allin | |

### 3.3 Tournois: `tournaments` vs `tourney_summary`

| Aspect | SpinTracker `tournaments` | PT4 `tourney_summary` |
|--------|---------------------------|----------------------|
| PK | `id INTEGER AUTOINCREMENT` | `id_tourney integer` |
| ID externe | `game_id TEXT UNIQUE` | `tourney_no varchar(32)` |
| Game type | ❌ | `id_gametype smallint` |
| Site | `site_id INTEGER` (non FK) | `id_site smallint` (FK) |
| Type table | ❌ | `id_table_type smallint` |
| Type tournoi | ❌ (pas de FK vers tourney_types) | `id_tourney_type smallint` |
| Dates | `date_time TEXT` | `date_start`, `date_end` (timestamps) |
| Buy-in | `buy_in REAL` | `amt_buyin numeric(14,2)` |
| Frais | `fee REAL` | `amt_fee numeric(11,2)` |
| Prize pool | ❌ (dans hands) | `amt_prize_pool numeric(14,2)` |
| Rebuy/Addon | ✅ `rebuy_count`, `addon_count` | `amt_rebuy`, `amt_addon` |
| Bounty | ✅ `bounty_amount`, `is_knockout` | `amt_bounty numeric(14,2)` |
| Gagnant | ✅ `winner_id`, `winner_name` | `id_winner integer FK` |
| Devise | ✅ `currency`, `base_currency` | `currency char(3)` |
| Nombre mains | ❌ | `cnt_hands smallint` |
| **SpinTracker manque** | `id_gametype`, `id_table_type`, FK vers `tourney_types`, `cnt_hands`, dates séparées start/end | |

### 3.4 Résultats tournois: ❌ vs `tourney_results`

| Aspect | SpinTracker | PT4 `tourney_results` |
|--------|-------------|----------------------|
| Table dédiée | ❌ Calculé à la volée | ✅ `tourney_results` |
| Colonnes PT4 | — | `id_tourney, id_gametype, id_site, id_player, date_start/end, val_finish, amt_won, cnt_rebuy/ addon, val_bounty, flg_sat_seat, amt_won_adj` |

**SpinTracker calcule les résultats via des requêtes complexes** sur `hands` + `player_hands` au lieu de les stocker dans une table dédiée.

### 3.5 Stats pré-calculées: `player_stats_cache` vs `tourney_cache` / `cash_cache`

| Aspect | SpinTracker `player_stats_cache` | PT4 `tourney_cache` / `cash_cache` |
|--------|----------------------------------|-----------------------------------|
| Granularité | Par joueur (global) | Par joueur + contexte (période, type) |
| Colonnes | 8 (`vpip, pfr, three_bet, cbet_flop/turn/river, hands_count, last_updated`) | 50+ par cache |
| Custom | ❌ | `tourney_custom_cache`, `cash_custom_cache` |

### 3.6 Lookup tables

| Lookup | SpinTracker | PT4 |
|--------|-------------|-----|
| `lookup_actions` | ✅ 19 entrées | ✅ Plus complet |
| `lookup_positions` | ✅ 7 entrées (UNK, SB, BB, EP, MP, CO, BTN) | ✅ Plus détaillé |
| `lookup_hand_ranks` | ✅ 10 entrées | ✅ |
| `lookup_sites` | ✅ 5 sites | ✅ |
| `lookup_hole_cards` | ✅ Créée mais **non utilisée** | ✅ Utilisée via FK `id_holecard` |
| `lookup_hand_groups` | ❌ | ✅ |
| `lookup_suits_omaha` | ❌ | ✅ |
| `lookup_tourney_type` | ❌ (utilise `tourney_types` sans FK) | ✅ |

### 3.7 Tables PT4 sans équivalent SpinTracker

| Table PT4 | Description | Pertinence pour SpinTracker |
|-----------|-------------|----------------------------|
| `cash_hand_summary` | Résumé mains cash games | 🔴 Si SpinTracker reste orienté tournois uniquement |
| `cash_hand_player_statistics` | Stats cash games (300+ cols) | 🔴 Idem |
| `cash_cache` / `cash_custom_cache` | Cache stats cash | 🔴 Idem |
| `cash_limit` | Limites cash (Zoom, etc.) | 🔴 Idem |
| `cash_table` | Infos tables cash | 🔴 Idem |
| `live_cash_*` | Tables temps réel | 🟡 Fonctionnalité avancée |
| `tourney_custom_cache` | Stats personnalisées | 🟡 Utile pour les filtres avancés |

---

## 4. COLONNES PT4 MANQUANTES DANS SpinTracker

### 4.1 High Priority (impact fonctionnel direct)

| Colonne PT4 | Table PT4 | Équivalent ST | Impact |
|-------------|-----------|---------------|--------|
| `id_gametype` | `tourney_summary`, `tourney_hand_player_statistics` | ❌ | Pas de distinction Hold'em/Omaha |
| `val_*_pct` (pourcentages) | `tourney_hand_player_statistics` | ❌ | Stats en % non pré-calculées |
| `amt_*_bet_made` | `tourney_hand_player_statistics` | ❌ | Taille des bets post-flop non stockée |
| `amt_*_bet_made_2` | `tourney_hand_player_statistics` | ❌ | Deuxième barrel non tracké |
| `enum_*` (actions/allin) | `tourney_hand_player_statistics` | ❌ | Pas d'enum pour le type d'action |
| `str_actors_*` | `tourney_hand_summary` | ❌ | Replay moins précis |
| `str_aggressors_*` | `tourney_hand_summary` | ❌ | Pas d'historique des agresseurs |
| `cnt_hands` | `tourney_summary` | ❌ | Comptage de mains par tournoi à recalculer |
| `date_start` / `date_end` | `tourney_summary` | `date_time` seul | Pas de durée de tournoi |

### 4.2 Medium Priority (amélioration des stats)

| Colonne PT4 | Table PT4 | Équivalent ST | Impact |
|-------------|-----------|---------------|--------|
| `id_holecard` FK | `tourney_hand_player_statistics` | TEXT libre | Normalisation des mains |
| `lookup_hand_groups` | — | ❌ | Pas de groupes de mains |
| `flg_*_pct` variants | `tourney_hand_player_statistics` | ❌ | Stats de fréquence en % |
| `amt_*_effective_stack` | `tourney_hand_player_statistics` | ✅ partiel (spr_flop/turn/river) | Stack effectif par rue complet |
| `amt_*_5bet_facing` | `tourney_hand_player_statistics` | ❌ | 5bet+ non trackés |
| `id_tourney_type` FK | `tourney_summary` | ❌ | Type de tournoi non lié |

### 4.3 Low Priority (fonctionnalités avancées)

| Colonne PT4 | Table PT4 | Équivalent ST | Impact |
|-------------|-----------|---------------|--------|
| `player_name_search` | `player` | ❌ | Recherche plus rapide |
| `id_player_alias` | `player` | ❌ | Fusion de pseudonymes |
| `flg_note` / `flg_tag` | `player` | ✅ via tables tags/notes séparées | Implémentation différente |
| `flg_anonymous` | `player` | ❌ | Support joueurs anonymes |
| `card_1..5` encodées | `tourney_hand_summary` | TEXT flop/turn/river | Encodage différent |
| `amt_won_adj` | `tourney_results` | ❌ | Gain ajusté par résultat |

---

## 5. RÉSUMÉ DES ÉCARTS

### 5.1 Quantitatif

| Métrique | SpinTracker | PT4 |
|----------|-------------|-----|
| Tables principales | 8 | 38+ |
| Tables lookup | 5 (+ 1 orpheline) | 7 |
| Tables cache | 1 | 4+ |
| Colonnes `player_hands` | ~90 | ~300 (`tourney_hand_player_statistics`) |
| Colonnes `hands` | ~27 | ~48 (`tourney_hand_summary`) |
| Types de données | INTEGER(0/1), REAL, TEXT | BOOLEAN, numeric(14,2), timestamp, FK |
| Colonnes orphelines (DB mais pas ORM) | **17+** | 0 |
| Tables orphelines (DB mais pas code) | **3** (`stats`, `blind_structures`, `lookup_hole_cards` partiel) | 0 |

### 5.2 Désalignements internes à SpinTracker

| Fichier | Colonnes `player_hands` | Colonnes `hands` |
|---------|-------------------------|------------------|
| Migration SQL (DB réelle) | ~90 | ~27 |
| `Tables.kt` (Exposed ORM) | **~56** (manque 34+) | **~20** (manque 7+) |
| `Entities.kt` (DAO) | **~56** (identique à Tables.kt) | **~20** (identique) |
| `Models.kt` (data class) | **~90** (complet) | **~27** (complet) |
| `Database.kt` (JDBC insert) | **~58** (sauvegarde partielle) | **~24** (sauvegarde complète) |

**Le problème majeur:** Les colonnes ajoutées par les migrations PT4 Parity (M010, M011, M012) existent dans la DB SQLite mais ne sont **pas référencées** dans `Tables.kt`/`Entities.kt`, ce qui signifie que l'ORM Exposed ne peut pas les utiliser. Seules les requêtes JDBC brutes dans `Database.kt` peuvent les atteindre.

---

## 6. RECOMMANDATIONS PRIORITAIRES

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Synchroniser `Tables.kt` avec les colonnes DB existantes** — Ajouter toutes les colonnes des migrations M010-M012 dans l'ORM Exposed | Moyen | 🔴 Critique — L'ORM est cassé pour 34+ colonnes |
| 2 | **Supprimer la table `stats`** — Remplacée par `player_stats_cache` | Faible | 🟡 Nettoyage |
| 3 | **Implémenter `lookup_hole_cards`** — Mapper `hole_cards` TEXT vers `id_holecard` FK | Moyen | 🟡 Normalisation |
| 4 | **Lier `tourney_types` à `tournaments`** — Ajouter FK `tourney_type_id` | Faible | 🟡 Cohérence |
| 5 | **Décider du sort de `blind_structures`** — Implémenter ou supprimer | Faible | 🟡 Nettoyage |
| 6 | **Ajouter `id_gametype`** — Support multi-jeu | Moyen | 🟢 Fonctionnalité |
| 7 | **Pré-calculer les pourcentages `val_*_pct`** | Moyen | 🟢 Performance |
| 8 | **Ajouter `str_actors/str_aggressors`** | Moyen | 🟢 Replay amélioré |
