# Налаштування IDE

Mado використовує tagged templates `html`` і `css``. Для TypeScript це звичайні
рядки, тому підсвітка HTML/CSS залежить від IDE.

## VS Code

Рекомендовано встановити `lit-plugin` або інше розширення, яке розуміє
`html``/`css`` tagged templates.

## WebStorm

WebStorm зазвичай розуміє tagged templates без додаткового налаштування.

## Neovim / Helix

Можна використовувати LSP/плагіни для lit-html або inline HTML у template
strings.

## Що IDE не перевірить

- Чи правильно ти обгорнув `count()` у `() => count()`.
- Чи варто використовувати `?disabled` замість `disabled`.
- Чи є `.js` у browser ESM imports.

Для цього потрібні правила з `AGENTS.md`, тести та уважний review.
