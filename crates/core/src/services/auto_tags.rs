//! Tags the application puts on players from their figures ("Shover": opens all-in more than 60 %
//! of the time over at least 30 chances). They describe how a player plays, they are never a
//! verdict. The rules are the user's to change; they are recomputed after every import.

use std::collections::HashSet;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::repos::app_settings;
use crate::repos::hud_stats::{self, HudStatRequest};
use crate::Result;

const SETTING_KEY: &str = "auto_tag_rules";
/// Rules kept, tag names and the sizes that keep a stored rule list reasonable.
pub const MAX_RULES: usize = 30;
pub const MAX_TAG_CHARS: usize = 24;
const PERCENT: f64 = 100.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Comparison {
    /// The figure is at least the threshold.
    AtLeast,
    /// The figure is at most the threshold.
    AtMost,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    /// The tag put on the player.
    pub tag: String,
    pub section: String,
    pub label: String,
    #[serde(default)]
    pub column: Option<String>,
    pub comparison: Comparison,
    /// Percent, 0..=100.
    pub threshold: f64,
    /// Opportunities the figure needs before the rule judges it.
    pub min_sample: u64,
}

impl Rule {
    /// Whether a figure of `num` out of `den` opportunities earns the tag.
    pub fn matches(&self, num: u64, den: u64) -> bool {
        if den == 0 || den < self.min_sample {
            return false;
        }
        let pct = num as f64 * PERCENT / den as f64;
        match self.comparison {
            Comparison::AtLeast => pct >= self.threshold,
            Comparison::AtMost => pct <= self.threshold,
        }
    }

    fn request(&self) -> HudStatRequest {
        HudStatRequest { section: self.section.clone(), label: self.label.clone(), column: self.column.clone(), bucket: None }
    }

    /// The first problem of a rule written by the user.
    pub fn validate(&self) -> std::result::Result<(), String> {
        let tag = self.tag.trim();
        if tag.is_empty() || tag.chars().count() > MAX_TAG_CHARS {
            return Err(format!("a tag has 1 to {MAX_TAG_CHARS} characters"));
        }
        if !(0.0..=PERCENT).contains(&self.threshold) || !self.threshold.is_finite() {
            return Err("the threshold is a percentage between 0 and 100".into());
        }
        if self.section.is_empty() || self.label.is_empty() {
            return Err("a rule names a stat".into());
        }
        Ok(())
    }
}

/// The rules a new database starts with. Open Shove is the example of the roadmap; the others tell
/// loose from tight and aggressive from passive on the preflop figures every player has.
pub fn default_rules() -> Vec<Rule> {
    let rule = |tag: &str, section: &str, label: &str, comparison, threshold, min_sample| Rule {
        tag: tag.into(),
        section: section.into(),
        label: label.into(),
        column: if section == "preflop" { Some("tot".into()) } else { None },
        comparison,
        threshold,
        min_sample,
    };
    vec![
        rule("Shover", "shove", "Open Shove", Comparison::AtLeast, 60.0, 30),
        rule("Loose", "preflop", "VPIP", Comparison::AtLeast, 75.0, 50),
        rule("Tight", "preflop", "VPIP", Comparison::AtMost, 45.0, 50),
        rule("Aggressive", "preflop", "PFR", Comparison::AtLeast, 60.0, 50),
        rule("Passive", "preflop", "PFR", Comparison::AtMost, 20.0, 50),
    ]
}

/// The saved rules, or the defaults when none were saved or the saved ones cannot be read.
pub fn load_rules(conn: &Connection) -> Result<Vec<Rule>> {
    let stored = app_settings::get(conn, SETTING_KEY)?.and_then(|v| serde_json::from_value::<Vec<Rule>>(v).ok());
    Ok(match stored {
        Some(rules) if rules.len() <= MAX_RULES && rules.iter().all(|r| r.validate().is_ok()) => rules,
        _ => default_rules(),
    })
}

/// Players whose figures are read: they need as many hands as the smallest sample a rule asks for.
fn candidates(conn: &Connection, min_hands: u64) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT name, COALESCE(room, '') FROM players WHERE total_hands >= ?1 AND room IS NOT NULL AND room != ''")?;
    let players = stmt.query_map(params![min_hands as i64], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<_, _>>()?;
    Ok(players)
}

/// Recomputes every automatic tag. Returns how many tags were written. A player whose figures
/// cannot be read keeps no tag rather than a stale one.
pub fn recompute(conn: &mut Connection) -> Result<usize> {
    let rules = load_rules(conn)?;
    let min_hands = rules.iter().map(|r| r.min_sample).min().unwrap_or(0);
    let requests: Vec<HudStatRequest> = rules.iter().map(Rule::request).collect();
    let players = candidates(conn, min_hands)?;

    let mut tags: Vec<(String, String, String)> = Vec::new();
    for (name, room) in players {
        let rows = hud_stats::load_rows_of_player(conn, &room, &name)?;
        let (_, figures) = hud_stats::compute(&rows, &requests, &HashSet::new());
        for (rule, figure) in rules.iter().zip(&figures) {
            let (Some(num), Some(den)) = (figure["num"].as_u64(), figure["den"].as_u64()) else { continue };
            if rule.matches(num, den) {
                tags.push((room.clone(), name.clone(), rule.tag.clone()));
            }
        }
    }

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM player_auto_tags", [])?;
    {
        let mut insert = tx.prepare("INSERT OR IGNORE INTO player_auto_tags (room, player_name, tag) VALUES (?1, ?2, ?3)")?;
        for (room, name, tag) in &tags {
            insert.execute(params![room, name, tag])?;
        }
    }
    tx.commit()?;
    Ok(tags.len())
}

/// The automatic tags of one player, in alphabetical order.
pub fn tags_of(conn: &Connection, room: &str, name: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM player_auto_tags WHERE room = ?1 AND player_name = ?2 ORDER BY tag")?;
    let tags = stmt.query_map(params![room, name], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
    Ok(tags)
}

/// Every tagged player: `[{ room, name, tags }]`.
pub fn all_tags(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare("SELECT room, player_name, tag FROM player_auto_tags ORDER BY room, player_name, tag")?;
    let rows: Vec<(String, String, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<std::result::Result<_, _>>()?;
    let mut out: Vec<Value> = Vec::new();
    for (room, name, tag) in rows {
        match out.last_mut() {
            Some(last) if last["room"] == room.as_str() && last["name"] == name.as_str() => last["tags"].as_array_mut().expect("tags is an array").push(json!(tag)),
            _ => out.push(json!({ "room": room, "name": name, "tags": [tag] })),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(comparison: Comparison, threshold: f64, min_sample: u64) -> Rule {
        Rule { tag: "T".into(), section: "preflop".into(), label: "VPIP".into(), column: None, comparison, threshold, min_sample }
    }

    #[test]
    fn a_rule_needs_its_sample_before_it_judges() {
        let shover = rule(Comparison::AtLeast, 60.0, 30);
        assert!(shover.matches(19, 30), "63 % over exactly 30 chances");
        assert!(shover.matches(18, 30), "exactly 60 % earns it");
        assert!(!shover.matches(17, 30), "56.7 % does not");
    }

    #[test]
    fn the_threshold_itself_counts() {
        let rule = rule(Comparison::AtLeast, 60.0, 10);
        assert!(rule.matches(6, 10));
        assert!(!rule.matches(5, 10));
        let low = self::rule(Comparison::AtMost, 20.0, 10);
        assert!(low.matches(2, 10));
        assert!(!low.matches(3, 10));
    }

    #[test]
    fn nothing_is_judged_without_enough_chances() {
        let rule = rule(Comparison::AtLeast, 10.0, 30);
        assert!(!rule.matches(29, 29));
        assert!(!rule.matches(0, 0));
    }

    #[test]
    fn a_rule_written_by_the_user_is_checked() {
        let mut bad = rule(Comparison::AtLeast, 60.0, 30);
        bad.threshold = 160.0;
        assert!(bad.validate().is_err());
        bad.threshold = 60.0;
        bad.tag = "  ".into();
        assert!(bad.validate().is_err());
        bad.tag = "x".repeat(MAX_TAG_CHARS + 1);
        assert!(bad.validate().is_err());
        assert!(rule(Comparison::AtMost, 0.0, 0).validate().is_ok());
    }

    #[test]
    fn the_default_rules_are_valid_and_include_the_shover() {
        let rules = default_rules();
        assert!(rules.iter().all(|r| r.validate().is_ok()));
        assert!(rules.iter().any(|r| r.tag == "Shover" && r.threshold == 60.0 && r.min_sample == 30));
    }
}
