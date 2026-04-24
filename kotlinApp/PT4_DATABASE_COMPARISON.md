# Comparaison des Bases de Données : SpinTracker vs PokerTracker 4

## Vue d'ensemble

### SpinTracker (SQLite)
- **Moteur** : SQLite
- **Tables principales** : 6 tables
- **Orientation** : Application légère, suivi de tournois Spin & Go

### PokerTracker 4 (PostgreSQL)
- **Moteur** : PostgreSQL 12
- **Tables principales** : 38 tables
- **Orientation** : Solution professionnelle complète, cash game + tournois

---

## Structure des Tables

### SPINTRACKER - Tables

#### 1. `players`
```sql
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    is_reg INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    UNIQUE(name, room)
)
```

#### 2. `tournaments`
```sql
CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT UNIQUE NOT NULL,
    tournament_name TEXT,
    buy_in REAL,
    fee REAL,
    currency TEXT DEFAULT 'EUR',
    speed TEXT,
    max_players INTEGER,
    player_count INTEGER DEFAULT 2,
    result REAL DEFAULT 0,
    date_time TEXT,
    place INTEGER,
    prize REAL,
    rake REAL DEFAULT 0
)
```

#### 3. `hands`
```sql
CREATE TABLE hands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    tournament_id INTEGER,
    buy_in REAL DEFAULT 0,
    prize_pool REAL DEFAULT 0,
    multiplier INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    flop TEXT,
    turn TEXT,
    river TEXT,
    total_pot REAL DEFAULT 0,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
)
```

#### 4. `player_hands`
```sql
CREATE TABLE player_hands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hand_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    position TEXT,
    stack_size REAL,
    is_hero INTEGER DEFAULT 0,
    hole_cards TEXT,
    preflop_action TEXT,
    flop_action TEXT,
    turn_action TEXT,
    river_action TEXT,
    showdown_cards TEXT,
    final_hand TEXT,
    final_hand_rank INTEGER,
    winnings REAL DEFAULT 0,
    net_result REAL DEFAULT 0,
    net_won_adjusted REAL DEFAULT 0,
    place INTEGER DEFAULT 0,
    went_to_showdown INTEGER DEFAULT 0,
    FOREIGN KEY (hand_id) REFERENCES hands(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
)
```

#### 5. `stats`
```sql
CREATE TABLE stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    hero_name TEXT,
    buy_in REAL,
    vpip REAL DEFAULT 0,
    pfr REAL DEFAULT 0,
    three_bet REAL DEFAULT 0,
    c_bet REAL DEFAULT 0,
    hands_played INTEGER DEFAULT 0,
    FOREIGN KEY (player_id) REFERENCES players(id)
)
```

#### 6. `config`
```sql
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT
)
```

---

### POKERTRACKER 4 - Tables Principales

#### 1. `player` (11 654 joueurs)
```sql
CREATE TABLE player (
    id_player          INTEGER NOT NULL,
    id_site            SMALLINT NOT NULL,
    player_name        TEXT,
    player_name_search TEXT,
    id_player_alias    INTEGER,
    flg_note           BOOLEAN DEFAULT false,
    flg_tag            BOOLEAN DEFAULT false,
    flg_anonymous      BOOLEAN DEFAULT false
)
```

**Différences clés :**
- PT4 sépare `id_site` pour supporter multi-rooms
- `player_name_search` pour recherche optimisée
- Flags pour notes/tags au lieu de texte libre
- Support des joueurs anonymes

#### 2. `tourney_summary` (9 329 tournois)
```sql
CREATE TABLE tourney_summary (
    id_tourney             INTEGER NOT NULL,
    id_gametype            SMALLINT NOT NULL,
    id_site                SMALLINT NOT NULL,
    id_table_type          SMALLINT NOT NULL,
    id_tourney_type        SMALLINT NOT NULL,
    tourney_no             VARCHAR(32) NOT NULL,
    date_start             TIMESTAMP,
    date_end               TIMESTAMP,
    date_rebuy_period_over TIMESTAMP,
    amt_buyin              NUMERIC(14,2) NOT NULL,
    amt_fee                NUMERIC(11,2) DEFAULT 0,
    amt_prize_pool         NUMERIC(14,2) DEFAULT 0,
    amt_starting_stack     INTEGER DEFAULT 0,
    summary                TEXT,
    tourney_no_target      VARCHAR(32),
    cnt_players            INTEGER DEFAULT 0,
    flg_note               BOOLEAN DEFAULT false,
    flg_tag                BOOLEAN DEFAULT false,
    id_winner              INTEGER,
    currency               CHAR(3) NOT NULL,
    val_curr_conv          NUMERIC(12,4),
    amt_rebuy              NUMERIC(14,2) DEFAULT 0,
    amt_addon              NUMERIC(14,2) DEFAULT 0,
    amt_bounty             NUMERIC(14,2) DEFAULT 0,
    amt_bounty_val         NUMERIC(14,2) DEFAULT 0,
    cnt_hands              SMALLINT DEFAULT 0
)
```

**Différences clés :**
- Normalisation avec tables de lookup (id_gametype, id_table_type, etc.)
- Support complet des rebuys/addons
- Support des bounties
- Conversion de devise
- Séparation date_start/date_end
- Compteur de mains intégré

#### 3. `tourney_hand_histories`
```sql
CREATE TABLE tourney_hand_histories (
    id_hand  INTEGER NOT NULL,
    history  TEXT
)
```

**Différences clés :**
- PT4 sépare l'historique brut dans une table dédiée
- Plus léger pour les requêtes courantes

#### 4. `tourney_hand_player_statistics` (371 188 lignes)
Table EXTÊMEMENT détaillée avec 200+ colonnes :

**Actions Preflop :**
```sql
cnt_p_raise              SMALLINT DEFAULT 0
flg_p_first_raise        BOOLEAN DEFAULT false
cnt_p_call               SMALLINT DEFAULT 0
flg_p_limp               BOOLEAN DEFAULT false
flg_p_fold               BOOLEAN DEFAULT false
flg_p_ccall              BOOLEAN DEFAULT false
flg_p_face_raise         BOOLEAN DEFAULT false
flg_p_3bet               BOOLEAN DEFAULT false
flg_p_3bet_opp           BOOLEAN DEFAULT false
flg_p_4bet               BOOLEAN DEFAULT false
flg_p_squeeze            BOOLEAN DEFAULT false
```

**Actions Flop/Turn/River (même structure) :**
```sql
-- Flop
flg_f_bet                BOOLEAN DEFAULT false
cnt_f_raise              SMALLINT DEFAULT 0
flg_f_first_raise        BOOLEAN DEFAULT false
cnt_f_call               SMALLINT DEFAULT 0
flg_f_check              BOOLEAN DEFAULT false
flg_f_check_raise        BOOLEAN DEFAULT false
flg_f_fold               BOOLEAN DEFAULT false
flg_f_saw                BOOLEAN DEFAULT false
flg_f_cbet               BOOLEAN DEFAULT false
flg_f_donk               BOOLEAN DEFAULT false
flg_f_float              BOOLEAN DEFAULT false

-- Turn (flg_t_*)
-- River (flg_r_*)
```

**Informations de main :**
```sql
id_holecard              SMALLINT NOT NULL
id_blinds                SMALLINT NOT NULL
position                 SMALLINT
cnt_players              SMALLINT
holecard_1               SMALLINT NOT NULL
holecard_2               SMALLINT NOT NULL
holecard_3               SMALLINT NOT NULL
holecard_4               SMALLINT NOT NULL
id_suits                 SMALLINT NOT NULL
id_final_hand            SMALLINT NOT NULL
id_final_hand_lo         INTEGER NOT NULL
flg_showdown             BOOLEAN DEFAULT false
flg_won_hand             BOOLEAN DEFAULT false
flg_showed               BOOLEAN DEFAULT false
```

**Stats avancées :**
```sql
amt_won                  NUMERIC(14,2) DEFAULT 0
amt_expected_won         NUMERIC(14,2) DEFAULT 0
amt_expected_won_icm_pct NUMERIC(6,5)
val_equity               NUMERIC(6,5) DEFAULT 0
enum_allin               CHAR(1)
enum_face_allin          CHAR(1)
```

**Stacks et positions :**
```sql
amt_before               NUMERIC(14,2)
amt_blind                NUMERIC(11,2) DEFAULT 0
amt_ante                 NUMERIC(11,2) DEFAULT 0
amt_p_effective_stack    NUMERIC(14,2) DEFAULT 0
amt_f_effective_stack    NUMERIC(14,2) DEFAULT 0
amt_t_effective_stack    NUMERIC(14,2) DEFAULT 0
amt_r_effective_stack    NUMERIC(14,2) DEFAULT 0
```

**Actions détaillées par street :**
```sql
amt_bet_p                NUMERIC(14,2) DEFAULT 0
amt_bet_f                NUMERIC(14,2) DEFAULT 0
amt_bet_t                NUMERIC(14,2) DEFAULT 0
amt_bet_r                NUMERIC(14,2) DEFAULT 0
amt_bet_ttl              NUMERIC(14,2) DEFAULT 0
```

#### 5. `tourney_results`
```sql
CREATE TABLE tourney_results (
    id_tourney     INTEGER NOT NULL,
    id_gametype    SMALLINT NOT NULL,
    id_site        INTEGER NOT NULL,
    id_player      INTEGER NOT NULL,
    id_player_real INTEGER NOT NULL,
    date_start     TIMESTAMP,
    date_end       TIMESTAMP,
    val_finish     INTEGER NOT NULL,
    amt_won        NUMERIC(14,2) NOT NULL,
    cnt_rebuy      SMALLINT,
    cnt_addon      SMALLINT,
    val_bounty     NUMERIC(12,8) NOT NULL,
    flg_sat_seat   BOOLEAN DEFAULT false,
    amt_won_adj    NUMERIC(14,2)
)
```

**Différences clés :**
- Table de jointure pour résultats joueurs
- Support des satellites (flg_sat_seat)
- Gains ajustés

#### 6. Tables de Lookup (Référence)

**`lookup_actions` :**
```sql
CREATE TABLE lookup_actions (
    id_action  INTEGER NOT NULL,
    action     TEXT
)
-- Actions: R, CC, CF, F, C, BF, X, XR, B, XC, XF, BR, RC, RF, BC, RR, CRC, CR, XRC...
```

**`lookup_hand_ranks` :**
```sql
CREATE TABLE lookup_hand_ranks (
    id_hand_rank  SMALLINT NOT NULL,
    id_group      SMALLINT NOT NULL,
    group_name    TEXT NOT NULL,
    group_details TEXT
)
```

**`lookup_positions` :**
```sql
CREATE TABLE lookup_positions (
    cnt_players       SMALLINT NOT NULL,
    position          SMALLINT NOT NULL,
    absolute_position SMALLINT NOT NULL,
    description       VARCHAR(6),
    flg_sb            BOOLEAN DEFAULT false,
    flg_bb            BOOLEAN DEFAULT false,
    flg_ep            BOOLEAN DEFAULT false,
    flg_mp            BOOLEAN DEFAULT false,
    flg_co            BOOLEAN DEFAULT false,
    flg_btn           BOOLEAN DEFAULT false
)
```

**`lookup_sites` :**
```sql
CREATE TABLE lookup_sites (
    id_site     INTEGER NOT NULL,
    site_abbrev CHAR(3),
    site_name   TEXT
)
```

**`lookup_tags` :**
```sql
CREATE TABLE lookup_tags (
    id_tag       INTEGER NOT NULL,
    tag_name     TEXT NOT NULL,
    tag_color    SMALLINT,
    flg_folded   BOOLEAN DEFAULT false,
    flg_won      BOOLEAN DEFAULT false
)
```

#### 7. `notes` / `notes_auto`
```sql
CREATE TABLE notes (
    id_note        INTEGER NOT NULL,
    id_x           INTEGER NOT NULL,
    enum_type      CHAR(1) NOT NULL,
    flg_tournament BOOLEAN DEFAULT false,
    id_gametype    SMALLINT NOT NULL,
    date_note      TIMESTAMP NOT NULL,
    id_color       SMALLINT,
    note           TEXT NOT NULL,
    note_tsvector  TSVECTOR
)
```

**Différences clés :**
- Support de recherche full-text (note_tsvector)
- Notes colorées
- Notes automatiques vs manuelles

#### 8. Tables Cash Game (non implémentées dans SpinTracker)
- `cash_cache` - Cache des stats cash
- `cash_hand_histories` - Historiques cash
- `cash_hand_player_combinations` - Combinaisons de mains
- `cash_hand_player_statistics` - Stats détaillées cash
- `cash_hand_summary` - Résumé de mains
- `cash_limit` - Limites de blinds
- `cash_table` - Tables de cash
- `cash_table_session_summary` - Sessions

#### 9. Tables Tournoi Additionnelles
- `tourney_blinds` - Structure de blinds
- `tourney_cache` - Cache des stats
- `tourney_custom_cache` - Stats personnalisées
- `tourney_hand_player_combinations` - Combinaisons
- `tourney_hand_summary` - Résumé de mains
- `tourney_table` - Tables de tournoi
- `tourney_table_type` - Types de tables (speed, regular, etc.)

#### 10. Tables Live Poker
- `live_cash_player`
- `live_cash_table`
- `live_tourney_player`
- `live_tourney_table`

#### 11. `tags` & `player_tags`
```sql
CREATE TABLE tags (
    -- Tags joueurs avec couleurs
)
```

#### 12. `settings`
```sql
CREATE TABLE settings (
    -- Configuration de l'application
)
```

---

## Analyse des Différences et Suggestions

### 1. **Normalisation et Tables de Lookup**

**Différence :** PT4 utilise des tables de lookup pour tout (actions, positions, sites, hand ranks)

**Avantage PT4 :**
- Requêtes plus rapides via JOINs sur integers
- Cohérence des données
- Traduction facile des valeurs
- Meilleure intégrité référentielle

**Suggestion pour SpinTracker :**
```sql
CREATE TABLE lookup_actions (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,
    description TEXT
);

CREATE TABLE lookup_positions (
    id INTEGER PRIMARY KEY,
    short_name TEXT NOT NULL, -- BTN, SB, BB
    full_name TEXT,
    is_blind BOOLEAN DEFAULT 0
);

CREATE TABLE lookup_hand_ranks (
    id INTEGER PRIMARY KEY,
    rank_name TEXT NOT NULL, -- "Royal Flush", "Quinte Flush"
    category INTEGER -- 1-10
);
```

---

### 2. **Support Multi-Rooms (id_site)**

**Différence :** PT4 a `id_site` sur presque toutes les tables

**Avantage PT4 :**
- Supporte PokerStars, Winamax, Betclic dans la même BDD
- Stats agrégées ou séparées par room
- Players avec même nom sur rooms différentes

**Suggestion pour SpinTracker :**
```sql
-- Ajouter aux tables existantes
ALTER TABLE players ADD COLUMN site_id INTEGER DEFAULT 1;
ALTER TABLE hands ADD COLUMN site_id INTEGER DEFAULT 1;
ALTER TABLE tournaments ADD COLUMN site_id INTEGER DEFAULT 1;

CREATE TABLE sites (
    id INTEGER PRIMARY KEY,
    abbrev TEXT NOT NULL, -- WIN, PS, BET
    name TEXT NOT NULL
);
```

---

### 3. **Stats Détaillées par Street**

**Différence :** PT4 a des flags pour CHAQUE action possible

**Avantage PT4 :**
- Stats HUD complètes : VPIP, PFR, 3bet, CBet, Donk, Float, etc.
- Filtrage ultra-précis des situations
- Analyse post-flop avancée

**Suggestion pour SpinTracker :**
```sql
-- Améliorer player_hands avec flags booléens
ALTER TABLE player_hands ADD COLUMN flg_vpip BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_pfr BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_3bet BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_4bet BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_cbet_flop BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_cbet_turn BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_cbet_river BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_donk BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_float BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_squeeze BOOLEAN DEFAULT 0;
```

---

### 4. **Expected Won / Equity**

**Différence :** PT4 stocke `amt_expected_won` et `val_equity`

**Avantage PT4 :**
- Calcul du EV $ réel (pas juste chips)
- Suivi de la performance vs attendu
- Détection des variances

**Suggestion pour SpinTracker :**
```sql
-- Déjà présent dans hands (ev) mais à améliorer
ALTER TABLE hands ADD COLUMN ev_currency REAL DEFAULT 0; -- EV en €
ALTER TABLE player_hands ADD COLUMN equity_percent REAL DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN expected_won REAL DEFAULT 0;
```

---

### 5. **ICM (Independent Chip Model)**

**Différence :** PT4 a `amt_expected_won_icm_pct`

**Avantage PT4 :**
- Calcul de l'impact ICM dans les décisions
- Analyse des deals/final deals

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE tournaments ADD COLUMN icm_factor REAL DEFAULT 1.0;
ALTER TABLE player_hands ADD COLUMN icm_equity_percent REAL DEFAULT 0;
```

---

### 6. **Rebuys / Addons / Bounties**

**Différence :** PT4 suit tous les add-ons

**Avantage PT4 :**
- ROI précis avec tous les coûts
- Support des tournois KO

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE tournaments ADD COLUMN rebuy_count INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN addon_count INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN bounty_amount REAL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN is_knockout BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN bounty_won REAL DEFAULT 0;
```

---

### 7. **Séparation Historique Brut**

**Différence :** PT4 a `tourney_hand_histories` séparée

**Avantage PT4 :**
- Table `hands` plus légère
- Chargement rapide des listes
- Historique chargé on-demand

**Suggestion pour SpinTracker :**
```sql
-- Créer une nouvelle table
CREATE TABLE hand_histories (
    hand_id INTEGER PRIMARY KEY,
    history TEXT NOT NULL,
    FOREIGN KEY (hand_id) REFERENCES hands(id)
);

-- Déplacer raw_content de hands vers hand_histories
-- Garder hands léger pour les listes
```

---

### 8. **Notes avec Full-Text Search**

**Différence :** PT4 a `note_tsvector` pour recherche PostgreSQL

**Avantage PT4 :**
- Recherche rapide dans les notes
- Recherche sémantique

**Suggestion pour SpinTracker (SQLite) :**
```sql
-- SQLite a aussi FTS5
CREATE VIRTUAL TABLE notes_fts USING fts5(
    player_name,
    note_content,
    date_note
);

-- Ou utiliser LIKE avec index
CREATE INDEX idx_notes_content ON notes(notes);
```

---

### 9. **Tags Colorés**

**Différence :** PT4 a système de tags avec couleurs

**Avantage PT4 :**
- Catégorisation visuelle des joueurs
- Tags : "Nit", "LAG", "Fish", etc.

**Suggestion pour SpinTracker :**
```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color_code TEXT -- "#FF0000"
);

CREATE TABLE player_tags (
    player_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id),
    UNIQUE(player_id, tag_id)
);
```

---

### 10. **Structure de Blinds**

**Différence :** PT4 a `tourney_blinds` table

**Avantage PT4 :**
- Suivi de la structure complète
- Analyse du jeu par niveau de blinds

**Suggestion pour SpinTracker :**
```sql
CREATE TABLE blind_structures (
    id INTEGER PRIMARY KEY,
    tournament_id INTEGER,
    level_num INTEGER,
    small_blind REAL,
    big_blind REAL,
    ante REAL DEFAULT 0,
    duration_minutes INTEGER,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);
```

---

### 11. **Conversion Devises**

**Différence :** PT4 a `currency` et `val_curr_conv`

**Avantage PT4 :**
- Support multi-devises
- ROI dans la devise de référence

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE tournaments ADD COLUMN base_currency TEXT DEFAULT 'EUR';
ALTER TABLE tournaments ADD COLUMN conversion_rate REAL DEFAULT 1.0;
ALTER TABLE tournaments ADD COLUMN buy_in_base REAL DEFAULT 0; -- Converti
```

---

### 12. **Tables de Cache pour Performance**

**Différence :** PT4 a `tourney_cache`, `cash_cache`

**Avantage PT4 :**
- Stats pré-calculées pour le HUD
- Pas de recalcul à chaque main

**Suggestion pour SpinTracker :**
```sql
CREATE TABLE player_stats_cache (
    player_id INTEGER PRIMARY KEY,
    vpip REAL,
    pfr REAL,
    three_bet REAL,
    cbet_flop REAL,
    cbet_turn REAL,
    hands_count INTEGER,
    last_updated TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id)
);
```

---

### 13. **Positions Détaillées**

**Différence :** PT4 a lookup avec flags (EP, MP, CO, BTN, SB, BB)

**Avantage PT4 :**
- Filtrage par type de position
- Stats par position précises

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN position_type TEXT; -- EP, MP, LP, BLIND
-- Ou normaliser
ALTER TABLE player_hands ADD COLUMN is_ep BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN is_mp BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN is_co BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN is_btn BOOLEAN DEFAULT 0;
```

---

### 14. **All-in Tracking**

**Différence :** PT4 a `enum_allin`, `enum_face_allin`, `enum_face_allin_action`

**Avantage PT4 :**
- Stats vs all-in
- Décisions face à all-in

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN flg_allin BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_face_allin BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN allin_action TEXT; -- C, F, R
```

---

### 15. **Effective Stack**

**Différence :** PT4 track `amt_p_effective_stack`, etc. par street

**Avantage PT4 :**
- Analyse SPR (Stack-to-Pot Ratio)
- Profondeur de tapis réelle

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN effective_stack_preflop REAL;
ALTER TABLE player_hands ADD COLUMN effective_stack_flop REAL;
ALTER TABLE player_hands ADD COLUMN effective_stack_turn REAL;
ALTER TABLE player_hands ADD COLUMN effective_stack_river REAL;
ALTER TABLE player_hands ADD COLUMN spr_flop REAL; -- Stack-to-pot ratio
```

---

### 16. **Winner Tracking**

**Différence :** PT4 a `id_winner` dans tourney_summary

**Avantage PT4 :**
- Requête rapide du vainqueur
- Stats des winners

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE tournaments ADD COLUMN winner_id INTEGER;
ALTER TABLE tournaments ADD COLUMN winner_name TEXT;
-- Index pour recherche
CREATE INDEX idx_tournaments_winner ON tournaments(winner_id);
```

---

### 17. **Hand Combinations**

**Différence :** PT4 a `tourney_hand_player_combinations`

**Avantage PT4 :**
- Stats par type de main (AA, KK, AKs...)
- Groupement des mains similaires

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN hand_group TEXT; -- PP, SuitedConnector, etc.
ALTER TABLE player_hands ADD COLUMN is_suited BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN is_pair BOOLEAN DEFAULT 0;
```

---

### 18. **Showdown Details**

**Différence :** PT4 a `flg_showed`, `id_final_hand`, `id_final_hand_lo`

**Avantage PT4 :**
- Qui a montré son jeu
- Main gagnante exacte (hi/lo)

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN showed_cards BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN won_at_showdown BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN folded_before_showdown BOOLEAN DEFAULT 0;
```

---

### 19. **Aggressor Tracking**

**Différence :** PT4 track l'agresseur par position

**Avantage PT4 :**
- Stats vs aggressor
- Qui a l'initiative

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN aggressor_position TEXT;
ALTER TABLE player_hands ADD COLUMN is_aggressor BOOLEAN DEFAULT 0;
```

---

### 20. **Check-Raise Tracking**

**Différence :** PT4 a flags dédiés `flg_f_check_raise`, etc.

**Avantage PT4 :**
- Stats de check-raise par street
- Détection des pièges

**Suggestion pour SpinTracker :**
```sql
ALTER TABLE player_hands ADD COLUMN flg_check_raise_flop BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_check_raise_turn BOOLEAN DEFAULT 0;
ALTER TABLE player_hands ADD COLUMN flg_check_raise_river BOOLEAN DEFAULT 0;
```

---

## Résumé des Priorités d'Implémentation

### Haute Priorité (Impact immédiat)
1. **Tables de lookup** - Normalisation de base
2. **Support multi-rooms (id_site)** - Architecture
3. **Flags d'actions détaillés** - Stats HUD
4. **Séparation hand histories** - Performance
5. **Tags colorés** - UX

### Moyenne Priorité (Améliorations importantes)
6. **Rebuys/Addons/Bounties** - Complétude des données
7. **Expected Won / Equity** - Analyse EV
8. **Notes full-text** - Recherche
9. **Cache de stats** - Performance HUD
10. **Conversion devises** - Multi-room

### Basse Priorité (Nice-to-have)
11. **Structure de blinds** - Analyse avancée
12. **ICM** - Spin & Go spécifique
13. **Hand combinations** - Filtrage avancé
14. **Effective stack par street** - Analyse profonde
15. **Tables live poker** - Futur support

---

## Conclusion

PokerTracker 4 est une solution enterprise avec 20+ ans de développement. SpinTracker peut s'en inspirer pour :

1. **Architecture** : Normalisation, lookup tables, séparation des concerns
2. **Stats** : Flags détaillés pour chaque action possible
3. **Performance** : Tables de cache, histories séparées
4. **Fonctionnalités** : Tags, notes, multi-room, bounties

L'objectif n'est pas de copier les 200+ colonnes de PT4, mais d'adopter les patterns qui apportent le plus de valeur pour le suivi des Spin & Go.
