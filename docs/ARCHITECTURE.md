# Архитектура Forest Hunter

## Цель

Forest Hunter развивается как browser-first Three.js/WebGL FPS с постепенным extraction subsystem boundaries. В 2.2 runtime ещё сильнее отделён от deterministic simulation: AI transitions, stochastic damage roll, reload/deployable timelines и hit ordering можно replay-ить без WebGL.

## Bootstrap

`index.html` загружает:

1. `src/core/storage.js` — localStorage JSON boundary.
2. `src/core/seeded-rng.js` — deterministic PRNG для regression replay.
3. `src/game/config.js` — world/gameplay constants.
4. `src/game/progression.js` — upgrades и XP transitions.
5. `src/game/environment.js` — terrain/instancing/decorations.
6. `src/ai/config.js` — difficulty/variants.
7. `src/ai/boar-brain.js` — boar state simulation + attacker/queue/charge policy.
8. `src/weapons/config.js` — weapon definitions.
9. `src/weapons/geometry.js` — collision geometry.
10. `src/weapons/combat-rules.js` — fire/damage/reload/deployable/hit-order simulation.
11. `src/audio/audio-system.js` — Web Audio.
12. `src/ui/dom-cache.js` — DOM cache.
13. `src/ui/hud-model.js` — HUD model.
14. `src/game/runtime.js` — Three.js entities, input, raycasts/effects и side-effect orchestration.

## Deterministic simulation boundary

### Boar entity decisions

`stepBoarState(state, context, dt, rng)` владеет переходами IDLE/PATROL/ALERT/CHASE/CHARGE/ATTACK, timers и stochastic cooldown/patrol generation. Runtime передаёт distance/world context и исполняет returned actions через Three.js movement, damage и animation.

### Combat timeline

`rollShotDamage(..., rng)` отделяет stochastic crit roll от rendering. `stepReloadFrame` моделирует reload timeline. `advanceDeployableState` + `selectDeployableTarget` отделяют arming/lifetime/nearest-target policy от mesh side effects. `selectHitCandidate` фиксирует ordering obstacle/prop/boar после raycasts.

### Replay fixtures

`tests/fixtures/forest-replay.json` + `tests/scenarios.mjs` воспроизводят:

- 150 кадров boar CHASE → CHARGE → ATTACK;
- 20 seeded damage rolls с deadly-shot cadence;
- полный reload timeline;
- hit-order и deployable target contracts.

Это дополняет unit-style `tests/contracts.mjs` последовательностными regression scenarios.

## Verification

CI выполняет:

`syntax → structural validation → contract tests → deterministic replay scenarios → headless Chrome/WebGL boot → diff hygiene`.

Headless boot подтверждает initialization до `data-forest-boot="ready"`. Pointer lock, Web Audio, реальный GPU performance, feel стрельбы и полный баланс остаются interactive/manual proof layers.
