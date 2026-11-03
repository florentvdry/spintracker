//! Thin HTTP client for the local C# backend.

use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{json, Value};

use crate::backend::BACKEND_PORT;

// Imports can run for a long time; keep the historical 24h ceiling.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(86_400);

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("failed to build HTTP client")
    })
}

pub fn url(endpoint: &str) -> String {
    format!("http://127.0.0.1:{BACKEND_PORT}{endpoint}")
}

/// Calls the backend and always returns JSON; transport failures become
/// `{ "success": false, "error": ... }` like the former Electron bridge.
pub async fn call(method: &str, endpoint: &str, body: Option<Value>) -> Value {
    // Reject anything that is not an absolute path so a crafted endpoint can
    // never redirect the request to another host.
    if !endpoint.starts_with('/') {
        return json!({ "success": false, "error": "Invalid endpoint" });
    }

    let http_method = match method.to_ascii_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return json!({ "success": false, "error": "Unsupported method" }),
    };

    let mut request = client().request(http_method.clone(), url(endpoint));
    if http_method == reqwest::Method::POST || http_method == reqwest::Method::PUT {
        request = request.json(&body.unwrap_or_else(|| json!({})));
    }

    let result = async { request.send().await?.json::<Value>().await }.await;
    result.unwrap_or_else(|err| {
        log::error!("API call failed ({endpoint}): {err}");
        json!({ "success": false, "error": err.to_string() })
    })
}
