# Стабильность v1

> Что Mado обещает после v1, и что остается свободным для развития.

Mado v1 означает, что публичный app-facing contract достаточно стабилен для
реальных business apps. Это не значит, что каждый внутренний файл, generated
byte, starter copy или diagnostic string заморожены навсегда.

Читайте вместе с:

- [Карта заморозки API](./18-api-freeze-map.md)
- [Порядок reactivity](./19-reactivity-ordering.md)

## Стабильно под SemVer

После v1 Mado считает SemVer-protected:

- Public exports из `@madojs/mado`.
- Public TypeScript types из `@madojs/mado`.
- Side-effect subpath `@madojs/mado/devtools.js`.
- Template binding syntax: child `${}`, `@event`, `.prop`, `?boolean`,
  attribute bindings, directives и `each()`.
- Signal semantics, описанные в reactivity ordering guide.
- Component lifecycle semantics: setup один раз за connection lifetime,
  deferred teardown для same-tick moves, cleanup через `ctx.onDispose`.
- Router/page/resource/form contracts, описанные в English docs.
- Имена CLI commands и широкий смысл команд (`build`, `dev`, `release`,
  `bake`, `preview`, `init`, `new`).

Ломать это можно только в major version.

## Разрешено в minor releases

Minor releases могут добавлять:

- New root exports.
- New options на существующих API.
- New diagnostics и warnings.
- New starters, examples, docs и CLI flags.
- Performance improvements и внутренние rewrites.

Minor release не должен требовать изменений в уже корректных apps.

## Разрешено в patch releases

Patch releases могут исправлять bugs, ужесточать diagnostics, улучшать docs и
делать совместимые implementation changes. Patch может изменить timing только
когда старый timing был незадокументированным bug и новое поведение сохраняет
reactivity ordering contract.

## Нестабильно

Это намеренно не защищено SemVer:

- Internal package subpaths кроме `@madojs/mado/devtools.js`.
- Файлы под `src/`, `dist/src/` и implementation module boundaries.
- `_testHooks`, diagnostics internals и warning codes.
- Точный JavaScript output, chunk names, sourcemap content и bundle byte layout.
- Internal parser, binding, router и resource cache data structures.
- Visual copy и demo data в starters.

Apps не должны импортировать internal files или проверять точный bundle output.

## Bundle и release output

Mado держит size budget и deterministic release tests, но v1 stability не
замораживает byte-for-byte bundler output. Hashes, chunk boundaries и asset
names могут меняться, если задокументированный deployment contract продолжает
работать.

## Если релиз вас сломал

Если update ломает код, который использует только public exports и
задокументированное поведение, считайте это bug. Откройте issue и укажите:

- версию Mado до и после;
- задействованный public API;
- минимальную репродукцию;
- это runtime behaviour, TypeScript types, CLI output или docs.

Если поломка зависит от internal subpath или точного generated output, ее все
равно можно зарепортить, но это не считается SemVer break.
