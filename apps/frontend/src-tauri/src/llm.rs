//! OpenAI-compatible chat completions and model discovery.
//!
//! The API key lives only in the OS credential store and is sent as a header;
//! no command returns it, and it is never part of a log line or an error string.

use std::{collections::HashSet, time::Duration};

use reqwest::{Client, RequestBuilder, StatusCode};
use serde_json::{json, Value};
use url::{Host, Url};

const KEY_SERVICE: &str = "com.draftgap.personal";
const KEY_ACCOUNT: &str = "llm-api-key";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_ERROR_BODY_CHARS: usize = 300;

/// `keyring` 4 with its default `v1` feature registers the platform credential
/// store itself on the first `Entry::new` (keyring `v1.rs`), so no startup
/// registration is needed here. `credential_store_initializes` pins that.
fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_ACCOUNT)
        .map_err(|_| "Could not open the system credential store".to_owned())
}

const KEY_MISMATCH: &str =
    "The stored key belongs to another endpoint; save it again for this base URL.";

const KEY_READ_FAILED: &str = "Could not read the system credential store";

/// Only "no entry" means no key; any other store error is a fixed string with
/// no detail, so a locked or denied store never looks like a missing key.
fn secret_from(result: Result<String, keyring::Error>) -> Result<Option<String>, String> {
    match result {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(KEY_READ_FAILED.to_owned()),
    }
}

/// The raw stored secret (a JSON string), if any. Never leaves this module.
fn read_secret() -> Result<Option<String>, String> {
    let entry = key_entry().map_err(|_| KEY_READ_FAILED.to_owned())?;
    secret_from(entry.get_password())
}

fn encode_secret(key: &str, origin: &str) -> String {
    json!({ "key": key, "origin": origin }).to_string()
}

/// Scheme + host + effective port of a validated base URL, normalized by `url`.
fn origin_of(base_url: &str) -> Result<String, String> {
    let url = validate_base_url(base_url)?;
    let host = url.host_str().ok_or("The base URL has no host")?;
    let port = url
        .port_or_known_default()
        .ok_or("The base URL has no port")?;
    Ok(format!("{}://{host}:{port}", url.scheme()))
}

/// Which key, if any, applies to `base_url` given the stored secret.
/// A secret that is not `{ "key", "origin" }` JSON counts as no key.
fn resolve_key(stored: Option<&str>, base_url: &str) -> Result<Option<String>, String> {
    let origin = origin_of(base_url)?;
    let Some(value) = stored.and_then(|raw| serde_json::from_str::<Value>(raw).ok()) else {
        return Ok(None);
    };
    let (Some(key), Some(stored_origin)) = (
        value.get("key").and_then(Value::as_str),
        value.get("origin").and_then(Value::as_str),
    ) else {
        return Ok(None);
    };
    if key.is_empty() {
        return Ok(None);
    }
    if stored_origin == origin {
        Ok(Some(key.to_owned()))
    } else if is_loopback_base_url(base_url) {
        // A keyless local endpoint must not be blocked by a hosted key.
        Ok(None)
    } else {
        Err(KEY_MISMATCH.to_owned())
    }
}

/// Replaces every occurrence of the key; no-op for no key or an empty key.
fn redact(body: &str, key: Option<&str>) -> String {
    match key {
        Some(key) if !key.is_empty() => body.replace(key, "[redacted]"),
        _ => body.to_owned(),
    }
}

/// Redacts first, then truncates, so a key cut by the limit is not leaked.
fn error_body(body: &str, key: Option<&str>, max: usize) -> String {
    truncate_chars(&redact(body, key), max)
}

/// The hosts `http` is allowed for: localhost, 127.0.0.1 and ::1.
fn is_loopback_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(domain)) => domain == "localhost",
        Some(Host::Ipv4(ip)) => ip.is_loopback() && ip.octets() == [127, 0, 0, 1],
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

fn is_loopback_base_url(base_url: &str) -> bool {
    Url::parse(base_url.trim()).is_ok_and(|url| is_loopback_host(&url))
}

/// Accepts `https` URLs, and `http` only for a loopback host.
fn validate_base_url(base_url: &str) -> Result<Url, String> {
    let url = Url::parse(base_url.trim()).map_err(|_| "The base URL is not a valid URL".to_owned())?;

    if !url.username().is_empty() || url.password().is_some() {
        return Err("The base URL must not contain credentials".to_owned());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("The base URL must not contain a query or fragment".to_owned());
    }

    match url.scheme() {
        "https" => {
            if url.host().is_none() {
                return Err("The base URL has no host".to_owned());
            }
            Ok(url)
        }
        "http" => {
            if is_loopback_host(&url) {
                Ok(url)
            } else {
                Err("http is only allowed for localhost, 127.0.0.1 and ::1; use https".to_owned())
            }
        }
        _ => Err("The base URL must use https (or http for localhost)".to_owned()),
    }
}

fn endpoint_url(base_url: &str, path: &str) -> Result<String, String> {
    let url = validate_base_url(base_url)?;
    Ok(format!("{}/{path}", url.as_str().trim_end_matches('/')))
}

fn chat_completions_url(base_url: &str) -> Result<String, String> {
    endpoint_url(base_url, "chat/completions")
}

fn models_url(base_url: &str) -> Result<String, String> {
    endpoint_url(base_url, "models")
}

fn model_ids(body: &Value) -> Vec<String> {
    let Some(entries) = body.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|id| !id.is_empty() && id.chars().take(201).count() <= 200 && seen.insert(*id))
        .take(200)
        .map(str::to_owned)
        .collect()
}

fn truncate_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

#[tauri::command]
pub fn llm_set_api_key(key: String, base_url: String) -> Result<(), String> {
    let origin = origin_of(&base_url)?;
    let key = key.trim();
    if key.is_empty() {
        return Err("The API key is empty".to_owned());
    }
    key_entry()?
        .set_password(&encode_secret(key, &origin))
        .map_err(|_| "Could not store the API key in the system credential store".to_owned())
}

#[tauri::command]
pub fn llm_clear_api_key() -> Result<(), String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the API key from the system credential store".to_owned()),
    }
}

fn has_api_key(
    base_url: &str,
    read: impl FnOnce() -> Result<Option<String>, String>,
) -> Result<bool, String> {
    let stored = read()?;
    Ok(matches!(resolve_key(stored.as_deref(), base_url), Ok(Some(_))))
}

#[tauri::command]
pub fn llm_has_api_key(base_url: String) -> Result<bool, String> {
    has_api_key(&base_url, read_secret)
}

fn chat_key(
    base_url: &str,
    read: impl FnOnce() -> Result<Option<String>, String>,
) -> Result<Option<String>, String> {
    let stored = match read() {
        Ok(stored) => stored,
        // A local model can still run without a key if the store is unavailable.
        Err(_) if is_loopback_base_url(base_url) => None,
        Err(error) => return Err(error),
    };
    resolve_key(stored.as_deref(), base_url)
}

fn request_context(base_url: &str) -> Result<(Client, Option<String>), String> {
    let key = chat_key(base_url, read_secret)?;
    // The League client in main.rs accepts invalid certificates; keep the default TLS checks here.
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        // A redirect could lead to a host the URL check never saw.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not build the HTTP client".to_owned())?;
    Ok((client, key))
}

async fn send_json(mut request: RequestBuilder, key: Option<&str>) -> Result<Value, String> {
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request.send().await.map_err(|e| {
        let detail = redact(&e.without_url().to_string(), key);
        format!("Could not reach the endpoint: {detail}")
    })?;
    let status = response.status();
    let body = response.text().await.map_err(|e| {
        let detail = redact(&e.without_url().to_string(), key);
        format!("Could not read the response body: {detail}")
    })?;
    parse_response(status, &body, key)
}

fn parse_response(status: StatusCode, body: &str, key: Option<&str>) -> Result<Value, String> {
    if !status.is_success() {
        return Err(format!(
            "The endpoint returned {status}: {}",
            error_body(body, key, MAX_ERROR_BODY_CHARS)
        ));
    }

    serde_json::from_str(body).map_err(|_| {
        format!(
            "The endpoint did not return JSON: {}",
            error_body(body, key, MAX_ERROR_BODY_CHARS)
        )
    })
}

#[tauri::command]
pub async fn llm_chat(base_url: String, model: String, messages: Value) -> Result<Value, String> {
    let endpoint = chat_completions_url(&base_url)?;
    let (client, key) = request_context(&base_url)?;
    let request = client.post(endpoint).json(&json!({
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500,
        "stream": false,
    }));
    send_json(request, key.as_deref()).await
}

#[tauri::command]
pub async fn llm_list_models(base_url: String) -> Result<Vec<String>, String> {
    let endpoint = models_url(&base_url)?;
    let (client, key) = request_context(&base_url)?;
    let body = send_json(client.get(endpoint), key.as_deref()).await?;
    Ok(model_ids(&body))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reads no secret and writes nothing: it only checks that the platform
    /// store was registered and that an entry handle can be created.
    #[test]
    fn credential_store_initializes() {
        assert!(key_entry().is_ok());
        assert!(keyring::Entry::store_status().is_ok());
    }

    #[test]
    fn accepts_https() {
        assert_eq!(
            chat_completions_url("https://example.com/v1").unwrap(),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn trims_trailing_slashes() {
        assert_eq!(
            chat_completions_url("https://example.com/v1///").unwrap(),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://example.com").unwrap(),
            "https://example.com/chat/completions"
        );
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(
            chat_completions_url("  https://example.com/v1/ ").unwrap(),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn accepts_http_only_for_loopback() {
        for url in [
            "http://localhost:8080/v1",
            "http://127.0.0.1:1234/v1",
            "http://[::1]:1234/v1",
        ] {
            assert!(chat_completions_url(url).is_ok(), "{url}");
        }
        assert_eq!(
            chat_completions_url("http://localhost:8080/v1/").unwrap(),
            "http://localhost:8080/v1/chat/completions"
        );
    }

    #[test]
    fn rejects_http_for_remote_hosts() {
        for url in [
            "http://example.com/v1",
            "http://192.168.1.10/v1",
            "http://127.0.0.2/v1",
            "http://localhost.example.com/v1",
            "http://10.0.0.1/v1",
        ] {
            assert!(chat_completions_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn rejects_other_schemes_and_garbage() {
        for url in [
            "",
            "example.com/v1",
            "ftp://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://",
        ] {
            assert!(chat_completions_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn rejects_credentials_query_and_fragment() {
        for url in [
            "https://user:pass@example.com/v1",
            "https://example.com/v1?x=1",
            "https://example.com/v1#frag",
        ] {
            assert!(chat_completions_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn truncates_by_characters() {
        let long = "é".repeat(500);
        assert_eq!(truncate_chars(&long, 300).chars().count(), 300);
        assert_eq!(truncate_chars("abc", 300), "abc");
    }

    #[test]
    fn url_edge_cases() {
        for url in ["http://0.0.0.0/v1", "http://127.0.0.1.evil.com/v1", "http://[::ffff:127.0.0.1]/v1",
                    "https://user@example.com/v1", "https://:p@example.com/v1",
                    "https://example.com/v1?", "https://example.com/v1#", "http://localhost./v1"] {
            assert!(chat_completions_url(url).is_err(), "{url}");
        }
        assert_eq!(chat_completions_url("HTTPS://Example.COM/v1").unwrap(), "https://example.com/v1/chat/completions");
        assert_eq!(chat_completions_url("HTTP://LOCALHOST:8080/v1").unwrap(), "http://localhost:8080/v1/chat/completions");
        assert_eq!(chat_completions_url("http://127.1:1234/v1").unwrap(), "http://127.0.0.1:1234/v1/chat/completions");
    }

    #[test]
    fn models_url_joins_validated_base() {
        for (base, expected) in [
            ("  https://example.com/v1/// ", "https://example.com/v1/models"),
            ("https://example.com", "https://example.com/models"),
            ("http://localhost:8080/v1/", "http://localhost:8080/v1/models"),
            ("http://127.0.0.1:1234/v1", "http://127.0.0.1:1234/v1/models"),
            ("http://[::1]:1234/v1", "http://[::1]:1234/v1/models"),
        ] {
            assert_eq!(models_url(base).unwrap(), expected);
        }
    }

    #[test]
    fn models_url_rejects_the_same_bases_as_chat() {
        for base in [
            "",
            "example.com/v1",
            "ftp://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://",
            "http://example.com/v1",
            "http://192.168.1.10/v1",
            "http://127.0.0.2/v1",
            "http://localhost.example.com/v1",
            "http://10.0.0.1/v1",
            "http://0.0.0.0/v1",
            "http://127.0.0.1.evil.com/v1",
            "http://[::ffff:127.0.0.1]/v1",
            "http://localhost./v1",
            "https://user:pass@example.com/v1",
            "https://user@example.com/v1",
            "https://:p@example.com/v1",
            "https://example.com/v1?x=1",
            "https://example.com/v1#frag",
            "https://example.com/v1?",
            "https://example.com/v1#",
        ] {
            assert_eq!(
                models_url(base).unwrap_err(),
                chat_completions_url(base).unwrap_err(),
                "{base}"
            );
        }
    }

    #[test]
    fn model_ids_trims_deduplicates_and_keeps_order() {
        let body = json!({"data": [
            {"id": " zeta "}, {"id": "alpha"}, {"id": "zeta"}, {"id": " alpha "},
            {"id": "Zeta"}, {"id": " "}, {"id": ""}, {"id": 42}, {}, "other", null
        ]});
        assert_eq!(model_ids(&body), ["zeta", "alpha", "Zeta"]);
    }

    #[test]
    fn model_ids_returns_empty_for_empty_or_malformed_data() {
        for body in [
            json!(null),
            json!([]),
            json!({}),
            json!({"data": []}),
            json!({"data": {"id": "wrong shape"}}),
            json!({"data": "wrong shape"}),
            json!({"data": [{"id": null}, {"id": []}, {"id": {}}]}),
        ] {
            assert!(model_ids(&body).is_empty(), "{body}");
        }
    }

    #[test]
    fn model_ids_caps_character_length_and_unique_count() {
        let max_length = "é".repeat(200);
        let mut entries = vec![
            json!({"id": "é".repeat(201)}),
            json!({"id": format!(" {max_length} ")}),
        ];
        entries.extend((0..205).flat_map(|i| {
            [
                json!({"id": format!("model-{i}")}),
                json!({"id": format!(" model-{i} ")}),
            ]
        }));
        let mut expected = vec![max_length];
        expected.extend((0..199).map(|i| format!("model-{i}")));
        assert_eq!(model_ids(&json!({"data": entries})), expected);
    }

    #[test]
    fn llm_response_preserves_json_and_redacts_error_bodies() {
        let key = Some("example-secret");
        assert_eq!(
            parse_response(StatusCode::OK, "{\"choices\":[]}", key),
            Ok(json!({"choices": []}))
        );
        assert_eq!(
            parse_response(StatusCode::UNAUTHORIZED, "rejected example-secret", key),
            Err("The endpoint returned 401 Unauthorized: rejected [redacted]".to_owned())
        );
        assert_eq!(
            parse_response(StatusCode::OK, "invalid example-secret", key),
            Err("The endpoint did not return JSON: invalid [redacted]".to_owned())
        );
    }

    fn stored(key: &str, base_url: &str) -> String {
        encode_secret(key, &origin_of(base_url).unwrap())
    }

    #[test]
    fn key_applies_for_matching_origin() {
        let s = stored("k1", "https://h.example/v1");
        assert_eq!(
            resolve_key(Some(&s), "https://h.example/v1").unwrap(),
            Some("k1".to_owned())
        );
    }

    #[test]
    fn key_mismatch_on_host_scheme_or_port() {
        let s = stored("k1", "https://h.example/v1");
        for url in [
            "https://other.example/v1",
            "https://h.example:8443/v1",
        ] {
            assert_eq!(resolve_key(Some(&s), url).unwrap_err(), KEY_MISMATCH, "{url}");
        }
        let local = stored("k2", "http://localhost:8080/v1");
        assert_eq!(
            resolve_key(Some(&local), "https://remote.example/v1").unwrap_err(),
            KEY_MISMATCH
        );
    }

    #[test]
    fn mismatched_key_is_no_key_for_loopback_targets() {
        let s = stored("k1", "https://h.example/v1");
        for url in [
            "http://localhost/v1",
            "http://localhost:8080/v1",
            "http://127.0.0.1:1234/v1",
            "http://[::1]:1234/v1",
            "https://localhost:8443/v1",
        ] {
            assert_eq!(resolve_key(Some(&s), url).unwrap(), None, "{url}");
        }
        // Not loopback: the mismatch error stays.
        for url in ["http://127.0.0.2/v1", "https://localhost.example.com/v1"] {
            assert!(resolve_key(Some(&s), url).is_err(), "{url}");
        }
    }

    #[test]
    fn matching_key_still_applies_for_loopback() {
        let s = stored("k1", "http://localhost:8080/v1");
        assert_eq!(
            resolve_key(Some(&s), "http://localhost:8080/v1").unwrap(),
            Some("k1".to_owned())
        );
    }

    #[test]
    fn only_no_entry_means_no_key() {
        assert_eq!(secret_from(Err(keyring::Error::NoEntry)), Ok(None));
        assert_eq!(secret_from(Ok("s".to_owned())), Ok(Some("s".to_owned())));
        for err in [
            keyring::Error::NoStorageAccess("secret-detail".into()),
            keyring::Error::PlatformFailure("secret-detail".into()),
            keyring::Error::BadEncoding(b"secret-detail".to_vec()),
        ] {
            assert_eq!(secret_from(Err(err)), Err(KEY_READ_FAILED.to_owned()));
        }
        assert_eq!(KEY_READ_FAILED, "Could not read the system credential store");
    }

    fn unreadable_store() -> Result<Option<String>, String> {
        secret_from(Err(keyring::Error::NoStorageAccess("fake locked store".into())))
    }

    #[test]
    fn key_status_reports_store_failure() {
        let url = "http://localhost:8080/v1";
        assert_eq!(has_api_key(url, unreadable_store), Err(KEY_READ_FAILED.to_owned()));
        assert_eq!(has_api_key(url, || Ok(None)), Ok(false));
        assert_eq!(has_api_key(url, || Ok(Some(stored("k1", url)))), Ok(true));
    }

    #[test]
    fn loopback_chat_can_proceed_without_a_key_if_the_store_fails() {
        for url in ["http://localhost:8080/v1", "http://127.0.0.1/v1", "http://[::1]/v1"] {
            assert_eq!(chat_key(url, unreadable_store), Ok(None), "{url}");
        }
        let url = "http://localhost:8080/v1";
        assert_eq!(chat_key(url, || Ok(Some(stored("k1", url)))), Ok(Some("k1".to_owned())));
    }

    #[test]
    fn remote_chat_cannot_proceed_if_the_store_fails() {
        assert_eq!(chat_key("https://localhost.example/v1", unreadable_store), Err(KEY_READ_FAILED.to_owned()));
    }

    #[test]
    fn default_port_equals_explicit_port() {
        let s = stored("k1", "https://h/v1");
        assert_eq!(
            resolve_key(Some(&s), "https://h:443/v1").unwrap(),
            Some("k1".to_owned())
        );
    }

    #[test]
    fn path_does_not_matter_for_origin() {
        let s = stored("k1", "https://h/v1");
        assert_eq!(
            resolve_key(Some(&s), "https://h/other").unwrap(),
            Some("k1".to_owned())
        );
    }

    #[test]
    fn bare_or_missing_secret_yields_no_key() {
        assert_eq!(resolve_key(Some("sk-bare-key"), "https://h/v1").unwrap(), None);
        assert_eq!(resolve_key(Some(""), "https://h/v1").unwrap(), None);
        assert_eq!(resolve_key(Some(r#"{"key":"a"}"#), "https://h/v1").unwrap(), None);
        assert_eq!(resolve_key(None, "https://h/v1").unwrap(), None);
    }

    #[test]
    fn invalid_base_url_is_an_error() {
        let s = stored("k1", "https://h/v1");
        assert!(resolve_key(Some(&s), "ftp://h").is_err());
    }

    #[test]
    fn redact_replaces_every_occurrence() {
        assert_eq!(redact("a sk-1 b sk-1 c", Some("sk-1")), "a [redacted] b [redacted] c");
    }

    #[test]
    fn redact_is_noop_without_key() {
        assert_eq!(redact("abc", None), "abc");
        assert_eq!(redact("abc", Some("")), "abc");
    }

    #[test]
    fn redaction_happens_before_truncation() {
        let body = format!("{}SECRETKEY{}", "a".repeat(296), "b".repeat(50));
        let out = error_body(&body, Some("SECRETKEY"), 300);
        assert!(!out.contains("SECRET"), "{out}");
        assert!(out.ends_with("[red"), "{out}");
        assert_eq!(out.chars().count(), 300);
    }
}
