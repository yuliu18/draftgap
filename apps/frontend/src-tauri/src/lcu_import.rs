//! User-initiated import of a rune page and an item set into the League client.
//! These are the ONLY writes the app makes to the client (S11). Both commands
//! use a fixed path chosen here; nothing from the webview selects a method or
//! path, and picks/bans are never touched (S8).
//!
//! Errors are returned to the webview as `code` or `code: detail`; the codes
//! are `invalid_input`, `client_not_running`, `page_limit`,
//! `unexpected_response` and `client_error`. They never contain the LCU token.

use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{get_lcu_response, get_league_lcu_data, AppState};

pub const NAME_PREFIX: &str = "DraftGap: ";
pub const PAGE_NAME_MAX_CHARS: usize = 25;
pub const SUMMONERS_RIFT_MAP_ID: i64 = 11;

fn clean(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .to_owned()
}

fn named(champion_name: &str, role: &str) -> String {
    let champion = clean(champion_name);
    let role = clean(role);
    if role.is_empty() {
        format!("{NAME_PREFIX}{champion}")
    } else {
        format!("{NAME_PREFIX}{champion} {role}")
    }
}

/// Rune page name: prefix + champion + role, cut to the client's name limit
/// (assumed 25 characters; the prefix is always kept).
pub fn page_name(champion_name: &str, role: &str) -> String {
    named(champion_name, role)
        .chars()
        .take(PAGE_NAME_MAX_CHARS)
        .collect::<String>()
        .trim_end()
        .to_owned()
}

pub fn set_title(champion_name: &str, role: &str) -> String {
    named(champion_name, role)
}

pub fn parse_champion_id(champion_key: &str) -> Result<i64, String> {
    match champion_key.trim().parse::<i64>() {
        Ok(id) if id > 0 => Ok(id),
        _ => Err("invalid_input: champion key".to_owned()),
    }
}

fn positive(id: i64, what: &str) -> Result<(), String> {
    if id > 0 {
        Ok(())
    } else {
        Err(format!("invalid_input: {what}"))
    }
}

pub fn validate_rune_input(primary: i64, sub: i64, perks: &[i64]) -> Result<(), String> {
    positive(primary, "primary style")?;
    positive(sub, "secondary style")?;
    if perks.len() != 9 {
        return Err("invalid_input: a rune page needs exactly 9 perk ids".to_owned());
    }
    perks.iter().try_for_each(|id| positive(*id, "perk id"))
}

#[derive(Deserialize)]
pub struct ItemBlockInput {
    title: String,
    items: Vec<i64>,
}

pub fn validate_item_input(blocks: &[ItemBlockInput]) -> Result<(), String> {
    if !(1..=8).contains(&blocks.len()) {
        return Err("invalid_input: expected 1 to 8 item blocks".to_owned());
    }
    for block in blocks {
        if !(1..=40).contains(&clean(&block.title).chars().count()) {
            return Err("invalid_input: item block title must have 1 to 40 characters".to_owned());
        }
        if !(1..=12).contains(&block.items.len()) {
            return Err("invalid_input: expected 1 to 12 items per block".to_owned());
        }
        block
            .items
            .iter()
            .try_for_each(|id| positive(*id, "item id"))?;
    }
    Ok(())
}

pub fn build_perk_page_body(name: &str, primary: i64, sub: i64, perks: &[i64]) -> Value {
    json!({
        "name": name,
        "primaryStyleId": primary,
        "subStyleId": sub,
        "selectedPerkIds": perks,
        "current": true,
    })
}

fn is_ours(name: &Value) -> bool {
    name.as_str().is_some_and(|n| n.starts_with(NAME_PREFIX))
}

/// Id of the page we may overwrite: the first editable page whose name starts
/// with the prefix. User pages are never returned.
pub fn choose_page_to_replace(pages: &Value) -> Result<Option<i64>, String> {
    let list = pages
        .as_array()
        .ok_or_else(|| "unexpected_response: rune pages".to_owned())?;
    let mut chosen = None;
    let mut seen = std::collections::HashSet::new();
    for page in list {
        let id = page["id"]
            .as_i64()
            .filter(|id| *id > 0)
            .ok_or_else(|| "unexpected_response: rune page without id".to_owned())?;
        // A repeated id could aim the PUT at a user page: write nothing.
        if !seen.insert(id) {
            return Err("unexpected_response: repeated rune page id".to_owned());
        }
        if chosen.is_none() && is_ours(&page["name"]) && page["isEditable"].as_bool() == Some(true)
        {
            chosen = Some(id);
        }
    }
    Ok(chosen)
}

fn block(kind: &str, ids: &[i64]) -> Option<Value> {
    if ids.is_empty() {
        return None;
    }
    let mut counted: Vec<(i64, u32)> = Vec::new();
    for id in ids {
        match counted.iter_mut().find(|(i, _)| i == id) {
            Some(entry) => entry.1 += 1,
            None => counted.push((*id, 1)),
        }
    }
    // One entry per distinct id, with a count, in first-seen order.
    Some(json!({
        "type": kind,
        "items": counted.iter().map(|(id, count)| json!({"id": id.to_string(), "count": count})).collect::<Vec<_>>(),
    }))
}

fn item_set_uid(champion_id: i64) -> String {
    format!("draftgap-{champion_id}-{SUMMONERS_RIFT_MAP_ID}")
}

pub fn build_item_set(
    title: &str,
    champion_id: i64,
    inputs: &[ItemBlockInput],
) -> Value {
    let blocks: Vec<Value> = inputs
        .iter()
        .filter_map(|input| block(&clean(&input.title), &input.items))
        .collect();
    json!({
        "title": title,
        "type": "custom",
        "map": "any",
        "mode": "any",
        "sortrank": 0,
        "startedFrom": "blank",
        "uid": item_set_uid(champion_id),
        "associatedChampions": [champion_id],
        "associatedMaps": [SUMMONERS_RIFT_MAP_ID],
        "preferredItemSlots": [],
        "blocks": blocks,
    })
}

/// Returns the full body to PUT: every existing set untouched and in order,
/// our set replacing the set with our uid for the same champion, otherwise
/// appended. Anything unexpected in the response is an error (nothing is written).
pub fn merge_item_sets(existing: &Value, ours: Value, champion_id: i64) -> Result<Value, String> {
    let bad = || "unexpected_response: item sets".to_owned();
    let mut body = existing.as_object().ok_or_else(bad)?.clone();
    if !body.get("timestamp").is_some_and(Value::is_number) {
        return Err(bad());
    }
    let mut sets = body
        .get("itemSets")
        .and_then(Value::as_array)
        .ok_or_else(bad)?
        .clone();
    if sets.iter().any(|s| !s.is_object()) {
        return Err(bad());
    }
    // Our set is recognised by the uid we write, never by its title: a set the
    // user named "DraftGap: ..." stays theirs.
    let uid = ours["uid"].clone();
    debug_assert_eq!(uid, json!(item_set_uid(champion_id)));
    let position = sets.iter().position(|s| s["uid"] == uid);
    match position {
        Some(i) => sets[i] = ours,
        None => sets.push(ours),
    }
    body.insert("itemSets".to_owned(), Value::Array(sets));
    Ok(Value::Object(body))
}

// ---- LCU access (not unit tested: needs a running client) ----

/// Sends one write. The path is always built by this module from fixed
/// segments and validated integers; the token is never part of an error.
async fn lcu_write(
    state: &tauri::State<'_, AppState>,
    method: Method,
    path: &str,
    body: &Value,
) -> Result<(StatusCode, String), String> {
    let mut guard = state.lcu_data.lock().await;
    if guard.is_none() {
        *guard = Some(get_league_lcu_data().map_err(|_| "client_not_running".to_owned())?);
    }
    let data = guard.as_ref().unwrap();
    let res = state
        .client
        .request(method, format!("https://127.0.0.1:{}/{}", data.port, path))
        .basic_auth(&data.username, Some(&data.password))
        .json(body)
        .send()
        .await;
    let res = match res {
        Ok(res) => res,
        Err(_) => {
            *guard = None;
            return Err("client_not_running".to_owned());
        }
    };
    let status = res.status();
    if status == StatusCode::UNAUTHORIZED {
        *guard = None;
    }
    let text = res.text().await.unwrap_or_default();
    Ok((status, text))
}

fn client_error(status: StatusCode, body: &str) -> String {
    format!(
        "client_error: {status} {}",
        body.chars().take(200).collect::<String>()
    )
}

/// Phrases (lowercase words) that describe a full rune page list.
const PAGE_LIMIT_PHRASES: [&[&str]; 8] = [
    &["maximum", "number", "of", "pages"],
    &["max", "number", "of", "pages"],
    &["maximum", "pages"],
    &["max", "pages"],
    &["page", "limit"],
    &["pages", "limit"],
    &["too", "many", "pages"],
    &["too", "many", "rune", "pages"],
];

/// Whole-word, case-insensitive match of a page-limit phrase in an error body.
pub fn looks_like_page_limit(body: &str) -> bool {
    let lower = body.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    PAGE_LIMIT_PHRASES
        .iter()
        .any(|phrase| words.windows(phrase.len()).any(|w| w == *phrase))
}

/// Error for a failed page creation: `page_limit` only for a 4xx whose body
/// describes a page limit, otherwise the generic client error.
pub fn classify_create_page_failure(status: StatusCode, body: &str) -> String {
    if status.is_client_error() && looks_like_page_limit(body) {
        "page_limit".to_owned()
    } else {
        client_error(status, body)
    }
}

#[derive(Serialize)]
pub struct RunePageResult {
    /// "created" or "replaced"
    action: &'static str,
    name: String,
    /// Whether the client accepted the page as the selected one.
    selected: bool,
}

/// The id of a page the client just created, from its response body.
pub fn created_page_id(body: &str) -> Option<i64> {
    serde_json::from_str::<Value>(body)
        .ok()?
        .get("id")?
        .as_i64()
        .filter(|id| *id > 0)
}

/// The client ignores `current` on page writes, so the page is selected with
/// its own request. A failure here never undoes the written page.
async fn select_page(state: &tauri::State<'_, AppState>, id: i64) -> bool {
    matches!(
        lcu_write(state, Method::PUT, "lol-perks/v1/currentpage", &json!(id)).await,
        Ok((status, _)) if status.is_success()
    )
}

#[tauri::command]
pub async fn import_rune_page(
    state: tauri::State<'_, AppState>,
    champion_name: String,
    role: String,
    primary_style_id: i64,
    sub_style_id: i64,
    perk_ids: Vec<i64>,
) -> Result<RunePageResult, String> {
    validate_rune_input(primary_style_id, sub_style_id, &perk_ids)?;
    if clean(&champion_name).is_empty() {
        return Err("invalid_input: champion name".to_owned());
    }
    let name = page_name(&champion_name, &role);
    let body = build_perk_page_body(&name, primary_style_id, sub_style_id, &perk_ids);

    let pages = get_lcu_response(&state, "lol-perks/v1/pages")
        .await
        .map_err(|_| "client_not_running".to_owned())?;
    let replace = choose_page_to_replace(&pages)?;

    match replace {
        Some(id) => {
            let (status, text) = lcu_write(
                &state,
                Method::PUT,
                &format!("lol-perks/v1/pages/{id}"),
                &body,
            )
            .await?;
            if !status.is_success() {
                return Err(client_error(status, &text));
            }
            let selected = select_page(&state, id).await;
            Ok(RunePageResult {
                action: "replaced",
                name,
                selected,
            })
        }
        None => {
            let (status, text) =
                lcu_write(&state, Method::POST, "lol-perks/v1/pages", &body).await?;
            if status.is_success() {
                let selected = match created_page_id(&text) {
                    Some(id) => select_page(&state, id).await,
                    None => false,
                };
                return Ok(RunePageResult {
                    action: "created",
                    name,
                    selected,
                });
            }
            Err(classify_create_page_failure(status, &text))
        }
    }
}

#[tauri::command]
pub async fn import_item_set(
    state: tauri::State<'_, AppState>,
    champion_key: String,
    champion_name: String,
    role: String,
    blocks: Vec<ItemBlockInput>,
) -> Result<String, String> {
    let champion_id = parse_champion_id(&champion_key)?;
    validate_item_input(&blocks)?;
    if clean(&champion_name).is_empty() {
        return Err("invalid_input: champion name".to_owned());
    }
    let title = set_title(&champion_name, &role);

    let summoner = get_lcu_response(&state, "lol-summoner/v1/current-summoner")
        .await
        .map_err(|_| "client_not_running".to_owned())?;
    let summoner_id = summoner["summonerId"]
        .as_i64()
        .filter(|id| *id > 0)
        .ok_or_else(|| "unexpected_response: summoner".to_owned())?;
    let path = format!("lol-item-sets/v1/item-sets/{summoner_id}/sets");

    let existing = get_lcu_response(&state, &path)
        .await
        .map_err(|_| "unexpected_response: item sets".to_owned())?;
    let ours = build_item_set(&title, champion_id, &blocks);
    let merged = merge_item_sets(&existing, ours, champion_id)?;

    let (status, text) = lcu_write(&state, Method::PUT, &path, &merged).await?;
    if !status.is_success() {
        return Err(client_error(status, &text));
    }
    Ok(title)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PERKS: [i64; 9] = [8005, 8009, 9103, 8014, 8138, 8135, 5005, 5008, 5001];

    #[test]
    fn page_limit_phrases_are_recognised_whole_word_case_insensitive() {
        for body in [
            "Maximum number of pages reached",
            "{\"message\":\"MAX PAGES exceeded\"}",
            "page limit reached",
            "Page_Limit",
            "You have too many pages",
            "too many rune pages",
        ] {
            assert!(looks_like_page_limit(body), "{body}");
        }
    }

    #[test]
    fn page_limit_ignores_unrelated_bodies() {
        for body in [
            "name exceeds max length",
            "validation failed: full name",
            "limit must be positive",
            "too many requests",
            "maxpages",
            "homepage limitation",
            "",
        ] {
            assert!(!looks_like_page_limit(body), "{body}");
        }
    }

    #[test]
    fn create_failure_is_page_limit_only_for_4xx_with_a_page_limit_body() {
        assert_eq!(
            classify_create_page_failure(StatusCode::BAD_REQUEST, "Maximum number of pages"),
            "page_limit"
        );
        assert_eq!(
            classify_create_page_failure(StatusCode::BAD_REQUEST, "name exceeds max length"),
            "client_error: 400 Bad Request name exceeds max length"
        );
        assert_eq!(
            classify_create_page_failure(StatusCode::INTERNAL_SERVER_ERROR, "page limit"),
            "client_error: 500 Internal Server Error page limit"
        );
    }

    #[test]
    fn created_page_id_reads_a_positive_integer_id_only() {
        assert_eq!(created_page_id(r#"{"id": 634812602, "name": "x"}"#), Some(634812602));
        assert_eq!(created_page_id(r#"{"id": 0}"#), None);
        assert_eq!(created_page_id(r#"{"id": -4}"#), None);
        assert_eq!(created_page_id(r#"{"id": "12"}"#), None);
        assert_eq!(created_page_id(r#"{"name": "x"}"#), None);
        assert_eq!(created_page_id("not json"), None);
        assert_eq!(created_page_id(""), None);
    }

    #[test]
    fn page_name_has_prefix_and_fits_limit() {
        let n = page_name("Ahri", "Middle");
        assert_eq!(n, "DraftGap: Ahri Middle");
        let long = page_name("Nunu y Willump", "Support");
        assert!(long.starts_with(NAME_PREFIX));
        assert!(long.chars().count() <= PAGE_NAME_MAX_CHARS);
        assert!(!long.ends_with(' '));
        assert!(page_name("Ñandú", "Ñ").starts_with(NAME_PREFIX));
    }

    #[test]
    fn set_title_has_prefix() {
        assert_eq!(set_title("Ahri", "Middle"), "DraftGap: Ahri Middle");
    }

    #[test]
    fn champion_id_parses_positive_integers_only() {
        assert_eq!(parse_champion_id("103"), Ok(103));
        assert!(parse_champion_id("").is_err());
        assert!(parse_champion_id("  ").is_err());
        assert!(parse_champion_id("Ahri").is_err());
        assert!(parse_champion_id("0").is_err());
        assert!(parse_champion_id("-4").is_err());
    }

    #[test]
    fn rune_input_validation() {
        assert!(validate_rune_input(8000, 8100, &PERKS).is_ok());
        assert!(validate_rune_input(0, 8100, &PERKS).is_err());
        assert!(validate_rune_input(8000, -1, &PERKS).is_err());
        assert!(validate_rune_input(8000, 8100, &PERKS[..8]).is_err());
        let mut ten = PERKS.to_vec();
        ten.push(5001);
        assert!(validate_rune_input(8000, 8100, &ten).is_err());
        let mut bad = PERKS;
        bad[3] = 0;
        assert!(validate_rune_input(8000, 8100, &bad).is_err());
    }

    fn input(title: &str, items: &[i64]) -> ItemBlockInput {
        ItemBlockInput {
            title: title.to_owned(),
            items: items.to_vec(),
        }
    }

    #[test]
    fn item_input_limits_block_count() {
        let make = |count| {
            (0..count)
                .map(|_| input("Core", &[6655]))
                .collect::<Vec<_>>()
        };
        for count in [0, 9] {
            assert_eq!(
                validate_item_input(&make(count)),
                Err("invalid_input: expected 1 to 8 item blocks".to_owned())
            );
        }
        assert_eq!(validate_item_input(&make(1)), Ok(()));
        assert_eq!(validate_item_input(&make(8)), Ok(()));
    }

    #[test]
    fn item_input_validates_cleaned_title_length_in_characters() {
        for title in [" \t\n ", &"é".repeat(41)] {
            assert_eq!(
                validate_item_input(&[input(title, &[6655])]),
                Err("invalid_input: item block title must have 1 to 40 characters".to_owned())
            );
        }
        let max = format!("  {}\t  ", "é".repeat(40));
        assert_eq!(validate_item_input(&[input(&max, &[6655])]), Ok(()));
    }

    #[test]
    fn item_input_limits_item_count_in_each_block() {
        let validate = |count| {
            validate_item_input(&[input("Start", &[2003]), input("Core", &vec![6655; count])])
        };
        for count in [0, 13] {
            assert_eq!(
                validate(count),
                Err("invalid_input: expected 1 to 12 items per block".to_owned())
            );
        }
        assert_eq!(validate(1), Ok(()));
        assert_eq!(validate(12), Ok(()));
    }

    #[test]
    fn item_input_requires_positive_ids_in_each_block() {
        for id in [0, -3] {
            assert_eq!(
                validate_item_input(&[input("Start", &[2003]), input("Core", &[6655, id])]),
                Err("invalid_input: item id".to_owned())
            );
        }
    }

    #[test]
    fn perk_page_body_has_nine_ids_styles_and_prefix() {
        let name = page_name("Ahri", "Middle");
        let body = build_perk_page_body(&name, 8000, 8100, &PERKS);
        assert_eq!(body["name"], "DraftGap: Ahri Middle");
        assert_eq!(body["primaryStyleId"], 8000);
        assert_eq!(body["subStyleId"], 8100);
        assert_eq!(body["selectedPerkIds"], json!(PERKS.to_vec()));
        assert_eq!(body["current"], true);
        assert!(body["name"].as_str().unwrap().starts_with(NAME_PREFIX));
    }

    fn page(id: i64, name: &str, editable: bool) -> Value {
        json!({"id": id, "name": name, "isEditable": editable, "current": false})
    }

    #[test]
    fn replaces_only_prefixed_editable_pages() {
        let pages = json!([
            page(1, "My Ahri", true),
            page(2, "DraftGap: Ahri Middle", true)
        ]);
        assert_eq!(choose_page_to_replace(&pages), Ok(Some(2)));
    }

    #[test]
    fn never_picks_user_pages() {
        let pages = json!([
            page(1, "My Ahri", true),
            page(2, "draftgap: lower", true),
            page(3, "x DraftGap: ", true)
        ]);
        assert_eq!(choose_page_to_replace(&pages), Ok(None));
        assert_eq!(choose_page_to_replace(&json!([])), Ok(None));
    }

    #[test]
    fn ignores_non_editable_prefixed_page() {
        let pages = json!([
            page(1, "DraftGap: Ahri Middle", false),
            page(2, "DraftGap: Zed Middle", true)
        ]);
        assert_eq!(choose_page_to_replace(&pages), Ok(Some(2)));
        let only = json!([page(1, "DraftGap: Ahri Middle", false)]);
        assert_eq!(choose_page_to_replace(&only), Ok(None));
    }

    #[test]
    fn unexpected_pages_shape_is_an_error() {
        assert!(choose_page_to_replace(&json!({"a": 1})).is_err());
        assert!(choose_page_to_replace(&Value::Null).is_err());
        assert!(
            choose_page_to_replace(&json!([{"name": "DraftGap: x", "isEditable": true}])).is_err()
        );
    }

    #[test]
    fn item_set_body_shape() {
        let s = build_item_set(
            "DraftGap: Ahri Middle",
            103,
            &[
                input("  Ini\ncio  ", &[2003, 2003, 1056]),
                input("Botas", &[3020]),
                input("Build (en orden)", &[6655, 3020]),
            ],
        );
        assert_eq!(s["title"], "DraftGap: Ahri Middle");
        assert_eq!(s["associatedChampions"], json!([103]));
        assert_eq!(s["associatedMaps"], json!([11]));
        assert_eq!(s["type"], "custom");
        let blocks = s["blocks"].as_array().unwrap();
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0]["type"], "Inicio");
        assert_eq!(blocks[1]["type"], "Botas");
        assert_eq!(blocks[2]["type"], "Build (en orden)");
        assert_eq!(
            blocks[0]["items"],
            json!([{"id": "2003", "count": 2}, {"id": "1056", "count": 1}])
        );
        assert_eq!(blocks[1]["items"], json!([{"id": "3020", "count": 1}]));
        assert_eq!(
            blocks[2]["items"],
            json!([{"id": "6655", "count": 1}, {"id": "3020", "count": 1}])
        );
    }

    #[test]
    fn page_choice_rejects_duplicate_or_non_positive_ids() {
        // A1: a repeated id could point the PUT at a user page.
        let dup = json!([
            {"id": 1, "name": "Mi página", "isEditable": true},
            {"id": 1, "name": "DraftGap: Ahri", "isEditable": true}
        ]);
        assert!(choose_page_to_replace(&dup).is_err());
        let negative = json!([{"id": -3, "name": "DraftGap: Ahri", "isEditable": true}]);
        assert!(choose_page_to_replace(&negative).is_err());
        let zero = json!([{"id": 0, "name": "Mi página", "isEditable": true}]);
        assert!(choose_page_to_replace(&zero).is_err());
    }

    #[test]
    fn page_choice_ignores_odd_names_and_flags() {
        for page in [
            json!({"id": 2, "name": "DraftGap: Ahri"}),
            json!({"id": 2, "name": "DraftGap: Ahri", "isEditable": "true"}),
            json!({"id": 2, "name": null, "isEditable": true}),
            json!({"id": 5, "name": " DraftGap: x", "isEditable": true}),
        ] {
            assert_eq!(choose_page_to_replace(&json!([page])), Ok(None), "{page}");
        }
    }

    #[test]
    fn merge_matches_our_set_by_uid_not_title() {
        // A2/A3: a set the user titled "DraftGap: ..." is theirs and stays.
        let ours = build_item_set("DraftGap: Ahri Medio", 103, &[input("Core", &[6655])]);
        let user_titled = json!({"title": "DraftGap: Ahri", "associatedChampions": [103], "associatedMaps": [11], "uid": "user-1"});
        let merged =
            merge_item_sets(&existing(vec![user_titled.clone()]), ours.clone(), 103).unwrap();
        assert_eq!(merged["itemSets"], json!([user_titled, ours.clone()]));

        // Our previous set (same uid) is replaced in place, even with string ids.
        let mut previous = build_item_set("DraftGap: Ahri Top", 103, &[input("Core", &[1001])]);
        previous["associatedChampions"] = json!(["103"]);
        let a = json!({"title": "A", "uid": "a"});
        let merged = merge_item_sets(
            &existing(vec![a.clone(), previous, json!({"title": "B"})]),
            ours.clone(),
            103,
        )
        .unwrap();
        assert_eq!(merged["itemSets"], json!([a, ours, {"title": "B"}]));
    }

    #[test]
    fn names_cut_by_character_with_accents_and_apostrophes() {
        assert_eq!(page_name("Kai'Sa", "Tirador"), "DraftGap: Kai'Sa Tirador");
        assert_eq!(
            page_name("Ñandúéééééééééééé", "Medio"),
            "DraftGap: Ñandúéééééééééé"
        );
        assert_eq!(page_name("Ah\nri", "Me\tdio"), "DraftGap: Ahri Medio");
    }

    fn user_set(title: &str, champ: i64) -> Value {
        json!({"title": title, "associatedChampions": [champ], "associatedMaps": [11], "uid": title, "extra": 1})
    }

    fn existing(sets: Vec<Value>) -> Value {
        json!({"accountId": 7, "timestamp": 1234, "itemSets": sets})
    }

    #[test]
    fn merge_appends_and_keeps_existing_in_order() {
        let a = user_set("A", 1);
        let b = user_set("DraftGap: Zed Middle", 238);
        let ours = build_item_set("DraftGap: Ahri Middle", 103, &[input("Core", &[6655])]);
        let merged =
            merge_item_sets(&existing(vec![a.clone(), b.clone()]), ours.clone(), 103).unwrap();
        assert_eq!(merged["itemSets"], json!([a, b, ours]));
        assert_eq!(merged["timestamp"], 1234);
        assert_eq!(merged["accountId"], 7);
    }

    #[test]
    fn merge_replaces_our_set_for_same_champion_in_place() {
        let a = user_set("A", 103);
        // Our previous set is the one carrying our uid (see A2/A3).
        let old = build_item_set("DraftGap: Ahri Top", 103, &[input("Core", &[1001])]);
        let c = user_set("C", 5);
        let ours = build_item_set("DraftGap: Ahri Middle", 103, &[input("Core", &[6655])]);
        let merged = merge_item_sets(
            &existing(vec![a.clone(), old, c.clone()]),
            ours.clone(),
            103,
        )
        .unwrap();
        assert_eq!(merged["itemSets"], json!([a, ours, c]));
    }

    #[test]
    fn merge_never_replaces_user_set_for_same_champion() {
        let mine = user_set("My Ahri", 103);
        let ours = build_item_set("DraftGap: Ahri Middle", 103, &[input("Core", &[6655])]);
        let merged = merge_item_sets(&existing(vec![mine.clone()]), ours.clone(), 103).unwrap();
        assert_eq!(merged["itemSets"], json!([mine, ours]));
    }

    #[test]
    fn merge_keeps_prefixed_sets_of_other_champions_or_maps() {
        let other_champ = user_set("DraftGap: Zed Middle", 238);
        let mut other_map = user_set("DraftGap: Ahri ARAM", 103);
        other_map["associatedMaps"] = json!([12]);
        let ours = build_item_set("DraftGap: Ahri Middle", 103, &[input("Core", &[6655])]);
        let merged = merge_item_sets(
            &existing(vec![other_champ.clone(), other_map.clone()]),
            ours.clone(),
            103,
        )
        .unwrap();
        assert_eq!(merged["itemSets"], json!([other_champ, other_map, ours]));
    }

    #[test]
    fn merge_rejects_unexpected_shapes() {
        let ours = build_item_set("DraftGap: Ahri Middle", 103, &[input("Core", &[6655])]);
        for bad in [
            Value::Null,
            json!([]),
            json!({"timestamp": 1}),
            json!({"itemSets": {}, "timestamp": 1}),
            json!({"itemSets": []}),
            json!({"itemSets": [], "timestamp": "x"}),
            json!({"itemSets": [1], "timestamp": 1}),
        ] {
            assert!(merge_item_sets(&bad, ours.clone(), 103).is_err(), "{bad}");
        }
    }
}
