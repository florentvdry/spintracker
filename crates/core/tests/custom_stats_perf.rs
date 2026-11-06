//! Recomputing custom stats over a large history stays in a reasonable time.

use std::time::Instant;

use serde_json::json;
use spintracker_core::api::Backend;

const HANDS: usize = 20_000;
/// Generous: the work is one pass over the hands, a few seconds on a slow disk.
const BUDGET_SECONDS: u64 = 30;

#[test]
fn recomputing_twenty_thousand_hands_is_bounded() {
    let dir = tempfile::tempdir().unwrap();
    let backend = Backend::open(dir.path(), None).unwrap();
    {
        let mut conn = backend.database().conn().unwrap();
        let tx = conn.transaction().unwrap();
        for n in 0..HANDS {
            let id = format!("h{n}");
            tx.execute(
                "INSERT INTO hands (id, room, player_count, blinds, preflop_action, flop_action) VALUES (?1, 'Winamax', 2, '20/40', 'hero posts small blind 20\nvillain posts big blind 40\nhero raises 40 to 80\nvillain calls 40', 'villain checks\nhero bets 60')",
                [&id],
            )
            .unwrap();
            for (name, position) in [("hero", "SB"), ("villain", "BB")] {
                tx.execute("INSERT INTO player_hands (hand_id, player_name, position, stack) VALUES (?1, ?2, ?3, 600)", rusqlite::params![id, name, position]).unwrap();
            }
        }
        tx.commit().unwrap();
    }
    backend.backfill_flags(|_, _| {}).unwrap();

    let definition = json!({
        "schema": 1, "name": "Open and c-bet",
        "numerator": { "type": "and", "items": [
            { "type": "action", "street": "preflop", "action": "raise" },
            { "type": "betSizePercentPot", "street": "flop", "range": { "min": 30, "max": 100 } },
        ] },
        "denominator": { "type": "inPosition" },
    });
    assert_eq!(backend.handle("POST", "/custom-stats", Some(definition)).status, 200);

    let started = Instant::now();
    let response = backend.handle("POST", "/custom-stats/recompute", None);
    let elapsed = started.elapsed();
    println!("{HANDS} hands recomputed in {elapsed:?}");
    assert_eq!(response.body["data"]["processed"], HANDS);
    assert!(elapsed.as_secs() < BUDGET_SECONDS, "{elapsed:?}");
}
