// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

/// Fetch a subreddit JSON feed by spawning bun with the user's exact browser
/// headers (extracted from a "Copy as fetch" paste).  We pass the headers as
/// a JSON env-var — bun spreads them directly into fetch(), so the request is
/// indistinguishable from a real browser navigation.
#[tauri::command]
async fn fetch_media(url: String, headers_json: String) -> Result<String, String> {
    let script = r#"
const headers = JSON.parse(process.env.MEDIA_HEADERS);
const r = await fetch(process.env.MEDIA_URL, { headers });
if (!r.ok) {
  process.stderr.write("HTTP " + r.status + "\n");
  process.exit(1);
}
const buf = await r.arrayBuffer();
process.stdout.write(Buffer.from(buf).toString('base64'));
"#;

    let output = tokio::process::Command::new("bun")
        .arg("-e")
        .arg(script)
        .env("MEDIA_URL", &url)
        .env("MEDIA_HEADERS", &headers_json)
        .env("NO_COLOR", "1")
        .output()
        .await
        .map_err(|e| format!("Failed to spawn bun: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(err.trim().to_string());
    }

    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_reddit(subreddit: String, headers_json: String) -> Result<String, String> {
    let url = format!(
        "https://www.reddit.com/r/{}.json?limit=25&raw_json=1",
        subreddit
    );

    // The script receives the full headers object from the env so it uses the
    // user's exact browser fingerprint — no hardcoded headers needed.
    let script = r#"
const headers = JSON.parse(process.env.REDDIT_HEADERS);
const r = await fetch(process.env.REDDIT_URL, { headers });
if (!r.ok) {
  const body = await r.text();
  process.stderr.write("HTTP " + r.status + "\n" + body.slice(0, 800) + "\n");
  process.exit(1);
}
process.stdout.write(await r.text());
"#;

    let output = tokio::process::Command::new("bun")
        .arg("-e")
        .arg(script)
        .env("REDDIT_URL", &url)
        .env("REDDIT_HEADERS", &headers_json)
        .env("NO_COLOR", "1")
        .output()
        .await
        .map_err(|e| format!("Failed to spawn bun: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        eprintln!("[fetch_reddit] {} bun error: {}", subreddit, err);
        return Err(err.trim().to_string());
    }

    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_reddit, fetch_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
