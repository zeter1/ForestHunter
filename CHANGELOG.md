# Changelog

## 2026-09-25 — Web Architecture & CI 2.2

### Deterministic simulation

- Boar state transitions/timers вынесены в `stepBoarState(..., rng)`; runtime исполняет returned movement/damage/animation actions.
- Critical damage roll переведён на injected RNG contract через `rollShotDamage`.
- Reload timeline вынесен в `stepReloadFrame`.
- Deployable arming/lifetime и nearest-target selection разделены на pure simulation contracts.
- Obstacle/prop/boar hit ordering вынесен в `selectHitCandidate`.
- Добавлен `src/core/seeded-rng.js` для воспроизводимых regression scenarios.

### Regression replay

- Добавлен versioned fixture `tests/fixtures/forest-replay.json`.
- `tests/scenarios.mjs` replay-ит 150 boar frames, 20 seeded damage rolls, reload timeline, deployable targeting и hit ordering.
- GitHub Actions запускает deterministic replay scenarios перед headless WebGL boot.
- Replay test поймал edge case: отсутствующая hit-distance (`null`) превращалась через `Number(null)` в `0`; hit selector теперь явно различает missing и real distance.

### Совместимость

Three.js movement, raycasts, effects, audio, pointer lock и damage side effects остаются runtime concerns. Обычный gameplay продолжает использовать `Math.random`; seeded RNG предназначен для regression proof.

## 2026-09-25 — Web Architecture & CI 2.1

### Архитектура

- Environment/InstancedMesh ownership вынесен в `src/game/environment.js`.
- Upgrade catalog и XP/level/boss-trigger transitions вынесены в `src/game/progression.js`.
- Boar attacker/queue/charge/variant/cap policies вынесены в `src/ai/boar-brain.js`; Three.js entity shell сохранён в runtime.
- Weapon state, fire gate, damage, reload, deployable и blast math вынесены в `src/weapons/combat-rules.js`.
- Ray/collider geometry вынесена в `src/weapons/geometry.js`.
- HUD calculations вынесены в `src/ui/hud-model.js`.
- `src/game/runtime.js` сокращён и оставлен side-effect/orchestration boundary.

### Verification

- Добавлен `tests/contracts.mjs` для AI, weapon/reload/deployable, collision, progression и HUD contracts.
- Structural validator фиксирует новые module boundaries.
- GitHub Actions запускает contract tests перед headless Chrome/WebGL boot smoke.
- Floating-point assertions проверяют числовой contract с допуском, а не двоичное представление decimal literal.

### Совместимость

Pointer lock, Web Audio, реальные GPU performance и полный интерактивный gameplay остаются отдельным runtime/manual уровнем проверки.

## 2026-09-25 — Web Portfolio Architecture & CI 2.0

### Изменено

- Большой inline gameplay runtime вынесен из `index.html` в `src/game/runtime.js`.
- Выделены `src/core`, `src/game`, `src/ai`, `src/weapons`, `src/audio` и `src/ui`.
- Config/difficulty/boar variants, weapon definitions, Web Audio и DOM cache перенесены в отдельные subsystem modules.
- LocalStorage access переведён через узкий `src/core/storage.js` boundary.
- Добавлены `docs/ARCHITECTURE.md` и `scripts/validate-structure.mjs`.
- GitHub Actions усилен headless Chrome boot smoke с runtime-ready marker.
- README синхронизирован с текущей архитектурой.

### Совместимость

Основная gameplay logic сохранена и переносится постепенно. Headless smoke подтверждает boot/runtime initialization, но не заменяет интерактивную проверку pointer lock, Web Audio, GPU performance и баланса.
