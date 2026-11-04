//! Output of the hand-history parsers.
//!
//! JSON uses camelCase property names, like the former backend's API. `ActionType` is
//! serialized as a number, as System.Text.Json did by default.

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum ActionType {
    DealBoard = 0,
    Post = 1,
    Fold = 2,
    Check = 3,
    Bet = 4,
    Call = 5,
    Raise = 6,
    AllIn = 7,
    Runout = 8,
    Win = 9,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StreetAction {
    pub street: String,
    pub order: i32,
    pub player: String,
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub post_type: Option<String>,
    pub amount: Option<f64>,
    pub effective: Option<f64>,
    pub is_all_in: bool,
    pub cards: Option<Vec<String>>,
    pub runout_number: Option<i32>,
}

impl Default for StreetAction {
    fn default() -> Self {
        Self {
            street: String::new(),
            order: 0,
            player: String::new(),
            action_type: ActionType::Fold,
            post_type: None,
            amount: None,
            effective: None,
            is_all_in: false,
            cards: None,
            runout_number: None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BlindsInfo {
    pub sb: f64,
    pub bb: f64,
    pub ante: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SidePot {
    pub amount: f64,
    pub eligible_players: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PotInfo {
    pub main_pot: f64,
    pub side_pots: Option<Vec<SidePot>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WinnerInfo {
    pub player: String,
    pub amount: f64,
    pub hand: Option<String>,
    pub cards: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BoardInfo {
    pub flop: Option<Vec<String>>,
    pub turn: Option<String>,
    pub river: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandSummary {
    pub total_pot: f64,
    pub rake: f64,
    pub winners: Vec<WinnerInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandInfo {
    pub hand_id: Option<String>,
    pub room: Option<String>,
    pub table: Option<String>,
    pub table_size: i32,
    pub button_seat: Option<i32>,
    pub date: Option<String>,
    pub limit: Option<String>,
    pub game: Option<String>,
    pub blinds: Option<BlindsInfo>,
    pub currency: Option<String>,
    pub game_type: Option<String>,
    pub tournament_id: Option<String>,
    pub tournament_name: Option<String>,
    pub tournament_level: Option<i32>,
    pub buy_in: Option<f64>,
    pub buyin_currency: Option<String>,
    pub multiplier: Option<i32>,
    pub prize_pool: Option<f64>,
    pub position: Option<i32>,
    pub ante: Option<f64>,
    pub players_remaining: Option<i32>,
    pub total_players: Option<i32>,
    pub rake_per_player: Option<f64>,
}

impl Default for HandInfo {
    fn default() -> Self {
        Self {
            hand_id: None,
            room: None,
            table: None,
            table_size: 6,
            button_seat: None,
            date: None,
            limit: None,
            game: None,
            blinds: None,
            currency: None,
            game_type: None,
            tournament_id: None,
            tournament_name: None,
            tournament_level: None,
            buy_in: None,
            buyin_currency: None,
            multiplier: None,
            prize_pool: None,
            position: None,
            ante: None,
            players_remaining: None,
            total_players: None,
            rake_per_player: None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerHandInfo {
    pub seat: i32,
    pub name: String,
    pub stack: f64,
    pub is_hero: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandActions {
    pub info: Option<HandInfo>,
    pub players: Vec<PlayerHandInfo>,
    pub actions: Vec<StreetAction>,
    pub board: Option<BoardInfo>,
    pub pots: Option<PotInfo>,
    pub summary: Option<HandSummary>,
    pub runouts: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerInfo {
    pub name: String,
    pub stack: f64,
    pub investment: f64,
    pub chips_won: f64,
    pub net_profit: f64,
    pub ev_chips: Option<f64>,
    pub cards: String,
    pub is_hero: bool,
    pub folded: bool,
    pub is_all_in: bool,
    pub position: String,
    pub went_to_showdown: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ParsedHand {
    pub id: Option<String>,
    pub game_id: Option<String>,
    pub hand_id: Option<String>,
    pub room: Option<String>,
    pub game_mode: Option<String>,
    pub game_type: Option<String>,
    pub game_name: Option<String>,
    pub prize_pool: f64,
    pub multiplier: i32,
    pub buy_in: f64,
    pub date_time: Option<String>,
    pub table_id: Option<String>,
    pub blinds: Option<String>,
    pub total_pot: f64,
    pub rake: f64,
    pub preflop_action: String,
    pub flop: Option<String>,
    pub flop_action: String,
    pub turn: Option<String>,
    pub turn_action: String,
    pub river: Option<String>,
    pub river_action: String,
    pub showdown: String,
    pub result: String,
    pub all_in_street: Option<String>,
    pub player_count: i32,
    pub position: i32,
    pub went_to_showdown: bool,
    pub players: Vec<PlayerInfo>,

    pub limit_type: Option<String>,
    pub game_variant: Option<String>,
    pub currency: Option<String>,
    pub button_seat: Option<i32>,
    pub ante: Option<f64>,
    pub tournament_id: Option<String>,
    pub tournament_name: Option<String>,
    pub tournament_level: Option<i32>,
    pub buyin_currency: Option<String>,
    pub rake_per_player: Option<f64>,

    pub structured_blinds: Option<BlindsInfo>,
    pub structured_actions: Option<HandActions>,
}

impl Default for ParsedHand {
    fn default() -> Self {
        Self {
            id: None,
            game_id: None,
            hand_id: None,
            room: None,
            game_mode: None,
            game_type: None,
            game_name: None,
            prize_pool: 0.0,
            multiplier: 1,
            buy_in: 0.0,
            date_time: None,
            table_id: None,
            blinds: None,
            total_pot: 0.0,
            rake: 0.0,
            preflop_action: String::new(),
            flop: None,
            flop_action: String::new(),
            turn: None,
            turn_action: String::new(),
            river: None,
            river_action: String::new(),
            showdown: String::new(),
            result: String::new(),
            all_in_street: None,
            player_count: 2,
            position: 0,
            went_to_showdown: false,
            players: Vec::new(),
            limit_type: None,
            game_variant: None,
            currency: None,
            button_seat: None,
            ante: None,
            tournament_id: None,
            tournament_name: None,
            tournament_level: None,
            buyin_currency: None,
            rake_per_player: None,
            structured_blinds: None,
            structured_actions: None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ParseResult {
    pub success: bool,
    pub hands: Vec<ParsedHand>,
    pub count: usize,
    pub error: Option<String>,
}

impl ParseResult {
    pub fn ok(hands: Vec<ParsedHand>) -> Self {
        let count = hands.len();
        Self { success: true, hands, count, error: None }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_uses_camel_case_and_numeric_action_types() {
        let hand = ParsedHand {
            game_id: Some("g1".into()),
            structured_actions: Some(HandActions {
                actions: vec![StreetAction { action_type: ActionType::Raise, is_all_in: true, ..StreetAction::default() }],
                ..HandActions::default()
            }),
            ..ParsedHand::default()
        };
        let json = serde_json::to_value(&hand).unwrap();
        assert_eq!(json["gameId"], "g1");
        assert_eq!(json["multiplier"], 1);
        assert_eq!(json["playerCount"], 2);
        let action = &json["structuredActions"]["actions"][0];
        assert_eq!(action["type"], 6);
        assert_eq!(action["isAllIn"], true);
    }

    #[test]
    fn partial_json_fills_defaults() {
        let hand: ParsedHand = serde_json::from_str(r#"{"handId":"h","players":[{"name":"p","isHero":true}]}"#).unwrap();
        assert_eq!(hand.hand_id.as_deref(), Some("h"));
        assert_eq!((hand.multiplier, hand.player_count), (1, 2));
        assert!(hand.players[0].is_hero);
    }
}
