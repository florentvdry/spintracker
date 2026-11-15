//! Pure rules of the player's own range scenarios: situation keys, scenario choice, names, colours.

/// Light and dark text colours tried on an action colour.
const LIGHT_TEXT: &str = "#ffffff";
const DARK_TEXT: &str = "#000000";

/// How a stack between two depths picks its range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DepthRule {
    /// The closest depth, the smaller one on a tie.
    Nearest,
    /// The deepest depth that does not exceed the stack, else the smallest.
    Below,
}

impl DepthRule {
    pub fn parse(value: &str) -> Self {
        if value.eq_ignore_ascii_case("below") {
            Self::Below
        } else {
            Self::Nearest
        }
    }
}

/// A stored range a hand could belong to.
#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub scenario_id: i64,
    pub spot_id: i64,
    pub format: String,
    pub line: String,
    /// "any" or "reg".
    pub opponent: String,
    pub stack_bb: f64,
}

/// The actions of the players who speak before the hero, lower-cased and comma-separated
/// ("BTN:fold,SB:call"); empty when the hero speaks first.
pub fn canonical_line(seq: &[String], hero_pos: &str) -> String {
    seq.iter()
        .take_while(|entry| !entry.split(':').next().is_some_and(|pos| pos.eq_ignore_ascii_case(hero_pos)))
        .map(|entry| entry.to_lowercase())
        .collect::<Vec<_>>()
        .join(",")
}

/// The range a decision falls in: same format and line, the reg variant first when the opponent
/// is a reg (then "any"), then the depth chosen by `rule`.
pub fn pick_scenario<'a>(
    candidates: &'a [Candidate],
    format: &str,
    line: &str,
    opponent_is_reg: bool,
    stack_bb: f64,
    rule: DepthRule,
) -> Option<&'a Candidate> {
    let same_situation = |c: &&Candidate| c.format == format && c.line == line;
    let with_opponent = |kind: &str| candidates.iter().filter(same_situation).filter(|c| c.opponent == kind).collect::<Vec<_>>();

    let mut pool = if opponent_is_reg { with_opponent("reg") } else { Vec::new() };
    if pool.is_empty() {
        pool = with_opponent("any");
    }
    match rule {
        DepthRule::Nearest => pool.into_iter().min_by(|a, b| {
            let (da, db) = ((a.stack_bb - stack_bb).abs(), (b.stack_bb - stack_bb).abs());
            da.total_cmp(&db).then(a.stack_bb.total_cmp(&b.stack_bb))
        }),
        DepthRule::Below => pool
            .iter()
            .filter(|c| c.stack_bb <= stack_bb)
            .max_by(|a, b| a.stack_bb.total_cmp(&b.stack_bb))
            .or_else(|| pool.iter().min_by(|a, b| a.stack_bb.total_cmp(&b.stack_bb)))
            .copied(),
    }
}

/// A short reading of a line: "SB limp", "BTN open, SB call", "BTN shove".
fn describe_line(line: &str) -> String {
    let mut raised = false;
    let mut parts = Vec::new();
    for entry in line.split(',').filter(|e| !e.is_empty()) {
        let Some((pos, verb)) = entry.split_once(':') else { continue };
        let pos = pos.to_uppercase();
        let text = match verb {
            "fold" => continue,
            "call" if raised => "call",
            "call" => "limp",
            "raise" | "bet" if raised => "3bet",
            "raise" | "bet" => {
                raised = true;
                "open"
            }
            "all-in" => {
                raised = true;
                "shove"
            }
            other => other,
        };
        parts.push(format!("{pos} {text}"));
    }
    parts.join(", ")
}

/// The name the wizard proposes: "BB vs SB limp · Reg", "BTN first in", "BB (HU) vs SB open".
pub fn default_name(format: &str, hero_position: &str, line: &str, opponent: &str) -> String {
    let hero = hero_position.to_uppercase();
    let seat = if format == "hu" { format!("{hero} (HU)") } else { hero };
    let described = describe_line(line);
    let mut name = if line.is_empty() {
        format!("{seat} first in")
    } else if described.is_empty() {
        format!("{seat} vs folds")
    } else {
        format!("{seat} vs {described}")
    };
    if opponent == "reg" {
        name.push_str(" · Reg");
    }
    name
}

fn channel(value: u8) -> f64 {
    let v = f64::from(value) / 255.0;
    if v <= 0.03928 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

/// Parses "#rrggbb" (or "#rgb").
pub fn parse_hex(hex: &str) -> Option<[u8; 3]> {
    let digits = hex.strip_prefix('#')?;
    let expanded: String = match digits.len() {
        3 => digits.chars().flat_map(|c| [c, c]).collect(),
        6 => digits.to_string(),
        _ => return None,
    };
    let value = u32::from_str_radix(&expanded, 16).ok()?;
    Some([(value >> 16) as u8, (value >> 8) as u8, value as u8])
}

fn luminance(rgb: [u8; 3]) -> f64 {
    0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

/// WCAG contrast ratio between two colours.
pub fn contrast(a: [u8; 3], b: [u8; 3]) -> f64 {
    let (la, lb) = (luminance(a), luminance(b));
    let (hi, lo) = if la >= lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

/// The more readable of a light and a dark text colour on `bg_hex`.
pub fn text_color(bg_hex: &str) -> &'static str {
    let Some(bg) = parse_hex(bg_hex) else { return LIGHT_TEXT };
    let (light, dark) = (parse_hex(LIGHT_TEXT).unwrap_or([255; 3]), parse_hex(DARK_TEXT).unwrap_or([0; 3]));
    if contrast(bg, light) >= contrast(bg, dark) {
        LIGHT_TEXT
    } else {
        DARK_TEXT
    }
}


/// Card ranks from the highest, the order of the 13 x 13 grid.
pub const RANKS: [char; 13] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
/// Distinct two-card hand classes.
pub const HAND_CLASS_COUNT: usize = 169;
/// Every two-card combination of a deck.
pub const TOTAL_COMBOS: u32 = 1326;

/// The 169 hand classes in grid order: pairs on the diagonal, suited above it, offsuit below.
pub fn hand_classes() -> Vec<String> {
    let mut out = Vec::with_capacity(HAND_CLASS_COUNT);
    for (i, a) in RANKS.iter().enumerate() {
        for (j, b) in RANKS.iter().enumerate() {
            out.push(match i.cmp(&j) {
                std::cmp::Ordering::Equal => format!("{a}{b}"),
                std::cmp::Ordering::Less => format!("{a}{b}s"),
                std::cmp::Ordering::Greater => format!("{b}{a}o"),
            });
        }
    }
    out
}

/// Whether `hand` is one of the 169 classes.
pub fn is_hand_class(hand: &str) -> bool {
    let chars: Vec<char> = hand.chars().collect();
    let rank = |c: &char| RANKS.iter().position(|r| r == c);
    match chars.as_slice() {
        [a, b] => a == b && rank(a).is_some(),
        [a, b, kind @ ('s' | 'o')] => matches!((rank(a), rank(b)), (Some(i), Some(j)) if i < j) && matches!(kind, 's' | 'o'),
        _ => false,
    }
}

/// Number of card combinations of a hand class: 6 for a pair, 4 suited, 12 offsuit.
pub fn combos(hand: &str) -> u32 {
    match hand.len() {
        2 => 6,
        _ if hand.ends_with('s') => 4,
        _ => 12,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seq(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn cand(id: i64, opponent: &str, stack: f64) -> Candidate {
        Candidate { scenario_id: id, spot_id: id, format: "3max".into(), line: "btn:fold,sb:call".into(), opponent: opponent.into(), stack_bb: stack }
    }

    #[test]
    fn canonical_line_stops_at_the_hero() {
        assert_eq!(canonical_line(&seq(&["BTN:fold", "SB:call", "BB:check"]), "BB"), "btn:fold,sb:call");
        assert_eq!(canonical_line(&seq(&["BTN:raise", "SB:fold"]), "BTN"), "");
        assert_eq!(canonical_line(&seq(&["SB:call", "BB:check"]), "BB"), "sb:call", "heads-up line");
        assert_eq!(canonical_line(&seq(&["SB:raise", "BB:fold"]), "SB"), "");
    }

    #[test]
    fn a_stack_between_depths_follows_the_rule() {
        let c = [cand(1, "any", 15.0), cand(2, "any", 10.0)];
        let pick = |stack, rule| pick_scenario(&c, "3max", "btn:fold,sb:call", false, stack, rule).map(|c| c.stack_bb);
        assert_eq!(pick(12.0, DepthRule::Below), Some(10.0));
        assert_eq!(pick(12.0, DepthRule::Nearest), Some(10.0));
        assert_eq!(pick(13.0, DepthRule::Nearest), Some(15.0));
        assert_eq!(pick(12.5, DepthRule::Nearest), Some(10.0), "a tie takes the smaller depth");
        assert_eq!(pick(8.0, DepthRule::Below), Some(10.0), "below every depth takes the smallest");
        assert_eq!(pick(30.0, DepthRule::Below), Some(15.0));
    }

    #[test]
    fn the_reg_variant_is_used_only_against_a_reg() {
        let c = [cand(1, "any", 10.0), cand(2, "reg", 10.0)];
        let id = |reg| pick_scenario(&c, "3max", "btn:fold,sb:call", reg, 10.0, DepthRule::Nearest).map(|c| c.scenario_id);
        assert_eq!(id(true), Some(2));
        assert_eq!(id(false), Some(1));
        let only_reg = [cand(2, "reg", 10.0)];
        assert_eq!(pick_scenario(&only_reg, "3max", "btn:fold,sb:call", false, 10.0, DepthRule::Nearest), None);
        let only_any = [cand(1, "any", 10.0)];
        assert_eq!(pick_scenario(&only_any, "3max", "btn:fold,sb:call", true, 10.0, DepthRule::Nearest).map(|c| c.scenario_id), Some(1), "falls back to any");
        assert_eq!(pick_scenario(&c, "hu", "btn:fold,sb:call", false, 10.0, DepthRule::Nearest), None);
    }

    #[test]
    fn default_names_read_like_the_table() {
        assert_eq!(default_name("3max", "BB", "btn:fold,sb:call", "reg"), "BB vs SB limp · Reg");
        assert_eq!(default_name("3max", "BTN", "", "any"), "BTN first in");
        assert_eq!(default_name("hu", "BB", "sb:raise", "any"), "BB (HU) vs SB open");
        assert_eq!(default_name("3max", "BB", "btn:raise,sb:all-in", "any"), "BB vs BTN open, SB shove");
        assert_eq!(default_name("3max", "BB", "btn:fold,sb:fold", "any"), "BB vs folds");
    }

    #[test]
    fn the_grid_holds_169_classes_and_1326_combos() {
        let classes = hand_classes();
        assert_eq!(classes.len(), HAND_CLASS_COUNT);
        assert_eq!(classes.iter().map(|h| combos(h)).sum::<u32>(), TOTAL_COMBOS);
        assert_eq!((classes[0].as_str(), classes[1].as_str(), classes[13].as_str()), ("AA", "AKs", "AKo"));
        assert!(classes.iter().all(|h| is_hand_class(h)));
        assert!(!is_hand_class("KAs") && !is_hand_class("AAs") && !is_hand_class("AK") && !is_hand_class("A1o"));
    }

    #[test]
    fn text_is_readable_on_every_proposed_shade() {
        let shades = [
            "#2a2f39", "#3b4352", "#6b7080", "#4caf50", "#34c27a", "#7fd18f", "#5b8def", "#7aa7ff", "#6b7aa1", "#a07cf0", "#5d4a8c", "#e0a23f",
            "#8a6a33", "#f97316", "#ff6b5b", "#e0c341",
        ];
        for shade in shades {
            let bg = parse_hex(shade).unwrap();
            let fg = parse_hex(text_color(shade)).unwrap();
            assert!(contrast(bg, fg) >= 4.5, "{shade} has contrast {}", contrast(bg, fg));
        }
    }
}
