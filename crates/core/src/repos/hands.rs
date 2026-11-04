//! Writing hands, their players and their stat flags.

use rusqlite::{params, Connection};
use serde_json::Value;

use crate::models::{HandAnalytics, ParsedHand, PlayerInfo};
use crate::stats::store::{self, PlayerFacts};
use crate::Result;

/// A parsed hand with everything computed at import time.
pub struct ImportedHand {
    pub hand: ParsedHand,
    pub analytics: HandAnalytics,
    /// Stat flags of every player, in seating order.
    pub flags: Vec<(String, PlayerFacts)>,
}

/// Inserts (or replaces) hands, players and flags in one transaction. Returns the number of hands
/// written. Hands without an id and players without a name are skipped.
pub fn insert_batch(conn: &mut Connection, items: &[ImportedHand]) -> Result<usize> {
    if items.is_empty() {
        return Ok(0);
    }
    let tx = conn.transaction()?;
    let mut inserted = 0;
    {
        let mut hand_stmt = tx.prepare_cached(
            "INSERT OR REPLACE INTO hands (
                id, game_id, hand_id, room, game_mode, game_type, game_name,
                prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                total_pot, rake, preflop_action,
                flop, flop_action, turn, turn_action, river, river_action,
                showdown, result, all_in_street, went_to_showdown, player_count, position,
                limit_type, game_variant, currency, button_seat, ante, tournament_id,
                tournament_name, tournament_level, buyin_currency, rake_per_player,
                structured_actions
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
                ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39
            )",
        )?;
        let mut player_stmt = tx.prepare_cached(
            "INSERT OR REPLACE INTO player_hands (
                hand_id, player_name, position, stack, cards, investment,
                chips_won, net_profit, is_all_in, went_to_showdown,
                ev_chips, net_won_adjusted, showdown_winning, non_showdown_winning,
                equity_preflop, equity_flop, equity_turn, equity_river, cev_contribution
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        )?;

        for item in items {
            let h = &item.hand;
            let Some(id) = h.id.as_deref().filter(|id| !id.is_empty()) else {
                log::warn!("skipping a hand without id");
                continue;
            };

            // The hand's structured actions are stored the way the former backend serialised them
            // (PascalCase property names).
            let structured = h
                .structured_actions
                .as_ref()
                .map(|s| serde_json::to_value(s).map(|v| pascalize(v).to_string()))
                .transpose()?;

            let text = |v: &Option<String>| v.clone().unwrap_or_default();
            inserted += hand_stmt.execute(params![
                id,
                text(&h.game_id),
                text(&h.hand_id),
                text(&h.room),
                text(&h.game_mode),
                text(&h.game_type),
                text(&h.game_name),
                h.prize_pool,
                h.multiplier,
                h.buy_in,
                text(&h.date_time),
                text(&h.table_id),
                text(&h.blinds),
                h.total_pot,
                h.rake,
                h.preflop_action,
                text(&h.flop),
                h.flop_action,
                text(&h.turn),
                h.turn_action,
                text(&h.river),
                h.river_action,
                h.showdown,
                h.result,
                text(&h.all_in_street),
                h.went_to_showdown,
                h.player_count,
                h.position,
                h.limit_type,
                h.game_variant,
                h.currency,
                h.button_seat,
                h.ante,
                h.tournament_id,
                h.tournament_name,
                h.tournament_level,
                h.buyin_currency,
                h.rake_per_player,
                structured,
            ])?;

            for p in h.players.iter().filter(|p| !p.name.is_empty()) {
                insert_player(&mut player_stmt, id, p, &item.analytics)?;
            }
            store::save_hand_flags(&tx, id, &item.flags)?;
        }
    }
    tx.commit()?;
    Ok(inserted)
}

fn insert_player(
    stmt: &mut rusqlite::CachedStatement<'_>,
    hand_id: &str,
    p: &PlayerInfo,
    analytics: &HandAnalytics,
) -> Result<()> {
    // Only the hero carries computed analytics; everybody else keeps the plain result.
    let a = p.is_hero.then_some(analytics);
    let ev_chips = a.and_then(|a| a.ev_chips);
    let net_won_adjusted = a.and_then(|a| a.net_won_adjusted).unwrap_or(p.net_profit);
    let showdown_winning = a.and_then(|a| a.chips_won_showdown).unwrap_or(if p.went_to_showdown { p.net_profit } else { 0.0 });
    let non_showdown_winning =
        a.and_then(|a| a.chips_won_no_showdown).unwrap_or(if p.went_to_showdown { 0.0 } else { p.net_profit });

    stmt.execute(params![
        hand_id,
        p.name,
        p.position,
        p.stack as i64,
        p.cards,
        p.investment,
        p.chips_won,
        p.net_profit,
        p.is_all_in,
        p.went_to_showdown,
        ev_chips,
        net_won_adjusted,
        showdown_winning,
        non_showdown_winning,
        a.and_then(|a| a.equity_preflop),
        a.and_then(|a| a.equity_flop),
        a.and_then(|a| a.equity_turn),
        a.and_then(|a| a.equity_river),
        a.and_then(|a| a.cev_contribution).unwrap_or(0.0),
    ])?;
    Ok(())
}

/// camelCase keys to PascalCase, recursively.
fn pascalize(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, v)| {
                    let mut chars = k.chars();
                    let key = chars.next().map(|c| c.to_uppercase().collect::<String>() + chars.as_str()).unwrap_or_default();
                    (key, pascalize(v))
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(pascalize).collect()),
        other => other,
    }
}

/// Removes Winamax rows an old import left without a stable hand id or date: re-importing
/// rebuilds them consistently. Returns the number of hands removed.
pub fn cleanup_corrupted_winamax_hands(conn: &mut Connection) -> Result<usize> {
    const CORRUPTED: &str =
        "SELECT id FROM hands WHERE room = 'Winamax' AND (hand_id IS NULL OR hand_id = '' OR date_time IS NULL OR date_time = '')";
    let tx = conn.transaction()?;
    tx.execute(&format!("DELETE FROM hand_player_flags WHERE hand_id IN ({CORRUPTED})"), [])?;
    tx.execute(&format!("DELETE FROM player_hands WHERE hand_id IN ({CORRUPTED})"), [])?;
    let removed = tx.execute(&format!("DELETE FROM hands WHERE id IN ({CORRUPTED})"), [])?;
    tx.commit()?;
    Ok(removed)
}

/// Wipes hands, players and stat flags (aliases are kept) and resets the autoincrement counters.
pub fn delete_all(conn: &mut Connection) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute_batch(
        "DELETE FROM hand_player_flags;
         DELETE FROM player_hands;
         DELETE FROM hands;
         DELETE FROM players;",
    )?;
    // The table only exists once an AUTOINCREMENT table has been used.
    if let Err(e) = tx.execute("DELETE FROM sqlite_sequence", []) {
        log::warn!("could not reset sqlite_sequence: {e}");
    }
    tx.commit()?;
    Ok(())
}
