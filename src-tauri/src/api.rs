//! Requests from the UI to the in-process backend.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::backend::BackendState;
use crate::hud;

/// Runs a request and always returns JSON, like the former HTTP bridge: failures become
/// `{ "success": false, "error": ... }`.
pub async fn call(app: &AppHandle, method: &str, endpoint: &str, body: Option<Value>) -> Value {
    // Only absolute backend paths are accepted.
    if !endpoint.starts_with('/') {
        return json!({ "success": false, "error": "Invalid endpoint" });
    }
    let method = method.to_ascii_uppercase();
    if !matches!(method.as_str(), "GET" | "POST" | "PUT" | "DELETE") {
        return json!({ "success": false, "error": "Unsupported method" });
    }

    // Equity is not computed while a poker table is open.
    if hud::table_mode() && is_equity_route(endpoint) {
        return json!({ "success": false, "error": "Equity is unavailable while a poker table is open." });
    }

    let state = app.state::<BackendState>();
    let Some(backend) = state.ready() else {
        let reason = state.failure().unwrap_or_else(|| "The backend is starting".into());
        return json!({ "success": false, "error": reason });
    };

    let endpoint = endpoint.to_string();
    // Queries and imports are CPU and disk work: keep them off the async runtime.
    tauri::async_runtime::spawn_blocking(move || backend.handle(&method, &endpoint, body).body)
        .await
        .unwrap_or_else(|err| {
            log::error!("API call failed: {err}");
            json!({ "success": false, "error": err.to_string() })
        })
}

/// The routes that compute equity.
fn is_equity_route(endpoint: &str) -> bool {
    let path = endpoint.split('?').next().unwrap_or_default().trim_matches('/');
    path == "equity" || path.starts_with("equity/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_equity_routes_are_equity_routes() {
        assert!(is_equity_route("/equity"));
        assert!(is_equity_route("/equity/batch"));
        assert!(is_equity_route("/equity?x=1"));
        assert!(!is_equity_route("/db/hands"));
        assert!(!is_equity_route("/analysis/stats"));
        assert!(!is_equity_route("/hud/players"));
    }
}
