// In-game scouting (S16): read-only snapshot of the ten players of the current
// game. Privacy rule: player identities are only requested in the in-game
// phases (loading screen onwards). In champ select, where players are
// anonymous, nothing but the phase itself is requested.
//
// Rust gathers the raw LCU JSON per player and TypeScript maps it
// (packages/core/src/scouting), as the match history import does: the mapper
// stays a pure, bun-testable function and the Rust side stays thin.

use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

use crate::{get_lcu_response_with_timeout, AppState};

const PHASE_PATH: &str = "lol-gameflow/v1/gameflow-phase";
const SESSION_PATH: &str = "lol-gameflow/v1/session";
const MAX_CONCURRENT_PLAYERS: usize = 4;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(6);
const TOTAL_BUDGET: Duration = Duration::from_secs(20);
const ERROR_LIMIT: usize = 160;

/// The only phases in which names are visible: loading screen, in game and
/// reconnecting. Everything else (ChampSelect, Lobby, None, EndOfGame,
/// WaitingForStats, ...) is refused.
pub fn is_scouting_phase(phase: &str) -> bool {
    matches!(phase, "GameStart" | "InProgress" | "Reconnect")
}

fn is_hex(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Accepts only a UUID-shaped puuid (8-4-4-4-12 hex), so nothing else can be
/// spliced into an LCU path.
pub fn valid_puuid(puuid: &str) -> bool {
    let parts: Vec<&str> = puuid.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8usize, 4, 4, 4, 12])
            .all(|(p, len)| p.len() == len && is_hex(p))
}

pub fn ranked_stats_path(puuid: &str) -> Option<String> {
    valid_puuid(puuid).then(|| format!("lol-ranked/v1/ranked-stats/{puuid}"))
}

pub fn match_history_path(puuid: &str) -> Option<String> {
    valid_puuid(puuid).then(|| {
        format!("lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=19")
    })
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingPlayer {
    /// 1 = teamOne, 2 = teamTwo.
    pub team: u8,
    /// The raw gameflow player entry.
    pub player: Value,
    /// Whether per-player requests were made (false for bots / no puuid).
    pub looked_up: bool,
    pub ranked: Option<Value>,
    pub matches: Option<Value>,
    pub ranked_error: Option<String>,
    pub matches_error: Option<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingResult {
    /// "available" | "not_available"
    pub status: String,
    pub phase: String,
    pub queue_id: Option<i64>,
    pub players: Vec<ScoutingPlayer>,
}

fn not_available(phase: &str) -> ScoutingResult {
    ScoutingResult {
        status: "not_available".to_owned(),
        phase: phase.to_owned(),
        ..Default::default()
    }
}

fn short(e: String) -> String {
    e.chars().take(ERROR_LIMIT).collect()
}

fn is_bot(player: &Value) -> bool {
    if player.get("isBot").and_then(Value::as_bool) == Some(true) {
        return true;
    }
    match player.get("botDifficulty") {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) > 0,
        Some(Value::String(s)) => !matches!(s.as_str(), "" | "NONE" | "0"),
        _ => false,
    }
}

fn lookup_puuid(player: &Value) -> Option<String> {
    if is_bot(player) {
        return None;
    }
    let puuid = player.get("puuid")?.as_str()?;
    valid_puuid(puuid).then(|| puuid.to_owned())
}

async fn scout_player<F, Fut>(
    team: u8,
    player: Value,
    fetch: F,
    deadline: Instant,
) -> ScoutingPlayer
where
    F: Fn(String, Duration) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let mut out = ScoutingPlayer {
        team,
        ..Default::default()
    };
    let puuid = lookup_puuid(&player);
    out.player = player;
    let Some(puuid) = puuid else {
        return out;
    };
    out.looked_up = true;

    // Each lookup is isolated: one failing leaves the other intact.
    let budget = |label: &str| {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            Err(format!("{label}: time budget exceeded"))
        } else {
            Ok(left.min(REQUEST_TIMEOUT))
        }
    };

    match budget("ranked") {
        Ok(t) => match fetch(ranked_stats_path(&puuid).unwrap_or_default(), t).await {
            Ok(v) => out.ranked = Some(v),
            Err(e) => out.ranked_error = Some(short(e)),
        },
        Err(e) => out.ranked_error = Some(e),
    }
    match budget("matches") {
        Ok(t) => match fetch(match_history_path(&puuid).unwrap_or_default(), t).await {
            Ok(v) => out.matches = Some(v),
            Err(e) => out.matches_error = Some(short(e)),
        },
        Err(e) => out.matches_error = Some(e),
    }
    out
}

/// Gate + collection, generic over the fetcher so the privacy gate is testable
/// without a League client. `fetch(path, timeout)` must be a GET.
pub async fn scout_with<F, Fut>(fetch: F) -> Result<ScoutingResult, String>
where
    F: Fn(String, Duration) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<Value, String>> + Send + 'static,
{
    let deadline = Instant::now() + TOTAL_BUDGET;

    // The phase is the ONLY request allowed before the gate.
    let phase_value = fetch(PHASE_PATH.to_owned(), REQUEST_TIMEOUT).await?;
    let phase = phase_value.as_str().unwrap_or("None").to_owned();
    if !is_scouting_phase(&phase) {
        return Ok(not_available(&phase));
    }

    let session = fetch(SESSION_PATH.to_owned(), REQUEST_TIMEOUT).await?;
    // Race guard: the session must agree it is in game.
    if let Some(p) = session.get("phase").and_then(Value::as_str) {
        if !is_scouting_phase(p) {
            return Ok(not_available(p));
        }
    }
    let game_data = session.get("gameData").unwrap_or(&Value::Null);
    let mut entries: Vec<(u8, Value)> = Vec::new();
    for (key, team) in [("teamOne", 1u8), ("teamTwo", 2u8)] {
        if let Some(list) = game_data.get(key).and_then(Value::as_array) {
            entries.extend(list.iter().take(10).map(|p| (team, p.clone())));
        }
    }
    entries.truncate(10);

    let mut players = Vec::with_capacity(entries.len());
    let fetch = Arc::new(fetch);
    for chunk in entries.chunks(MAX_CONCURRENT_PLAYERS) {
        let handles: Vec<_> = chunk
            .iter()
            .cloned()
            .map(|(team, player)| {
                let fetch = fetch.clone();
                tauri::async_runtime::spawn(async move {
                    scout_player(team, player, |p, t| fetch(p, t), deadline).await
                })
            })
            .collect();
        for (handle, (team, player)) in handles.into_iter().zip(chunk.iter().cloned()) {
            match handle.await {
                Ok(p) => players.push(p),
                Err(_) => players.push(ScoutingPlayer {
                    team,
                    player,
                    ..Default::default()
                }),
            }
        }
    }

    Ok(ScoutingResult {
        status: "available".to_owned(),
        phase,
        queue_id: game_data.pointer("/queue/id").and_then(Value::as_i64),
        players,
    })
}

#[tauri::command]
pub async fn get_scouting_snapshot(app: tauri::AppHandle) -> Result<ScoutingResult, String> {
    scout_with(move |path, timeout| {
        let app = app.clone();
        async move {
            let state = app.state::<AppState>();
            get_lcu_response_with_timeout(&state, &path, Some(timeout)).await
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    const PUUID: &str = "bc3dcfd7-1b90-5066-b3a5-8585bdcafc0e";

    #[test]
    fn only_in_game_phases_pass_the_gate() {
        for p in ["GameStart", "InProgress", "Reconnect"] {
            assert!(is_scouting_phase(p), "{p}");
        }
        for p in [
            "ChampSelect",
            "Lobby",
            "None",
            "EndOfGame",
            "WaitingForStats",
            "Matchmaking",
            "ReadyCheck",
            "PreEndOfGame",
            "",
            "inprogress",
        ] {
            assert!(!is_scouting_phase(p), "{p}");
        }
    }

    #[test]
    fn puuid_paths_only_for_uuid_shaped_ids() {
        assert_eq!(
            ranked_stats_path(PUUID).unwrap(),
            format!("lol-ranked/v1/ranked-stats/{PUUID}")
        );
        assert_eq!(
            match_history_path(PUUID).unwrap(),
            format!("lol-match-history/v1/products/lol/{PUUID}/matches?begIndex=0&endIndex=19")
        );
        for bad in [
            "",
            "current-summoner",
            "../lol-summoner/v1/current-summoner",
            &format!("{PUUID}/x"),
            &format!("{PUUID}?a=b"),
            &format!("{PUUID}/.."),
            "bc3dcfd7-1b90-5066-b3a5-8585bdcafc0",
            "bc3dcfd7-1b90-5066-b3a5-8585bdcafc0eX",
            "zc3dcfd7-1b90-5066-b3a5-8585bdcafc0e",
            "bc3dcfd71b9050668b3a58585bdcafc0e00",
            "bc3dcfd7-1b90-5066-b3a5-8585bdcafc0e\n",
        ] {
            assert!(ranked_stats_path(bad).is_none(), "{bad:?}");
            assert!(match_history_path(bad).is_none(), "{bad:?}");
        }
    }

    fn fake(
        phase: &'static str,
        calls: Arc<Mutex<Vec<String>>>,
    ) -> impl Fn(String, Duration) -> std::future::Ready<Result<Value, String>> + Clone + Send + Sync
    {
        move |path, _| {
            calls.lock().unwrap().push(path.clone());
            std::future::ready(if path == PHASE_PATH {
                Ok(json!(phase))
            } else if path == SESSION_PATH {
                Ok(json!({"phase": phase, "gameData": {"queue": {"id": 420},
                    "teamOne": [{"puuid": PUUID, "championId": 1},
                                {"puuid": "", "championId": 2, "isBot": true}],
                    "teamTwo": [{"championId": 3}]}}))
            } else if path.contains("ranked-stats") && path.contains(PUUID) {
                Ok(json!({"queues": []}))
            } else if path.contains("matches") {
                Err("LCU returned 500".to_owned())
            } else {
                Err("unexpected".to_owned())
            })
        }
    }

    #[test]
    fn champ_select_and_other_phases_only_request_the_phase() {
        for phase in ["ChampSelect", "Lobby", "None", "EndOfGame"] {
            let calls = Arc::new(Mutex::new(vec![]));
            let res =
                tauri::async_runtime::block_on(scout_with(fake(phase, calls.clone()))).unwrap();
            assert_eq!(res.status, "not_available");
            assert_eq!(res.phase, phase);
            assert!(res.players.is_empty());
            assert_eq!(
                *calls.lock().unwrap(),
                vec![PHASE_PATH.to_owned()],
                "{phase}"
            );
        }
    }

    #[test]
    fn in_game_collects_players_isolating_failures_and_skipping_bots() {
        let calls = Arc::new(Mutex::new(vec![]));
        let res =
            tauri::async_runtime::block_on(scout_with(fake("InProgress", calls.clone()))).unwrap();
        assert_eq!(res.status, "available");
        assert_eq!(res.queue_id, Some(420));
        assert_eq!(res.players.len(), 3);
        let p0 = &res.players[0];
        assert!(p0.looked_up && p0.ranked.is_some() && p0.matches.is_none());
        assert_eq!(p0.matches_error.as_deref(), Some("LCU returned 500"));
        assert!(!res.players[1].looked_up);
        assert!(!res.players[2].looked_up);
        assert_eq!(res.players[2].team, 2);
        // Only the real player is looked up: phase, session, ranked, matches.
        assert_eq!(calls.lock().unwrap().len(), 4);
    }
}
