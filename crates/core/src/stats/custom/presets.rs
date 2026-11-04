//! Example definitions shipped with the app. The editor offers them as starting points, so a user
//! sees what a custom stat looks like and can change it. They are plain definitions: nothing here
//! is computed until the user saves a copy.

use serde_json::{json, Value};

use super::model::{parse_definition, CustomStatDef};

/// `(id, definition)`; the id is the key of the translated name in the UI.
fn raw() -> Vec<(&'static str, Value)> {
    let flag = |name: &str| json!({ "type": "flag", "name": name });
    let range = |min: Option<f64>, max: Option<f64>| json!({ "min": min, "max": max });
    let def = |name: &str, numerator: Value, denominator: Value, filters: Value| {
        json!({ "schema": 1, "name": name, "numerator": numerator, "denominator": denominator, "filters": filters })
    };
    vec![
        ("btn_open", def("BTN open", flag("Rfi"), flag("RfiOpp"), json!({ "positions": ["BTN"] }))),
        ("big_open", def("Open 3 bb or more", json!({ "type": "raiseSizeBb", "range": range(Some(3.0), None) }), flag("RfiOpp"), json!({}))),
        (
            "short_stack_3bet",
            def("3-bet with 10 bb or less", flag("ThreeBet"), flag("ThreeBetOpp"), json!({ "stackBb": range(None, Some(10.0)) })),
        ),
        (
            "bb_defend",
            def(
                "BB defends vs a raise",
                json!({ "type": "or", "items": [
                    { "type": "action", "street": "preflop", "action": "call" },
                    { "type": "action", "street": "preflop", "action": "raise" },
                ] }),
                json!({ "type": "facingAggression", "street": "preflop" }),
                json!({ "positions": ["BB"] }),
            ),
        ),
        (
            "iso_two_limpers",
            def(
                "Isolate against 2+ limpers",
                json!({ "type": "action", "street": "preflop", "action": "raise" }),
                json!({ "type": "and", "items": [flag("FacingLimpOpp"), { "type": "limpersBefore", "range": range(Some(2.0), None) }] }),
                json!({}),
            ),
        ),
        (
            "small_cbet",
            def(
                "Small flop c-bet (50% pot or less)",
                json!({ "type": "betSizePercentPot", "street": "flop", "range": range(None, Some(50.0)) }),
                flag("CbetOppFlop"),
                json!({}),
            ),
        ),
        ("btn_fold_to_cbet", def("Fold to flop c-bet on the button", flag("FoldToCbetFlop"), flag("FoldToCbetOppFlop"), json!({ "positions": ["BTN"] }))),
        (
            "preflop_all_in",
            def("Preflop all-in raise", json!({ "type": "action", "street": "preflop", "action": "raise", "allIn": true }), Value::Null, json!({})),
        ),
        ("showdown_after_flop", def("Showdown after seeing the flop", flag("Wtsd"), flag("SawFlop"), json!({}))),
    ]
}

/// The examples as validated definitions.
pub fn presets() -> Vec<(&'static str, CustomStatDef)> {
    raw()
        .into_iter()
        .filter_map(|(id, value)| match parse_definition(&value) {
            Ok(def) => Some((id, def)),
            Err(e) => {
                log::error!("[custom stats] preset {id} is invalid: {e}");
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_preset_is_a_valid_definition_with_a_unique_id() {
        let all = raw();
        assert_eq!(presets().len(), all.len(), "a preset failed validation");
        let ids: HashSet<_> = all.iter().map(|(id, _)| *id).collect();
        assert_eq!(ids.len(), all.len());
    }
}
