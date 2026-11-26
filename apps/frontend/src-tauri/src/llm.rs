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

fn read_key() -> Option<String> {
    key_entry()
        .ok()?
        .get_password()
        .ok()
        .filter(|key| !key.is_empty())
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
pub fn llm_set_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The API key is empty".to_owned());
    }
    key_entry()?
        .set_password(key)
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
pub fn llm_has_api_key() -> bool {
    read_key().is_some()
}

#[tauri::command]
pub async fn llm_chat(
    base_url: String,
    model: String,
    messages: Value,
) -> Result<Value, String> {
    // Validated before anything else: nothing is sent to a rejected URL.
    let endpoint = chat_completions_url(&base_url)?;

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
    if let Some(key) = read_key() {
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
            truncate_chars(&body, MAX_ERROR_BODY_CHARS)
        ));
    }

    serde_json::from_str(&body).map_err(|_| {
        format!(
            "The endpoint did not return JSON: {}",
            truncate_chars(&body, MAX_ERROR_BODY_CHARS)
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
}
