//! Requests from the UI to the in-process backend.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::backend::BackendState;

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
