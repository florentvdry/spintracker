//! Stat flags computed over the real sample hand histories.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use spintracker_core::db::Database;
use spintracker_core::models::ParsedHand;
use spintracker_core::parsers::{BetclicParser, HandParser, UnibetParser, WinamaxParser};
use spintracker_core::stats::flags::{Flag, Flags};
use spintracker_core::stats::registry::{self, count_expressions, find, Denominator, Section, STATS};
use spintracker_core::stats::store;

fn sample_files(room: &str, keep: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exemple-data").join(room);
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map_or(false, |x| x == "txt"))
        .filter(|p| keep(&p.file_name().unwrap().to_string_lossy()))
        .collect();
    files.sort();
    files
}

fn parse(parser: &dyn HandParser, files: &[PathBuf]) -> Vec<ParsedHand> {
    files
        .iter()
        .flat_map(|f| {
            let text = String::from_utf8_lossy(&fs::read(f).unwrap()).trim_start_matches('\u{feff}').to_string();
            parser.parse_file(&text).hands
        })
        .collect()
}

fn all_sample_hands() -> Vec<ParsedHand> {
    let mut hands = parse(&BetclicParser, &sample_files("Betclic", |n| n != "excepted_result.txt"));
    hands.extend(parse(&WinamaxParser, &sample_files("Winamax", |n| n != "expected_result.txt" && !n.contains("_summary"))));
    hands.extend(parse(&UnibetParser, &sample_files("Unibet", |n| n.starts_with('H'))));
    hands
}

/// Minimal rows: what the backfill reads (preflop text, blinds, player count, positions).
fn insert(conn: &Connection, hands: &[ParsedHand]) {
    for hand in hands {
        let id = hand.id.as_deref().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO hands (id, game_id, preflop_action, blinds, player_count) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, hand.game_id, hand.preflop_action, hand.blinds, hand.player_count],
        )
        .unwrap();
        for p in &hand.players {
            conn.execute(
                "INSERT OR REPLACE INTO player_hands (hand_id, player_name, position, stack) VALUES (?1, ?2, ?3, ?4)",
                params![id, p.name, p.position, p.stack],
            )
            .unwrap();
        }
    }
}

fn load_all(conn: &Connection) -> Vec<Flags> {
    let mut stmt = conn.prepare("SELECT flags_0, flags_1, flags_2, flags_3 FROM hand_player_flags").unwrap();
    stmt.query_map([], |r| {
        Ok(Flags::from_words([r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as u64, r.get::<_, i64>(2)? as u64, r.get::<_, i64>(3)? as u64]))
    })
    .unwrap()
    .map(|r| r.unwrap())
    .collect()
}

#[test]
fn backfill_over_sample_hands_is_consistent() {
    let hands = all_sample_hands();
    assert!(hands.len() > 5000, "sample data not found: {} hands", hands.len());

    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(dir.path().join("samples.db")).unwrap();
    let mut conn = db.conn().unwrap();
    insert(&conn, &hands);
    let expected_rows: i64 = conn.query_row("SELECT COUNT(*) FROM player_hands", [], |r| r.get(0)).unwrap();

    let processed = store::backfill(&mut conn, |_, _| {}).unwrap();
    assert_eq!(processed as usize, hands.iter().map(|h| h.id.as_deref().unwrap()).collect::<std::collections::HashSet<_>>().len());
    let stored: i64 = conn.query_row("SELECT COUNT(*) FROM hand_player_flags", [], |r| r.get(0)).unwrap();
    assert_eq!(stored, expected_rows, "one flag row per player and hand");

    let rows = load_all(&conn);

    // Every counted action must have its opportunity, or a percentage could exceed 100%.
    let mut orphaned = Vec::new();
    for def in STATS {
        if let Denominator::Flag(opp) = def.denominator {
            if opp != def.numerator && rows.iter().any(|r| r.has(def.numerator) && !r.has(opp)) {
                orphaned.push(format!("{:?}/{}", def.section, def.label));
            }
        }
    }
    assert!(orphaned.is_empty(), "actions counted without their opportunity: {orphaned:?}");

    // Aggregating in SQL gives the same figures as counting the rows in memory.
    for def in STATS {
        let (num, den) = count_expressions("f", def);
        let (n, d): (i64, i64) =
            conn.query_row(&format!("SELECT {num}, {den} FROM hand_player_flags f"), [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((n as u64, d as u64), registry::count(def, &rows), "{:?} {}", def.section, def.label);
    }

    // Population-level sanity: poker frequencies must be proportions, and PFR cannot exceed VPIP.
    let (vpip, hands_n) = registry::count(find(Section::Preflop, "VPIP").unwrap(), &rows);
    let (pfr, _) = registry::count(find(Section::Preflop, "PFR").unwrap(), &rows);
    assert!(pfr <= vpip && vpip < hands_n, "vpip {vpip} pfr {pfr} of {hands_n}");
    let share = vpip as f64 / hands_n as f64;
    assert!((0.1..0.9).contains(&share), "implausible VPIP {share}");
    println!("sample population: {hands_n} player-hands, VPIP {:.1}%, PFR {:.1}%", share * 100.0, pfr as f64 / hands_n as f64 * 100.0);
}

#[test]
fn a_known_winamax_hand_gets_the_expected_flags() {
    let files = sample_files("Winamax", |n| n.starts_with("20260415_Expresso(1096047576)") && !n.contains("_summary"));
    let hand = parse(&WinamaxParser, &files).remove(0);
    let players: Vec<store::SeatInput> = hand
        .players
        .iter()
        .map(|p| store::SeatInput { name: p.name.clone(), position: p.position.clone(), went_to_showdown: p.went_to_showdown, net_profit: p.net_profit })
        .collect();
    let rows = store::flags_for_hand(&store::HandFlagInput {
        preflop_action: &hand.preflop_action,
        flop_action: &hand.flop_action,
        turn_action: &hand.turn_action,
        river_action: &hand.river_action,
        flop_cards: hand.flop.as_deref().unwrap_or(""),
        blinds: hand.blinds.as_deref().unwrap(),
        player_count: hand.player_count,
        players: &players,
    });

    let flags_of = |name: &str| rows.iter().find(|(n, _)| n == name).unwrap().1.flags;
    // Hero (button) folds first in; the small blind then completes and the big blind checks.
    let hero = flags_of("Nelfrot-YT");
    assert!(hero.has(Flag::RfiOpp) && hero.has(Flag::LimpOpp) && hero.has(Flag::StealOpp));
    assert!(!hero.has(Flag::Vpip) && !hero.has(Flag::Rfi));
    let small_blind = flags_of("riickyy777");
    assert!(small_blind.has(Flag::Vpip) && !small_blind.has(Flag::Pfr), "completing the blind is voluntary");
    let big_blind = flags_of("CG_Boss2336");
    assert!(!big_blind.has(Flag::Vpip), "a big blind that only checks has not entered voluntarily");
}
