//! Progress reported while a hand-history file is imported.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ImportProgress {
    pub message: String,
    pub percent: i32,
    pub hands_imported: usize,
    pub hands_skipped: usize,
    pub total_hands: usize,
    pub success: bool,
    pub error: Option<String>,
}
