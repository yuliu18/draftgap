use std::time::Duration;

use serde_json::Value;

use crate::{get_lcu_response_with_timeout, AppState};

const SOLO_QUEUE: &str = "RANKED_SOLO_5x5";

fn solo_tier(response: &Value) -> Option<&str> {
    let tier = response
        .get("queueMap")?
        .get(SOLO_QUEUE)?
        .get("tier")?
        .as_str()?;
    match tier {
        "IRON" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "EMERALD" | "DIAMOND" | "MASTER"
        | "GRANDMASTER" | "CHALLENGER" => Some(tier),
        _ => None,
    }
}

#[tauri::command]
pub async fn get_own_rank(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    // An unreachable client or an unranked player is "no rank", never an error.
    let response = get_lcu_response_with_timeout(
        &state,
        "lol-ranked/v1/current-ranked-stats",
        Some(Duration::from_secs(5)),
    )
    .await
    .ok();
    Ok(response.as_ref().and_then(solo_tier).map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_current_solo_tier_and_ignores_flex_and_highest_rank() {
        let fixture = json!({"queueMap": {
            "RANKED_SOLO_5x5": { "tier": "GOLD", "highestTier": "PLATINUM" },
            "RANKED_FLEX_SR": { "tier": "DIAMOND" }
        }});
        assert_eq!(solo_tier(&fixture), Some("GOLD"));
    }

    #[test]
    fn unranked_or_unavailable_solo_tier_is_none() {
        for response in [
            json!({"queueMap": {"RANKED_FLEX_SR": {"tier": "GOLD"}}}),
            json!({"queueMap": {"RANKED_SOLO_5x5": {"tier": "NONE"}}}),
            Value::Null,
        ] {
            assert_eq!(solo_tier(&response), None);
        }
    }
}
