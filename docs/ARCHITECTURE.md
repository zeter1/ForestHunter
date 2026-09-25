# Архитектура Forest Hunter

## Цель

Проект переводится от одного большого inline runtime к модульной browser-first архитектуре без рискованного полного rewrite.

## Bootstrap

`index.html` оставляет HTML/CSS и Three.js CDN bootstrap, а игровой JavaScript загружается в фиксированном порядке:

1. `src/core/storage.js` — безопасный localStorage JSON boundary.
2. `src/game/config.js` — world/gameplay constants.
3. `src/ai/config.js` — difficulty и boar variants.
4. `src/weapons/config.js` — weapon/ammo definitions.
5. `src/audio/audio-system.js` — Web Audio subsystem.
6. `src/ui/dom-cache.js` — централизованный HUD DOM cache.
7. `src/game/runtime.js` — orchestration и оставшаяся gameplay/rendering logic.

Модули используют `globalThis.ForestHunter` как небольшой namespace. Это позволяет делать последовательный extraction без bundler и сохранять простой static hosting.

## Следующие границы

- `Boar`, attack queue и movement → `src/ai/`;
- weapon models, shooting, reloads и deployables → `src/weapons/`;
- environment/InstancedMesh creation → `src/game/`;
- HUD, upgrades, menus → `src/ui/`.

## Verification

`scripts/validate-structure.mjs` проверяет module order и запрещает возврат большого inline runtime.

CI выполняет JavaScript syntax checks, structural validation и headless Chrome boot smoke. Маркер `data-forest-boot="ready"` устанавливается после инициализации renderer/world и первого вызова `animate()`.

Полный gameplay, pointer lock, Web Audio, GPU performance и баланс остаются отдельным runtime/manual уровнем.
