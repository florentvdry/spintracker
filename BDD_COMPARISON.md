# Comparaison BDD: SpinTracker vs PT4

## Résumé Exécutif

| Aspect | SpinTracker (SQLite) | PT4 (PostgreSQL) |
|--------|---------------------|------------------|
| Tables principales | 8 | 38+ |
| Types de données | INTEGER (0/1 pour bools) | BOOLEAN natif |
| Décimal | REAL (double) | numeric(14,2) - précis |
| Timestamps | ISO_LOCAL_DATE_TIME string | timestamp with time zone |
| Indexation | Basique | Très performante |

---

## 1. TABLES DE JOUEURS

### SpinTracker: `players`
```sql
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    is_reg INTEGER DEFAULT 0,      -- stocké comme integer (0/1)
    notes TEXT DEFAULT '',
    UNIQUE(name, room)
)
```
+ colonnes: site_id (optionnel)

### PT4: `player`
```sql
CREATE TABLE player (
    id_player integer PRIMARY KEY,
    id_site smallint NOT NULL,
    player_name text,
    player_name_search text,           -- pour recherches rapides
    id_player_alias integer,
    flg_note boolean,
    flg_tag boolean,
    flg_anonymous boolean
)
```

### Différences et suggestions:
| SpinTracker | PT4 | Suggestion pour SpinTracker |
|------------|-----|---------------------------|
| `is_reg` integer 0/1 | `flg_*` boolean natif | Convertir en boolean (ajouter colonne is_reg_bool) |
| Pas de `player_name_search` | Index de recherche text | Ajouter index sur (name, room) pour加快 les recherches |
| Pas de `id_player_alias` | Alias de joueurs | Permettrait de fusionner les joueurs avec surnoms différents |

---

## 2. TABLES DE MAINS (TOURNOIS)

### SpinTracker: `hands` + `player_hands`

**hands:**
```sql
CREATE TABLE hands (
    hand_id TEXT UNIQUE NOT NULL,
    game_id TEXT,
    table_name TEXT,
    room TEXT,
    date_time TEXT,
    hero_name TEXT,
    hero_position INTEGER,
    player_count INTEGER DEFAULT 2,
    big_blind REAL,
    hand_rank INTEGER,
    hand_type TEXT,
    result REAL DEFAULT 0,
    ev REAL DEFAULT 0,
    went_to_showdown INTEGER DEFAULT 0,
    raw_content TEXT,
    ...
)
```

**player_hands** (90+ colonnes):
- Actions par rue: preflop_action, flop_action, turn_action, river_action (stocké comme TEXT)
- Flags: flg_vpip, flg_pfr, flg_3bet, flg_4bet, flg_squeeze, flg_limp, etc. (INTEGER 0/1)
- Stack sizes: effective_stack_preflop, effective_stack_flop, etc.
- Cards: hole_cards (TEXT), is_suited (INTEGER), is_pair (INTEGER)

### PT4: `tourney_hand_summary` + `tourney_hand_player_statistics`

**tourney_hand_summary:**
```sql
-- 48 colonnes
id_hand integer PRIMARY KEY,
hand_no varchar(32) UNIQUE,
date_played timestamp with time zone,
cnt_players smallint,
amt_pot numeric(14,2),
str_actors_p, str_actors_f, str_actors_t, str_actors_r  -- acteurs par rue (encoded)
str_aggressors_p, str_aggressors_f, etc.
card_1 à card_5  -- cartes encodées comme smallint (0-51)
flg_note, flg_tag, flg_autonote
```

**tourney_hand_player_statistics:** 300+ colonnes avec flags détaillés:
- Chaque flag a une version _opp (opponent) et _def_opp (defended against)
- Stack sizes: amt_p_effective_stack, amt_f_effective_stack, etc.
- Bet sizes facing: amt_p_raise_facing (et _2bet, _3bet, _4bet, _5bet)
- Pourcentages: val_xxx_pct (comme numeric)
- **id_holecard** référence lookup table au lieu de texte

### Différences et suggestions:

| SpinTracker | PT4 | Suggestion |
|------------|-----|-----------|
| `date_time` TEXT ISO | `timestamp with time zone` | Utiliser timestamp avec timezone pour supporter multi-timezones |
| `hole_cards` TEXT | `id_holecard` smallint FK vers lookup | Créer table lookup_hole_cards pour normalisation |
| `preflop_action` TEXT | `id_action_p` integer FK | Références lookup pour requêtes analytiques |
| Pas de version _opp des flags | Chaque flag a _opp et _def_opp | Ajouter colonnes flg_*_opp |
| REAL pour pot/EV | numeric(Précision, Echelle) | Utiliser numeric(14,2) pour euros |
| Pas de str_actors/str_aggressors | Encodage compact string | Stocker actors/aggressors pour replay |
| Pas de `amt_before` | Stack avant main | Stocker stack de départ |

---

## 3. TABLES DE TOURNOIS

### SpinTracker: `tournaments`
```sql
CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY,
    game_id TEXT UNIQUE,
    tournament_name TEXT,
    buy_in REAL, fee REAL,
    speed TEXT,
    max_players INTEGER,
    player_count INTEGER DEFAULT 2,
    ...
)
```

### PT4: `tourney_summary`
```sql
CREATE TABLE tourney_summary (
    id_tourney integer PRIMARY KEY,
    id_gametype smallint, id_site smallint,
    id_table_type smallint, id_tourney_type smallint,
    tourney_no varchar(32),
    date_start/date_end timestamps,
    amt_buyin numeric(14,2),    -- précis
    amt_fee numeric(11,2),
    amt_prize_pool numeric(14,2),
    amt_rebuy, amt_addon, amt_bounty numeric(14,2),
    cnt_players integer,
    id_winner integer FK,
    currency char(3),
    cnt_hands smallint
)
```

### Différences:
| SpinTracker | PT4 | Suggestion |
|------------|-----|-----------|
| DATE dans TEXT | timestamp with time zone | Utiliser timestamp |
| Pas de currency | currency char(3) avec conversion | Ajouter devise |
| Pas de details: rebuy/addon/bounty | Détails complets | Ajouter colonnes manquantes |
| Pas de `id_gametype` | Genre jeu normalisé | Ajouter FK vers type de jeu |

---

## 4. TABLES DE RÉSULTATS TOURNOIS

### SpinTracker
Résultats calculés à la volée via requêtes SQL complexes.

### PT4: `tourney_results`
```sql
CREATE TABLE tourney_results (
    id_tourney integer FK,
    id_gametype smallint, id_site, id_player,
    date_start, date_end,
    val_finish integer,
    amt_won numeric(14,2),
    cnt_rebuy smallint, cnt_addon smallint,
    val_bounty numeric(12,8),
    flg_sat_seat boolean,
    amt_won_adj numeric(14,2)
)
```

**Suggestion:** Stocker les résultats dans une table pour éviter recalculs lourds.

---

## 5. TABLES DE STATISTIQUES PRÉ-CALCULÉES

### SpinTracker: `stats`
```sql
CREATE TABLE stats (
    player_id, hero_name, buy_in,
    vpip REAL, pfr REAL, three_bet REAL,
    c_bet REAL, hands_played INTEGER
)
```

### PT4: Tables cache multiples
- `tourney_cache` (statistiques pré-calculées par joueur/tournoi)
- `cash_cache` (pour cash games)
- `tourney_custom_cache`, `cash_custom_cache` (personnalisées)

**Suggestion:** Ajouter des tables de cache pour analytique rapide sur de gros volumes.

---

## 6. TABLES DE LOOKUP/NORMALISATION

### SpinTracker
- `lookup_actions` (19 entrées)
- `lookup_positions` (7 entrées)
- `lookup_hand_ranks` (10 entrées)
- `lookup_sites` (5 sites)

### PT4
- `lookup_actions` (complete)
- `lookup_positions`
- `lookup_hand_ranks`
- `lookup_hand_groups` (groupes de mains)
- `lookup_hole_cards` (toutes combinaisons de mains)
- `lookup_suits_omaha`
- `lookup_sites`
- `lookup_tourney_type`

**Suggestion de PT4 à adopter:**
- Ajouter `lookup_hand_groups` pour analyser par groupes de mains (Axs, KQs, etc.)
- Compléter `lookup_hole_cards` pour normalisation Omaha

---

## 7. FLAGS POST-FLOP MANQUANTS CHEZ SPINTRACKER

### PT4 a ces flags détaillés (manquant chez SpinTracker):

**Blinds:**
- flg_sb_steal_fold: SB steal fold
- flg_bb_steal_fold: BB steal fold  
- flg_blind_def_opp: Blind defense opportunity
- flg_steal_att: Steal attempt
- flg_steal_opp: Steal opportunity

**Flop (Détail):**
- flg_f_has_position: A eu la position
- flg_f_first: Premier à agir
- flg_f_open: Open-raise
- flg_f_open_opp: Open-raise opportunity

**Turn/River:**
- Mêmes différenciations pour chaque rue (first, open, open_opp, has_position)

**Stack sizes:**
amt_p_effective_stack, amt_f_effective_stack, amt_t_effective_stack, amt_r_effective_stack

**Bet facing ranges:**
- amt_p_raise_facing, amt_p_2bet_facing, amt_p_3bet_facing, amt_p_4bet_facing, amt_p_5bet_facing
- Mêmes pour Turn (t), River (r), Flop (f)

**Stats calculés déjà:**
- Pourcentages: val_p_raise_facing_pct, val_p_3bet_facing_pct, etc.
- amt_p_raise_made, amt_p_raise_made_2 (deuxième barrel)

---

## 8. ÉQUITÉ ET VALEUR ATTENDUE

### SpinTracker
```kotlin
ev REAL DEFAULT 0
equity_percent REAL // parfois
expected_won REAL
```

### PT4
```sql
val_equity numeric(6,5),         -- déjà calculé
amt_expected_won numeric(14,2),   -- $ attendu
amt_expected_won_icm_pct numeric(6,5),  -- % ICM
```

**Suggestion:** Stocker equity et expected value pré-calculés.

---

## 9. INDEX ET PERFORMANCES

### SpinTracker (4 indexes)
```sql
CREATE INDEX idx_hands_date ON hands(date_time)
CREATE INDEX idx_hands_hero ON hands(hero_name)
CREATE INDEX idx_player_hands_hand ON player_hands(hand_id)
CREATE INDEX idx_player_hands_player ON player_hands(player_id)
```

### PT4 (9+ indexes sur tourney_hand_player_statistics)
```sql
-- index sur id_hand, id_player, id_gametype, id_tourney, position
-- index sur date_played, date_played_utc  
-- index sur date_played_weekyear (pourweekly stats!)
```

**Suggestion:** Ajouter indexes sur id_tourney, position, date_played et especially pour date ranges (semaine/mois).

---

## 10. DONNÉES CASH GAMES

### SpinTracker
Pas de support natif (orienté tournaments)

### PT4
- `cash_hand_summary` (detailed)
- `cash_hand_player_statistics` (300+ colonnes! - plus de stats que tourney!)
- `cash_limit`
- `cash_table`
- `live_cash_*: Tables temps réel

**Suggestion:** Si support cash games prévu, étudier modèle PT4.

---

## TABLEAU RÉCAPITULATIF: AMÉLIORATIONS PRIORITAIRES

| Priorité | Amélioration | Impact |
|---------|-------------|--------|
| HAUTE | Ajouter `lookup_hole_cards` ID | Normalisation complète Omaha/Hold'em |
| HAUTE | Convertir booleans integer→boolean | Code plus propre |
| MOYENNE | Timestamp avec timezone | Support multi-sites |
| MOYENNE | Ajouter indexes (tourney, position, date) | Perfo requêtes |
| MOYENNE | Ajouter `player_name_search` index | Recherche rapide |
| BASSE | Ajouter tables cache | Analytique rapide |
| BASSE | Ajouter blind steal/defense flags | Stats avancées |
| BASSE | Ajouter données rebuy/addon | Completude |

---

## CONCLUSION

PT4 est une base de données très elaborate avec:
- 300+ colonnes par main (vs ~90 chez SpinTracker)
- Indexation trèsperformante
- Données pré-calculées (equity, expected value)
- Tables cache pour analytique  
- Support complet pour cash games

SpinTracker a une structure simplifiée mais fonctionnelle. Les principales améliorations seriam:
1. Tables de lookup complétées (hand groups, hole cards)
2. Flag détaillés (_opp, _def_opp pour chaque rue)
3. Données pré-calculées (equity, expected won ICM)
4. Timestamps avec timezone
5. Index complémentaires

Pour migrer des données depuis PT4, SpinTracker devrait accepter plus de champs ou faire un mapping complexe.