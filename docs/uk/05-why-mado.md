# Чому Mado

Mado не намагається “вбити React” або довести, що всі інші помиляються. Це
інструмент для людей, які хочуть маленький, читабельний frontend runtime поверх
нативного браузера.

## Lit

Lit чудовий для дизайн-систем і компонентів, які мають жити всередині будь-якого
framework. Mado краще підходить, коли ти пишеш увесь застосунок і хочеш router,
data, forms, context і static bake в одному маленькому пакеті.

## Solid

Solid швидший і зріліший. Якщо тобі комфортно з JSX transform, Vite і mature
ecosystem — Solid може бути кращим вибором. Mado обирає інше: browser ESM,
`tsc`, tagged templates і код, який можна прочитати.

## htmx

htmx сильний, коли backend володіє HTML fragments. Mado потрібен тоді, коли все
ж хочеться SPA: локальний UI state, optimistic updates, query params, cached
resources, persisted state і lazy modules.

## React / Vue / Svelte

Вони мають більші ecosystem, більше відповідей у Google/LLM і більше людей на
ринку. Mado виграє не масштабом ecosystem, а ownership: маленький runtime,
нуль runtime-залежностей і зрозумілі правила.

## Головна теза

Mado — не найшвидший у synthetic benchmarks і не найбагатший ecosystem. Його
сенс у тому, що frontend знову можна тримати в голові.
