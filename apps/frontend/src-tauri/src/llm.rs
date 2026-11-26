//! Optional LLM explanation layer: an OpenAI-compatible chat completions call.
//!
//! The API key lives only in the OS credential store. It is read inside
//! `llm_chat` and sent as a header; no command ever returns it, and it is
//! never part of a log line or an error string.

use std::time::Duration;

use reqwest::Client;
use serde_json::{json, Value};
use url::{Host, Url};

const KEY_SERVICE: &str = "com.draftgap.personal";
const KEY_ACCOUNT: &str = "llm-api-key";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_ERROR_BODY_CHARS: usize = 300;

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_ACCOUNT)
        .map_err(|_| "Could not open the system credential store".to_owned())
}

const KEY_MISMATCH: &str =
    "The stored key belongs to another endpoint; save it again for this base URL.";

/// The raw stored secret (a JSON string), if any. Never leaves this module.
fn read_secret() -> Option<String> {
    key_entry().ok()?.get_password().ok()
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
            let is_local = match url.host() {
                Some(Host::Domain(domain)) => domain == "localhost",
                Some(Host::Ipv4(ip)) => ip.is_loopback() && ip.octets() == [127, 0, 0, 1],
                Some(Host::Ipv6(ip)) => ip.is_loopback(),
                None => false,
            };
            if is_local {
                Ok(url)
            } else {
                Err("http is only allowed for localhost, 127.0.0.1 and ::1; use https".to_owned())
            }
        }
        _ => Err("The base URL must use https (or http for localhost)".to_owned()),
    }
}

/// Validates the base URL and joins the chat completions path to it.
fn chat_completions_url(base_url: &str) -> Result<String, String> {
    let url = validate_base_url(base_url)?;
    Ok(format!(
        "{}/chat/completions",
        url.as_str().trim_end_matches('/')
    ))
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

#[tauri::command]
pub fn llm_has_api_key(base_url: String) -> bool {
    matches!(
        resolve_key(read_secret().as_deref(), &base_url),
        Ok(Some(_))
    )
}

#[tauri::command]
pub async fn llm_chat(
    base_url: String,
    model: String,
    messages: Value,
) -> Result<Value, String> {
    // Validated before anything else: nothing is sent to a rejected URL.
    let endpoint = chat_completions_url(&base_url)?;
    // A key stored for another origin is never attached; no request is made.
    let key = resolve_key(read_secret().as_deref(), &base_url)?;

    // A dedicated client with default TLS verification. The shared client in
    // main.rs accepts invalid certificates for the local League client only.
    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        // A redirect could lead to a host the URL check never saw.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not build the HTTP client".to_owned())?;

    let mut request = client.post(endpoint).json(&json!({
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500,
        "stream": false,
    }));
    if let Some(key) = &key {
        request = request.bearer_auth(key);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Could not reach the endpoint: {}", e.without_url()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Could not read the response body: {}", e.without_url()))?;

    if !status.is_success() {
        return Err(format!(
            "The endpoint returned {status}: {}",
            error_body(&body, key.as_deref(), MAX_ERROR_BODY_CHARS)
        ));
    }

    serde_json::from_str(&body).map_err(|_| {
        format!(
            "The endpoint did not return JSON: {}",
            error_body(&body, key.as_deref(), MAX_ERROR_BODY_CHARS)
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
            "http://localhost/v1",
            "https://h.example:8443/v1",
        ] {
            assert_eq!(resolve_key(Some(&s), url).unwrap_err(), KEY_MISMATCH, "{url}");
        }
        let local = stored("k2", "http://localhost:8080/v1");
        assert_eq!(
            resolve_key(Some(&local), "https://localhost:8080/v1").unwrap_err(),
            KEY_MISMATCH
        );
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
