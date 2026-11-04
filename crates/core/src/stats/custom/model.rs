//! The definition of a user-made stat and its validation.
//!
//! A custom stat is `numerator / denominator` over the hands of a player that pass the filters.
//! Conditions are trees of whitelisted leaves (an existing flag, or a predicate over the parsed
//! actions); nothing a user types is ever executed or put in SQL. Definitions come from the UI and
//! from the database, so every one goes through [`CustomStatDef::validate`].

use serde::{Deserialize, Serialize};

use crate::stats::flags::Flag;

/// Version of the definition format.
pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_DEPTH: usize = 4;
pub const MAX_LEAVES: usize = 12;
/// Serialized size of a definition.
pub const MAX_DEFINITION_BYTES: usize = 8 * 1024;
pub const MAX_CUSTOM_STATS: usize = 100;

const MAX_BB: f64 = 1000.0;
const MAX_COUNT: f64 = 8.0;
const MAX_POT_PERCENT: f64 = 1000.0;
/// Positions the stored hands carry (heads-up and three-handed spins).
pub const POSITIONS: [&str; 3] = ["BTN", "SB", "BB"];
pub const TABLE_SIZES: [i32; 2] = [2, 3];

/// An inclusive range; a missing bound is open.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Range {
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
}

impl Range {
    pub fn contains(&self, value: f64) -> bool {
        self.min.map_or(true, |m| value >= m) && self.max.map_or(true, |m| value <= m)
    }

    fn validate(&self, what: &str, limit: f64) -> Result<(), String> {
        for bound in [self.min, self.max].into_iter().flatten() {
            if !bound.is_finite() || !(0.0..=limit).contains(&bound) {
                return Err(format!("{what}: bounds must be between 0 and {limit}"));
            }
        }
        match (self.min, self.max) {
            (Some(min), Some(max)) if min > max => Err(format!("{what}: minimum is above maximum")),
            _ => Ok(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StreetName {
    Preflop,
    Flop,
    Turn,
    River,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionName {
    Bet,
    Raise,
    Call,
    Check,
    Fold,
}

/// A condition on one player in one hand.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Cond {
    And { items: Vec<Cond> },
    Or { items: Vec<Cond> },
    Not { item: Box<Cond> },
    /// A built-in flag, by its name (see `Flag::name`).
    Flag { name: String },
    /// The player took this action on the street (`all_in`: only counts all-in, or only not all-in).
    Action { street: StreetName, action: ActionName, #[serde(default)] all_in: Option<bool> },
    /// The player acts last after the flop: the button, or the small blind heads-up.
    InPosition,
    /// Another player had bet or raised on the street before the player's first action there.
    FacingAggression { street: StreetName },
    /// Size of the player's first preflop raise, "to" amount in big blinds.
    RaiseSizeBb { range: Range },
    /// Size in big blinds of the raise the player first faced preflop.
    FacingRaiseSizeBb { range: Range },
    /// Players who limped before the player's first preflop action.
    LimpersBefore { range: Range },
    /// Raises made before the player's first preflop action.
    RaisesBefore { range: Range },
    /// Players still in the hand when the flop is dealt.
    PlayersSeeingFlop { range: Range },
    /// Size of the player's first bet on the street, in percent of the pot before it.
    BetSizePercentPot { street: StreetName, range: Range },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Filters {
    /// Empty means every position.
    #[serde(default)]
    pub positions: Vec<String>,
    /// Empty means every table size.
    #[serde(default)]
    pub table_sizes: Vec<i32>,
    /// The player's stack at the start of the hand, in big blinds.
    #[serde(default)]
    pub stack_bb: Option<Range>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomStatDef {
    pub schema: u32,
    pub name: String,
    pub numerator: Cond,
    /// Missing: every hand that passes the filters.
    #[serde(default)]
    pub denominator: Option<Cond>,
    #[serde(default)]
    pub filters: Filters,
}

pub fn flag_by_name(name: &str) -> Option<Flag> {
    Flag::ALL.iter().copied().find(|f| f.name() == name)
}

fn validate_cond(cond: &Cond, depth: usize, leaves: &mut usize) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err(format!("conditions nest at most {MAX_DEPTH} levels"));
    }
    match cond {
        Cond::And { items } | Cond::Or { items } => {
            if items.is_empty() {
                return Err("a group needs at least one condition".into());
            }
            items.iter().try_for_each(|c| validate_cond(c, depth + 1, leaves))
        }
        Cond::Not { item } => validate_cond(item, depth + 1, leaves),
        leaf => {
            *leaves += 1;
            if *leaves > MAX_LEAVES {
                return Err(format!("at most {MAX_LEAVES} conditions per stat"));
            }
            match leaf {
                Cond::Flag { name } => flag_by_name(name).map(|_| ()).ok_or_else(|| format!("unknown flag {name:?}")),
                Cond::RaiseSizeBb { range } => range.validate("raise size", MAX_BB),
                Cond::FacingRaiseSizeBb { range } => range.validate("facing raise size", MAX_BB),
                Cond::LimpersBefore { range } => range.validate("limpers", MAX_COUNT),
                Cond::RaisesBefore { range } => range.validate("raises", MAX_COUNT),
                Cond::PlayersSeeingFlop { range } => range.validate("players seeing the flop", MAX_COUNT),
                Cond::BetSizePercentPot { street, range } => {
                    if *street == StreetName::Preflop {
                        return Err("bet size in percent of the pot needs a postflop street".into());
                    }
                    range.validate("bet size", MAX_POT_PERCENT)
                }
                Cond::Action { street, action, .. } => match (street, action) {
                    (StreetName::Preflop, ActionName::Check) => Err("nobody checks preflop".into()),
                    _ => Ok(()),
                },
                _ => Ok(()),
            }
        }
    }
}

impl CustomStatDef {
    /// The first problem found, as a message for the user.
    pub fn validate(&self) -> Result<(), String> {
        if self.schema != SCHEMA_VERSION {
            return Err(format!("unsupported schema {}", self.schema));
        }
        let name = self.name.trim();
        if name.is_empty() || name.chars().count() > MAX_NAME_CHARS || name.chars().any(char::is_control) {
            return Err(format!("the name needs 1 to {MAX_NAME_CHARS} characters"));
        }
        let mut leaves = 0;
        validate_cond(&self.numerator, 1, &mut leaves)?;
        if let Some(den) = &self.denominator {
            validate_cond(den, 1, &mut leaves)?;
        }
        if self.filters.positions.iter().any(|p| !POSITIONS.contains(&p.as_str())) {
            return Err("unknown position".into());
        }
        if self.filters.table_sizes.iter().any(|s| !TABLE_SIZES.contains(s)) {
            return Err("unknown table size".into());
        }
        if let Some(range) = &self.filters.stack_bb {
            range.validate("stack", MAX_BB)?;
        }
        let size = serde_json::to_string(self).map_err(|e| e.to_string())?.len();
        if size > MAX_DEFINITION_BYTES {
            return Err("the definition is too large".into());
        }
        Ok(())
    }

    /// Canonical JSON of the definition (what is stored and hashed).
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("a definition always serializes")
    }
}

/// Parses and validates a definition coming from the UI or the database.
pub fn parse_definition(value: &serde_json::Value) -> Result<CustomStatDef, String> {
    let raw = value.to_string();
    if raw.len() > MAX_DEFINITION_BYTES {
        return Err("the definition is too large".into());
    }
    let mut def: CustomStatDef = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
    def.name = def.name.trim().to_string();
    def.validate()?;
    Ok(def)
}

/// Fingerprint of what a definition counts (FNV-1a, stable across versions and platforms); the name
/// is left out so a rename keeps the computed figures.
pub fn definition_hash(def: &CustomStatDef) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let counted = CustomStatDef { name: String::new(), ..def.clone() };
    for byte in counted.to_json().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// What the editor may offer: the flag names and the limits a definition must respect.
pub fn options() -> serde_json::Value {
    serde_json::json!({
        "schema": SCHEMA_VERSION,
        "flags": Flag::ALL.iter().map(|f| f.name()).collect::<Vec<_>>(),
        "positions": POSITIONS,
        "tableSizes": TABLE_SIZES,
        "presets": super::presets::presets().into_iter().map(|(id, def)| serde_json::json!({ "id": id, "definition": def })).collect::<Vec<_>>(),
        "limits": { "nameChars": MAX_NAME_CHARS, "depth": MAX_DEPTH, "leaves": MAX_LEAVES, "stats": MAX_CUSTOM_STATS },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn base() -> serde_json::Value {
        json!({ "schema": 1, "name": "Mine", "numerator": { "type": "flag", "name": "Rfi" }, "denominator": { "type": "flag", "name": "RfiOpp" } })
    }

    #[test]
    fn a_valid_definition_round_trips() {
        let def = parse_definition(&base()).unwrap();
        assert_eq!(def.numerator, Cond::Flag { name: "Rfi".into() });
        assert_eq!(parse_definition(&serde_json::from_str(&def.to_json()).unwrap()).unwrap(), def);
        assert_eq!(definition_hash(&def), definition_hash(&def.clone()));
    }

    #[test]
    fn unknown_names_and_fields_are_refused() {
        let mut v = base();
        v["numerator"]["name"] = json!("NotAFlag");
        assert!(parse_definition(&v).unwrap_err().contains("unknown flag"));
        let mut v = base();
        v["extra"] = json!(1);
        assert!(parse_definition(&v).is_err());
        let mut v = base();
        v["filters"] = json!({ "positions": ["UTG"] });
        assert!(parse_definition(&v).is_err());
        let mut v = base();
        v["filters"] = json!({ "tableSizes": [4] });
        assert!(parse_definition(&v).is_err());
    }

    #[test]
    fn names_are_trimmed_and_limited() {
        let mut v = base();
        v["name"] = json!("  Mine  ");
        assert_eq!(parse_definition(&v).unwrap().name, "Mine");
        v["name"] = json!("   ");
        assert!(parse_definition(&v).is_err());
        v["name"] = json!("x".repeat(MAX_NAME_CHARS + 1));
        assert!(parse_definition(&v).is_err());
        v["name"] = json!("bad\nname");
        assert!(parse_definition(&v).is_err());
    }

    #[test]
    fn depth_leaves_and_ranges_are_limited() {
        let mut nested = json!({ "type": "flag", "name": "Vpip" });
        for _ in 0..MAX_DEPTH {
            nested = json!({ "type": "not", "item": nested });
        }
        let mut v = base();
        v["numerator"] = nested;
        assert!(parse_definition(&v).unwrap_err().contains("nest"));

        let leaf = json!({ "type": "flag", "name": "Vpip" });
        v["numerator"] = json!({ "type": "or", "items": vec![leaf; MAX_LEAVES + 1] });
        assert!(parse_definition(&v).unwrap_err().contains("at most"));

        v["numerator"] = json!({ "type": "raiseSizeBb", "range": { "min": 5, "max": 2 } });
        assert!(parse_definition(&v).unwrap_err().contains("above maximum"));
        v["numerator"] = json!({ "type": "raiseSizeBb", "range": { "min": -1 } });
        assert!(parse_definition(&v).is_err());
        v["numerator"] = json!({ "type": "betSizePercentPot", "street": "preflop", "range": {} });
        assert!(parse_definition(&v).is_err());
        v["numerator"] = json!({ "type": "and", "items": [] });
        assert!(parse_definition(&v).is_err());
    }

    #[test]
    fn every_flag_name_resolves() {
        for flag in Flag::ALL {
            assert_eq!(flag_by_name(flag.name()), Some(*flag));
        }
    }
}
