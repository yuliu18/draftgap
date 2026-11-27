//! Read-only Riot API access using a separate OS credential-store entry.
use std::{future::Future, time::Duration};

use reqwest::{header, Client, StatusCode};
use serde_json::Value;
use url::Url;

enum Route<'a> {
    Account(&'a str, &'a str),
    Ids(&'a str, u32, u32),
    Match(&'a str),
}

const KEY_SERVICE: &str = "com.draftgap.personal";
const KEY_ACCOUNT: &str = "riot-api-key";
const KEY_READ_FAILED: &str = "Could not read the system credential store";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_BODY: usize = 5 * 1024 * 1024;
const BODY_TOO_LARGE: &str = "Riot API response exceeds 5 MB";

fn valid_identity(value: &str) -> bool {
    !value.trim().is_empty()
        && value.chars().count() <= 100
        && !matches!(value, "." | "..")
        && !value.chars().any(|c| c.is_control() || matches!(c, '/' | '\\' | '%'))
}

fn valid_puuid(value: &str) -> bool {
    (1..=100).contains(&value.len())
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
}

fn valid_match_id(value: &str) -> bool {
    value.split_once('_').is_some_and(|(platform, number)| {
        (2..=6).contains(&platform.len())
            && platform.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
            && (1..=20).contains(&number.len())
            && number.bytes().all(|b| b.is_ascii_digit())
    })
}

fn endpoint(region: &str, route: Route<'_>) -> Result<Url, String> {
    if !matches!(region, "americas" | "europe" | "asia" | "sea") {
        return Err("Invalid Riot routing region".to_owned());
    }
    let mut url = Url::parse(&format!("https://{region}.api.riotgames.com"))
        .map_err(|_| "Could not build the Riot API URL".to_owned())?;
    let mut path = url.path_segments_mut()
        .map_err(|_| "Could not build the Riot API URL".to_owned())?;
    match route {
        Route::Account(name, tag) => {
            if !valid_identity(name) || !valid_identity(tag) {
                return Err("Invalid Riot ID".to_owned());
            }
            path.extend(["riot", "account", "v1", "accounts", "by-riot-id", name, tag]);
        }
        Route::Ids(puuid, start, count) => {
            if !valid_puuid(puuid) {
                return Err("Invalid Riot PUUID".to_owned());
            }
            if start > 5000 || !(1..=100).contains(&count) {
                return Err("Invalid Riot match page bounds".to_owned());
            }
            path.extend(["lol", "match", "v5", "matches", "by-puuid", puuid, "ids"]);
            drop(path);
            url.query_pairs_mut().append_pair("start", &start.to_string())
                .append_pair("count", &count.to_string());
            return Ok(url);
        }
        Route::Match(id) => {
            if !valid_match_id(id) {
                return Err("Invalid Riot match ID".to_owned());
            }
            path.extend(["lol", "match", "v5", "matches", id]);
        }
    }
    drop(path);
    Ok(url)
}

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_ACCOUNT)
        .map_err(|_| "Could not open the system credential store".to_owned())
}

fn secret_from(result: Result<String, keyring::Error>) -> Result<Option<String>, String> {
    match result {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(KEY_READ_FAILED.to_owned()),
    }
}

fn read_key() -> Result<Option<String>, String> {
    let entry = key_entry().map_err(|_| KEY_READ_FAILED.to_owned())?;
    secret_from(entry.get_password())
}

#[tauri::command]
pub fn riot_set_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() || header::HeaderValue::from_str(key).is_err() {
        return Err("Invalid Riot API key format".to_owned());
    }
    key_entry()?.set_password(key)
        .map_err(|_| "Could not store the Riot API key in the system credential store".to_owned())
}

#[tauri::command]
pub fn riot_has_api_key() -> Result<bool, String> {
    read_key().map(|key| key.is_some())
}

#[tauri::command]
pub fn riot_delete_api_key() -> Result<(), String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the Riot API key from the system credential store".to_owned()),
    }
}

fn redact(message: &str, key: &str) -> String {
    if key.is_empty() { message.to_owned() } else { message.replace(key, "[redacted]") }
}

fn contains_key(data: &Value, key: &str) -> bool {
    match data {
        Value::String(s) => s.contains(key),
        Value::Array(items) => items.iter().any(|v| contains_key(v, key)),
        Value::Object(fields) => fields.iter().any(|(name, value)| {
            name.contains(key) || contains_key(value, key)
        }),
        _ => false,
    }
}

type WireResponse = (StatusCode, Option<u64>, Vec<u8>);

async fn execute<F: Future<Output = Result<WireResponse, String>>>(
    url: Url,
    key: &str,
    send: impl FnOnce(Url, &str) -> F,
) -> Result<Value, String> {
    use serde_json::json;

    let (status, retry_after, body) = send(url, key).await.map_err(|e| redact(&e, key))?;
    let result = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err("Riot API key invalid or expired".to_owned()),
        StatusCode::NOT_FOUND => Err("Riot API resource not found".to_owned()),
        StatusCode::TOO_MANY_REQUESTS => Ok(json!({ "kind": "rateLimited", "retryAfter": retry_after.unwrap_or(120) })),
        _ if !status.is_success() => Err(format!("Riot API returned HTTP {}", status.as_u16())),
        _ if body.len() > MAX_BODY => Err(BODY_TOO_LARGE.to_owned()),
        _ => match serde_json::from_slice(&body) {
            Ok(data) if !contains_key(&data, key) => Ok(json!({ "kind": "ok", "data": data })),
            Ok(_) => Err("Unexpected Riot API response".to_owned()),
            Err(_) => Err("Riot API did not return valid JSON".to_owned()),
        },
    };
    result.map_err(|e| redact(&e, key))
}

async fn send(url: Url, token: header::HeaderValue) -> Result<WireResponse, String> {
    // Do not use the LCU client: it accepts invalid certificates.
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .no_proxy()
        .retry(reqwest::retry::never())
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not build the Riot HTTP client".to_owned())?;
    let mut response = client.get(url).header("X-Riot-Token", token).send().await
        .map_err(|_| "Could not reach the Riot API".to_owned())?;
    let status = response.status();
    let retry_after = response.headers().get(header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok());
    let mut body = Vec::new();
    // Error responses are mapped from status/headers only; don't read their bodies.
    if status.is_success() {
        if response.content_length().is_some_and(|size| size > MAX_BODY as u64) {
            return Err(BODY_TOO_LARGE.to_owned());
        }
        while let Some(chunk) = response.chunk().await
            .map_err(|_| "Could not read the Riot API response".to_owned())?
        {
            if chunk.len() > MAX_BODY - body.len() {
                return Err(BODY_TOO_LARGE.to_owned());
            }
            body.extend_from_slice(&chunk);
        }
    }
    Ok((status, retry_after, body))
}

async fn request(url: Url) -> Result<Value, String> {
    let key = read_key()?.ok_or("No Riot API key stored")?;
    let mut token = header::HeaderValue::from_str(&key)
        .map_err(|_| "Invalid Riot API key format".to_owned())?;
    token.set_sensitive(true);
    execute(url, &key, |url, _| send(url, token)).await
}

#[tauri::command]
pub async fn riot_get_account(region: String, game_name: String, tag_line: String) -> Result<Value, String> {
    request(endpoint(&region, Route::Account(&game_name, &tag_line))?).await
}

#[tauri::command]
pub async fn riot_get_match_ids(region: String, puuid: String, start: u32, count: u32) -> Result<Value, String> {
    request(endpoint(&region, Route::Ids(&puuid, start, count))?).await
}

#[tauri::command]
pub async fn riot_get_match(region: String, match_id: String) -> Result<Value, String> {
    request(endpoint(&region, Route::Match(&match_id))?).await
}

#[tauri::command]
pub async fn riot_get_client_region(state: tauri::State<'_, crate::AppState>) -> Result<Option<String>, String> {
    let response = crate::get_lcu_response_with_timeout(&state, "riotclient/region-locale", Some(REQUEST_TIMEOUT))
        .await.map_err(|_| "Could not read the League client region".to_owned())?;
    Ok(response.get("region").and_then(Value::as_str).map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_only_fixed_https_routes_and_encodes_identity() {
        for region in ["americas", "europe", "asia", "sea"] {
            assert_eq!(endpoint(region, Route::Account("Écho Fox", "A#1")).unwrap().as_str(),
                format!("https://{region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/%C3%89cho%20Fox/A%231"));
        }
        assert_eq!(endpoint("europe", Route::Ids("Ab_2-z", 5000, 100)).unwrap().as_str(),
            "https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/Ab_2-z/ids?start=5000&count=100");
        assert_eq!(endpoint("sea", Route::Match("OC1_123")).unwrap().as_str(),
            "https://sea.api.riotgames.com/lol/match/v5/matches/OC1_123");
    }

    #[test]
    fn rejects_unknown_or_injected_regions() {
        for region in ["", "EUW1", "Europe", "asia.evil.net", "asia@evil.net", "asia/foo", "asia:80"] {
            assert!(endpoint(region, Route::Match("OC1_1")).is_err(), "{region}");
        }
    }

    #[test]
    fn rejects_empty_overlong_or_path_changing_identity_segments() {
        let long = "a".repeat(101);
        for value in ["", ".", "..", "/", "\\", "%2e%2e", "a\n", &long] {
            assert!(endpoint("sea", Route::Account(value, "TAG")).is_err(), "{value}");
            assert!(endpoint("sea", Route::Account("Name", value)).is_err(), "{value}");
        }
        let max = "a".repeat(100);
        assert!(endpoint("sea", Route::Account(&max, &max)).is_ok());
    }

    #[test]
    fn validates_puuid_alphabet_and_length() {
        let long = "a".repeat(101);
        for value in ["", "a/b", "a?b", "a.b", "a\n", "é", &long] {
            assert!(endpoint("sea", Route::Ids(value, 0, 1)).is_err(), "{value}");
        }
        assert!(endpoint("sea", Route::Ids("a", 0, 1)).is_ok());
        assert!(endpoint("sea", Route::Ids(&"-".repeat(100), 0, 1)).is_ok());
    }

    #[test]
    fn validates_match_platform_and_numeric_suffix() {
        for value in ["", "A_1", "AAAAAAA_1", "oc1_1", "OC-1_1", "OC1_", "OC1_+1", "OC1_1/2", "OC1_1\n", "OC1_111111111111111111111"] {
            assert!(endpoint("sea", Route::Match(value)).is_err(), "{value}");
        }
        for value in ["A0_0", "ABCDEF_12345678901234567890"] {
            assert!(endpoint("sea", Route::Match(value)).is_ok(), "{value}");
        }
    }

    #[test]
    fn validates_start_and_count_boundaries() {
        for (start, count) in [(5001, 1), (0, 0), (0, 101)] {
            assert!(endpoint("sea", Route::Ids("abc", start, count)).is_err());
        }
        assert!(endpoint("sea", Route::Ids("abc", 5000, 100)).is_ok());
    }

    fn fake(status: StatusCode, retry: Option<u64>, body: &[u8]) -> Result<Value, String> {
        tauri::async_runtime::block_on(execute(
            endpoint("sea", Route::Match("OC1_1")).unwrap(),
            "TEST-KEY-NOT-REAL",
            |url, key| {
                assert_eq!(url.host_str(), Some("sea.api.riotgames.com"));
                assert_eq!(key, "TEST-KEY-NOT-REAL");
                std::future::ready(Ok((status, retry, body.to_vec())))
            },
        ))
    }

    #[test]
    fn maps_statuses_without_exposing_response_bodies() {
        let body = b"TEST-KEY-NOT-REAL";
        for status in [StatusCode::UNAUTHORIZED, StatusCode::FORBIDDEN] {
            assert_eq!(fake(status, None, body).unwrap_err(), "Riot API key invalid or expired");
        }
        assert_eq!(fake(StatusCode::NOT_FOUND, None, body).unwrap_err(), "Riot API resource not found");
        assert_eq!(fake(StatusCode::TOO_MANY_REQUESTS, Some(42), body).unwrap(), json!({"kind": "rateLimited", "retryAfter": 42}));
        assert_eq!(fake(StatusCode::TOO_MANY_REQUESTS, None, body).unwrap(), json!({"kind": "rateLimited", "retryAfter": 120}));
        assert_eq!(fake(StatusCode::FOUND, None, body).unwrap_err(), "Riot API returned HTTP 302");
        assert_eq!(fake(StatusCode::OK, None, br#"{"puuid":"some-id"}"#).unwrap(), json!({"kind": "ok", "data": {"puuid": "some-id"}}));
    }

    #[test]
    fn redacts_transport_errors_and_rejects_echoed_credentials() {
        let result = tauri::async_runtime::block_on(execute(
            endpoint("sea", Route::Match("OC1_1")).unwrap(), "TEST-KEY-NOT-REAL",
            |_, _| std::future::ready(Err("TEST-KEY-NOT-REAL on TEST-KEY-NOT-REAL".to_owned())),
        ));
        assert_eq!(result.unwrap_err(), "[redacted] on [redacted]");
        assert_eq!(fake(StatusCode::OK, None, b"corrupt TEST-KEY-NOT-REAL").unwrap_err(), "Riot API did not return valid JSON");
        assert_eq!(fake(StatusCode::OK, None, br#"{"value":"\u0054EST-KEY-NOT-REAL"}"#).unwrap_err(), "Unexpected Riot API response");
    }

    #[test]
    fn credential_store_read_failures_are_not_missing_entries() {
        assert_eq!(secret_from(Err(keyring::Error::NoEntry)), Ok(None));
        assert_eq!(secret_from(Err(keyring::Error::PlatformFailure("TEST-KEY-NOT-REAL".into()))), Err("Could not read the system credential store".to_owned()));
    }

    #[test]
    fn rejects_body_above_five_megabytes() {
        assert_eq!(fake(StatusCode::OK, None, &vec![b' '; 5 * 1024 * 1024 + 1]).unwrap_err(), "Riot API response exceeds 5 MB");
    }
}
