# Архитектура Forest Hunter

## Цель

Forest Hunter развивается как browser-first Three.js/WebGL FPS с постепенным extraction subsystem boundaries. Runtime сохраняет Three.js entity/orchestration side effects, а детерминированная gameplay-математика и environment ownership вынесены в отдельные модули.

## Bootstrap

`index.html` загружает:

1. `src/core/storage.js` — localStorage JSON boundary.
2. `src/game/config.js` — world/gameplay constants.
3. `src/game/progression.js` — upgrade catalog, XP/level transitions и upgrade eligibility.
4. `src/game/environment.js` — terrain, sky, instancing, decorations, campfires и adaptive visual budget.
5. `src/ai/config.js` — difficulty и boar variants.
6. `src/ai/boar-brain.js` — states, attacker slots, queue spacing, variant/cap/charge policies.
7. `src/weapons/config.js` — weapon/ammo definitions.
8. `src/weapons/geometry.js` — ray/collider geometry.
9. `src/weapons/combat-rules.js` — weapon state, fire gate, damage, reload, deployable и blast rules.
10. `src/audio/audio-system.js` — Web Audio.
11. `src/ui/dom-cache.js` — DOM cache.
12. `src/ui/hud-model.js` — pure HUD presentation model.
13. `src/game/runtime.js` — Three.js entities, input, side effects и frame orchestration.

Pure modules expose CommonJS in addition to browser namespace exports, so contract tests can run under Node without a browser.

## Boundaries

### Boar AI

`boar-brain.js` owns deterministic state policy: attacker capacity, queue movement, charge speed, variant selection and population cap. `Boar` remains in runtime as the Three.js entity/render/animation shell; navigation side effects still use world collision.

### Weapons

`combat-rules.js` owns weapon state, fire gating, deterministic damage modifiers, spread, reload transitions, deployable limits/radii and explosion falloff. `geometry.js` owns ray-vs-cylinder/XZ collision. Mesh creation, raycasts and hit effects remain runtime concerns.

### Environment

`environment.js` owns terrain, sky, grass, hills, dust, instanced trees/bushes/rocks, decorations and campfire animation. Runtime supplies narrow callbacks for collision registration and shootable props.

### Progression / HUD

`progression.js` owns all upgrade definitions and XP-level transitions. `hud-model.js` computes health/XP, weapon statistics, contract/deployable presentation and alive-enemy count; runtime only applies the result to DOM.

## Verification

`tests/contracts.mjs` runs without WebGL and covers:

- boar variant/cap/attacker/queue/charge policies;
- weapon fire/damage/reload/deployable/blast contracts;
- ray/collider geometry;
- XP/level/boss-trigger transitions and upgrade eligibility;
- HUD calculations.

`scripts/validate-structure.mjs` fixes module order and prevents extracted subsystem logic from silently returning to runtime.

CI runs syntax → structural validation → gameplay contract tests → headless Chrome/WebGL boot → diff hygiene.

The browser boot proves initialization to `data-forest-boot="ready"`. Pointer lock, Web Audio, real GPU performance, full enemy behavior and gameplay balance remain interactive/manual verification layers.
