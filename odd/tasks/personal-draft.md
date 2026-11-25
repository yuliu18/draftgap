# personal-draft

Personal fork of DraftGap (vigovlugt/draftgap, MIT) for one player: draft suggestions weighted by the
player's own match history, read from the League client, with an optional LLM explanation layer.
Branch: `feat/personal-draft`. Upstream stays mergeable: new code lives in new files where possible.

## Specs

- S1. Personalization. User: "si mejor que esté a full personalizado a mi". Chosen option: "Estadística + explicación con LLM" — "Reordena los picks según su champion pool, su winrate por campeón y su forma reciente."
- S2. Base. Chosen option: "Fork de DraftGap (recomendado)" — "Reutiliza su app para Mac, sus datos por parche y la conexión al cliente; añado la personalización dentro."
- S3. Explanation. Chosen option: "Estadística + explicación con LLM" — "Además, un LLM explica cada sugerencia en lenguaje natural. Requiere una clave de API o un modelo local."
- S4. Draft input. Chosen option: "Automática desde el cliente" — "Lee el champ select en vivo por la API local del cliente en su Mac."
- S5. LLM provider. User: "uso qwen 3.8 flash-next de 125b de una cuantización de q2xss creo con strata creo que es rápido y bien." Resolved on this machine: OpenAI-compatible endpoint `https://strata.yusenliu.es/v1`, model id `qwen3.8-flash-next-iq2_xs`. Endpoint, model and key must be configurable; the key is never committed.
- S6. Location. User: "en github en la carpeta /Users/yusenliu/Documents/DEV/Github". Chosen option: "Fork público en GitHub y clon local".
- S7. Without personal history the suggestions must be identical to upstream DraftGap (stated in the approved plan: "sin historial el resultado debe ser idéntico al de DraftGap original").
- S8. Riot policy constraint from the approved plan: "Siempre muestra varias opciones, nunca una orden única"; no automated actions in the client, no memory reading.

## Tasks

- [x] T0 (S2, S6) — fork, clone, install, baseline typecheck and tests. Inline. Commit: none (no changes).
- [x] T1 (S1, S7) — core: personal stats model, personal rating delta, personalized suggestion ordering, tests. Worker. Commit: see `feat(core): add personal draft rating layer`.
- [ ] T2 (S1, S7) — frontend: personal stats store, wiring into suggestions, settings toggle, pool view. Commit: pending.
- [ ] T3 (S1, S4) — import match history from the League client (Tauri command + mapper). Commit: pending.
- [ ] T4 (S3, S5, S8) — LLM explanation panel over an OpenAI-compatible endpoint. Commit: pending.
- [ ] T5 (S4) — live check against a running League client on macOS. Needs the user logged in.

## Log

- L1. Original request (verbatim): "si mejor que esté a full personalizado a mi", after "Será posible crear un itero.gg que sea multiplataforma para mac, linux también? aunque sea uno propio o hacer un port para que corra no sé si es un software privado o si hay algo público."
- L2. Decisions by the user via questionnaire: plan first; fork of DraftGap; statistics + LLM explanation; automatic input from the client; public fork + local clone.
- L3. Baseline at upstream 7e11867 (Release 3.3.0): `bun run typecheck` 3/3 tasks pass; `bun test` in packages/core passes.
- L4. Design decision (agent): personalization is a post-processing step over `getSuggestions` output, in new files under `packages/core/src/personal/`, so upstream analysis code is untouched and S7 holds by construction.
- L5. T1 evidence: RED `bun test src/personal` 0 pass / 3 fail (modules missing); GREEN `bun test` 23 pass / 0 fail in packages/core; `bun run typecheck` clean; prettier clean. No existing file changed.
- L6. Defaults chosen by the agent, to be tuned with real use: priorGames 20, unfamiliarPenalty 30 rating points (about 4 winrate points near 50%), familiarGames 10.
- L7. LCU own match history route confirmed to exist by third-party reports: `lol-match-history/v1/products/lol/current-summoner/matches`. Response shape and page limits not verified; needs a running client (T5).
