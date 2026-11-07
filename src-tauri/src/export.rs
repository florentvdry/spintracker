//! Hand history export: the hands matching a filter, zipped into one text file per day, month
//! or a single file.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::Write;

use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;

use crate::api;

// Large enough to fetch every stored hand in one request.
const EXPORT_HAND_LIMIT: u64 = 1_000_000;

/// "2026-05-25 14:30:00" -> "2026-5-25" (unpadded, like the Betclic exports).
fn day_key(date_time: &str) -> Option<String> {
    let mut parts = date_time.get(..10)?.split('-');
    let year: u32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    Some(format!("{year}-{month}-{day}"))
}

// Buy-ins are stored as floats; two amounts closer than this are the same stake.
const BUY_IN_EPSILON: f64 = 1e-6;
// Name of the archive entry holding every hand when the export is not split.
const SINGLE_FILE_KEY: &str = "all";

#[derive(Debug, Default, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Grouping {
    #[default]
    Day,
    Month,
    Single,
}

/// What the export dialog selected. A `None` list means "no restriction", so hands without a
/// known room or buy-in are still exported when the user left that filter untouched.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ExportFilter {
    /// Inclusive, `YYYY-MM-DD`.
    pub date_from: Option<String>,
    /// Inclusive, `YYYY-MM-DD`.
    pub date_to: Option<String>,
    pub rooms: Option<Vec<String>>,
    pub buy_ins: Option<Vec<f64>>,
    pub grouping: Grouping,
}

impl ExportFilter {
    /// The filter comes from the webview: reject anything that is not a plain calendar date.
    fn validate(&self) -> Result<(), String> {
        for date in [&self.date_from, &self.date_to].into_iter().flatten() {
            NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| format!("Invalid date: {date}"))?;
        }
        Ok(())
    }

    fn matches(&self, hand: &Value) -> bool {
        // `date_time` starts with the ISO date, so a string comparison orders days correctly.
        let day = hand["date_time"].as_str().and_then(|d| d.get(..10));
        if let Some(from) = &self.date_from {
            if day.is_none_or(|d| d < from.as_str()) {
                return false;
            }
        }
        if let Some(to) = &self.date_to {
            if day.is_none_or(|d| d > to.as_str()) {
                return false;
            }
        }
        if let Some(rooms) = &self.rooms {
            let room = hand["room"].as_str().map(str::trim);
            if !room.is_some_and(|r| rooms.iter().any(|wanted| wanted.trim().eq_ignore_ascii_case(r))) {
                return false;
            }
        }
        if let Some(buy_ins) = &self.buy_ins {
            let buy_in = hand["buy_in"].as_f64();
            if !buy_in.is_some_and(|b| buy_ins.iter().any(|wanted| (wanted - b).abs() < BUY_IN_EPSILON)) {
                return false;
            }
        }
        true
    }

    /// Archive entry a hand of that day (`day_key` format) belongs to.
    fn file_key(&self, day: &str) -> String {
        match self.grouping {
            Grouping::Day => day.to_string(),
            Grouping::Month => day.rsplit_once('-').map_or(day, |(month, _)| month).to_string(),
            Grouping::Single => SINGLE_FILE_KEY.to_string(),
        }
    }
}

pub async fn run(app: AppHandle, dialog_title: String, filter: ExportFilter) -> Value {
    if let Err(message) = filter.validate() {
        return json!({ "success": false, "message": message });
    }
    let hands_result = api::call(&app, "POST", "/db/hands", Some(json!({ "limit": EXPORT_HAND_LIMIT }))).await;
    if !hands_result["success"].as_bool().unwrap_or(false) {
        return json!({ "success": false, "message": "Failed to fetch hands" });
    }

    let hands = hands_result["data"]["hands"].as_array().cloned().unwrap_or_default();
    if hands.is_empty() {
        return json!({ "success": false, "message": "No hands to export" });
    }

    // Betclic files separate their hands with a line of dashes, which an import needs to find them.
    const BETCLIC_SEPARATOR: &str = "\n------------\n";
    let mut hands_by_day: BTreeMap<String, Vec<(bool, String)>> = BTreeMap::new();
    for hand in hands.iter().filter(|hand| filter.matches(hand)) {
        // Hands without raw content cannot be exported.
        let Some(raw) = hand["result"].as_str().filter(|r| !r.is_empty()) else { continue };
        let Some(key) = hand["date_time"].as_str().and_then(day_key).map(|day| filter.file_key(&day)) else { continue };
        let betclic = hand["room"].as_str().is_some_and(|room| room.trim().eq_ignore_ascii_case("betclic"));
        hands_by_day.entry(key).or_default().push((betclic, raw.to_string()));
    }

    if hands_by_day.is_empty() {
        return json!({ "success": false, "message": "No hands to export" });
    }

    let default_name = format!("SpinTracker_Export_{}.zip", chrono::Local::now().format("%Y-%m-%d"));
    let picker_app = app.clone();
    let target = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .set_title(dialog_title)
            .set_file_name(default_name)
            .add_filter("Zip Files", &["zip"])
            .blocking_save_file()
    })
    .await
    .ok()
    .flatten()
    .and_then(|p| p.into_path().ok());

    let Some(target) = target else {
        return json!({ "success": false, "message": "Export cancelled" });
    };

    let write_zip = || -> Result<(), String> {
        let file = File::create(&target).map_err(|e| e.to_string())?;
        let mut writer = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (day, contents) in &hands_by_day {
            writer
                .start_file(format!("ExportHH_{day}.txt"), options)
                .map_err(|e| e.to_string())?;
            let mut text = String::new();
            for (n, (betclic, raw)) in contents.iter().enumerate() {
                if n > 0 {
                    text.push_str(if *betclic { BETCLIC_SEPARATOR } else { "\n\n" });
                }
                text.push_str(raw);
            }
            writer.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        writer.finish().map_err(|e| e.to_string())?;
        Ok(())
    };

    match write_zip() {
        Ok(()) => json!({ "success": true, "fileCount": hands_by_day.len() }),
        Err(err) => {
            log::error!("Export error: {err}");
            json!({ "success": false, "message": err })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hand(room: &str, buy_in: f64, date_time: &str) -> Value {
        json!({ "room": room, "buy_in": buy_in, "date_time": date_time })
    }

    fn filter(json: Value) -> ExportFilter {
        serde_json::from_value(json).expect("valid filter")
    }

    #[test]
    fn an_empty_filter_keeps_every_hand_even_without_room_or_buy_in() {
        let f = ExportFilter::default();
        assert!(f.matches(&hand("Winamax", 5.0, "2026-05-25 14:30:00")));
        assert!(f.matches(&json!({ "date_time": "2026-05-25 14:30:00" })));
    }

    #[test]
    fn the_date_range_is_inclusive_on_both_days() {
        let f = filter(json!({ "dateFrom": "2026-05-01", "dateTo": "2026-05-31" }));
        assert!(f.matches(&hand("Winamax", 5.0, "2026-05-01 00:00:00")));
        assert!(f.matches(&hand("Winamax", 5.0, "2026-05-31 23:59:59")));
        assert!(!f.matches(&hand("Winamax", 5.0, "2026-04-30 23:59:59")));
        assert!(!f.matches(&hand("Winamax", 5.0, "2026-06-01 00:00:00")));
    }

    #[test]
    fn rooms_match_regardless_of_case_and_padding() {
        let f = filter(json!({ "rooms": ["winamax"] }));
        assert!(f.matches(&hand(" Winamax ", 5.0, "2026-05-25 14:30:00")));
        assert!(!f.matches(&hand("Unibet", 5.0, "2026-05-25 14:30:00")));
    }

    #[test]
    fn buy_ins_exclude_other_stakes_and_hands_without_one() {
        let f = filter(json!({ "buyIns": [2.0, 5.0] }));
        assert!(f.matches(&hand("Winamax", 5.0, "2026-05-25 14:30:00")));
        assert!(!f.matches(&hand("Winamax", 10.0, "2026-05-25 14:30:00")));
        assert!(!f.matches(&json!({ "room": "Winamax", "date_time": "2026-05-25 14:30:00" })));
    }

    #[test]
    fn grouping_decides_the_archive_entry() {
        let day = "2026-5-25";
        assert_eq!(filter(json!({ "grouping": "day" })).file_key(day), "2026-5-25");
        assert_eq!(filter(json!({ "grouping": "month" })).file_key(day), "2026-5");
        assert_eq!(filter(json!({ "grouping": "single" })).file_key(day), SINGLE_FILE_KEY);
        assert_eq!(ExportFilter::default().file_key(day), "2026-5-25");
    }

    #[test]
    fn validation_rejects_dates_that_are_not_calendar_days() {
        assert!(filter(json!({ "dateFrom": "2026-02-30" })).validate().is_err());
        assert!(filter(json!({ "dateTo": "../etc" })).validate().is_err());
        assert!(filter(json!({ "dateFrom": "2026-01-01", "dateTo": "2026-12-31" })).validate().is_ok());
    }
}
