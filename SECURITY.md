# Security Policy

Forest Hunter — browser-only WebGL game. Игра использует browser storage для настроек/рекордов и внешние CDN для загрузки Three.js.

## Как сообщить об уязвимости

Потенциально опасные детали лучше сначала отправлять приватно:

- Email: zeter11@gmail.com
- Telegram: https://t.me/zeter1

Укажите браузер, затронутую ревизию, минимальные шаги, влияние и безопасный proof-of-concept.

## Важные области

Особенно полезны сообщения о:

- XSS / script injection;
- небезопасной обработке данных из `localStorage`;
- неожиданном выполнении/подмене внешнего CDN content;
- проблемах browser sandbox boundary;
- утечке данных профиля браузера.

Не публикуйте cookies, токены, приватные данные профиля или другие секреты.
