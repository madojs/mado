# LLM Zero-History Test

Мета тесту: перевірити, чи може LLM без попередньої історії написати ідіоматичний
Mado CRUD, не перетворюючи його на React у tagged templates.

## Дозволений контекст

- `AGENTS.md`
- `README.md`
- `docs/uk/07-llm-pitfalls.md` або відповідна англійська версія
- `examples/basic/README.md`
- конкретні файли прикладів тільки за потреби

## Що перевіряти

- Немає JSX, `useState`, `useEffect`.
- Немає signal `.value`.
- Reactive child bindings з `count()` обгорнуті у `() =>`.
- Boolean attributes пишуться як `?disabled`, `?checked`.
- Динамічні списки використовують `each()`.
- Imports мають `.js`.
- `resource()` створюється в lifecycle-aware контексті.

## Артефакт

`examples/tickets` — маленький ticket-admin SPA з routes, mock API, forms,
resources, mutations, invalidation, `queryParam`, `computed`, `signal` і
keyed lists.

Критерій успіху: код виглядає як Mado, а не як React/Vue, переодягнений у
template strings.
