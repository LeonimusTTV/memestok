use base64::Engine as _;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::str::FromStr;

/// Build a reqwest HeaderMap from a JSON object of header key/value strings.
/// Invalid header names or values are silently skipped.
fn build_header_map(headers_json: &str) -> Result<HeaderMap, String> {
    let headers: std::collections::HashMap<String, String> =
        serde_json::from_str(headers_json).map_err(|e| format!("Failed to parse headers: {}", e))?;

    let mut header_map = HeaderMap::new();
    for (key, value) in &headers {
        let Ok(name) = HeaderName::from_str(key) else {
            continue;
        };
        let Ok(val) = HeaderValue::from_str(value) else {
            continue;
        };
        header_map.insert(name, val);
    }
    Ok(header_map)
}

/// Fetch a media URL with the user's exact browser headers.
/// Returns the response body as a base64-encoded string.
#[tauri::command]
async fn fetch_media(url: String, headers_json: String) -> Result<String, String> {
    let header_map = build_header_map(&headers_json)?;

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .headers(header_map)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Fetch a subreddit JSON feed with the user's exact browser headers.
#[tauri::command]
async fn fetch_reddit(
    subreddit: String,
    headers_json: String,
    after: String,
) -> Result<String, String> {
    let mut url = format!(
        "https://www.reddit.com/r/{}.json?limit=25&raw_json=1",
        subreddit
    );
    if !after.is_empty() {
        url.push_str(&format!("&after={}", after));
    }

    let header_map = build_header_map(&headers_json)?;

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .headers(header_map)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let preview: String = body.chars().take(800).collect();
        eprintln!("[fetch_reddit] {} HTTP {}: {}", subreddit, status, preview);
        return Err(format!("HTTP {}", status.as_u16()));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_reddit, fetch_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
