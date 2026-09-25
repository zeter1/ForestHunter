# Changelog

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
