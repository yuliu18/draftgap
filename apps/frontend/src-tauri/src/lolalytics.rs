//! Read-only fetch of public Lolalytics build pages.
//!
//! lolalytics.com sends no CORS headers, so the webview cannot read its
//! pages. This command does the GET for it. It is deliberately narrow: GET
//! only, https only, host exactly `lolalytics.com`, path under `/lol/`, no
//! userinfo, no custom port, a response size cap and a timeout. It uses its
//! own client with default TLS verification; it never touches the LCU client,
//! which accepts invalid certificates.

use std::time::Duration;

use reqwest::{redirect, Client};
use url::{Host, Url};

const ALLOWED_HOST: &str = "lolalytics.com";
const ALLOWED_PATH_PREFIX: &str = "/lol/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;
const MAX_REDIRECTS: usize = 3;
const USER_AGENT: &str = "DraftGap-personal (build page reader)";

/// The allow-list. Used for the requested URL and for every redirect target.
fn is_allowed(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host() == Some(Host::Domain(ALLOWED_HOST))
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.path().starts_with(ALLOWED_PATH_PREFIX)
}

fn parse_allowed(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Not a valid URL".to_owned())?;
    if !is_allowed(&url) {
        return Err(
            "URL is not allowed: only https://lolalytics.com/lol/... can be read".to_owned(),
        );
    }
    Ok(url)
}

fn build_client() -> Result<Client, String> {
    // Redirects are followed only while they stay on the allow-list.
    let policy = redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS || !is_allowed(attempt.url()) {
            attempt.stop()
        } else {
            attempt.follow()
        }
    });
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(policy)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| "Could not build the HTTP client".to_owned())
}

#[tauri::command]
pub async fn fetch_lolalytics_page(url: String) -> Result<String, String> {
    let url = parse_allowed(&url)?;
    let mut res = build_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Could not fetch the page: {}", e.without_url()))?;

    let status = res.status();
    if !status.is_success() {
        return Err(format!("Lolalytics returned {status}"));
    }
    if res
        .content_length()
        .is_some_and(|n| n > MAX_BODY_BYTES as u64)
    {
        return Err("The page is larger than the size limit".to_owned());
    }

    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = res
        .chunk()
        .await
        .map_err(|e| format!("Could not read the page: {}", e.without_url()))?
    {
        if body.len() + chunk.len() > MAX_BODY_BYTES {
            return Err("The page is larger than the size limit".to_owned());
        }
        body.extend_from_slice(&chunk);
    }

    Ok(String::from_utf8_lossy(&body).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(raw: &str) -> bool {
        parse_allowed(raw).is_ok()
    }

    #[test]
    fn accepts_build_and_matchup_pages() {
        assert!(ok(
            "https://lolalytics.com/lol/ahri/build/?tier=emerald_plus&patch=30&lane=middle"
        ));
        assert!(ok(
            "https://lolalytics.com/lol/ahri/vs/zed/build/?lane=middle&vslane=middle"
        ));
        assert!(ok("https://lolalytics.com:443/lol/x/build/"));
    }

    #[test]
    fn rejects_other_hosts() {
        assert!(!ok("https://example.com/lol/x/build/"));
        assert!(!ok("https://lolalytics.com.evil.com/lol/x/build/"));
        assert!(!ok("https://evil-lolalytics.com/lol/x/build/"));
        assert!(!ok("https://127.0.0.1/lol/x/build/"));
        assert!(!ok("https://a1.lolalytics.com/lol/x/build/"));
    }

    #[test]
    fn rejects_subdomains() {
        assert!(!ok("https://www.lolalytics.com/lol/x/build/"));
        assert!(!ok("https://ax.lolalytics.com/lol/x/build/"));
    }

    #[test]
    fn rejects_non_https() {
        assert!(!ok("http://lolalytics.com/lol/x/build/"));
        assert!(!ok("ftp://lolalytics.com/lol/x/build/"));
        assert!(!ok("file:///lol/x/build/"));
    }

    #[test]
    fn rejects_paths_outside_lol() {
        assert!(!ok("https://lolalytics.com/"));
        assert!(!ok("https://lolalytics.com/lol"));
        assert!(!ok("https://lolalytics.com/api/lol/x"));
        assert!(!ok("https://lolalytics.com/lolx/x/build/"));
        assert!(!ok("https://lolalytics.com/lol/../admin/"));
        assert!(!ok("https://lolalytics.com/lol/%2e%2e/admin/"));
    }

    #[test]
    fn rejects_userinfo() {
        assert!(!ok("https://user@lolalytics.com/lol/x/build/"));
        assert!(!ok("https://user:pw@lolalytics.com/lol/x/build/"));
        assert!(!ok("https://lolalytics.com@evil.com/lol/x/build/"));
        assert!(!ok("https://evil.com@lolalytics.com.evil.com/lol/x/"));
    }

    #[test]
    fn rejects_other_ports_and_garbage() {
        assert!(!ok("https://lolalytics.com:8443/lol/x/build/"));
        assert!(!ok("not a url"));
        assert!(!ok(""));
    }

    #[test]
    fn redirect_targets_use_the_same_allow_list() {
        let good = Url::parse("https://lolalytics.com/lol/ahri/build/").unwrap();
        let bad = Url::parse("https://evil.com/lol/ahri/build/").unwrap();
        assert!(is_allowed(&good));
        assert!(!is_allowed(&bad));
    }
}
