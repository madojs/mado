# Структура проєкту

Рекомендована структура Mado-застосунку:

```text
src/
├── main.ts
├── routes.ts
├── pages/
├── components/
├── layouts/
├── lib/
└── styles/
```

## `main.ts`

Точка входу: встановлює глобальні стилі, провайдери контексту та монтує кореневий
компонент у `#app`.

## `routes.ts`

Єдиний manifest маршрутів. Немає file-system routing, груп у назвах папок або
прихованих conventions.

## `pages/`

Одна сторінка — один файл — `export default page({...})`.

## `components/`

Повторно використовувані Web Components. Імпорт файлу реєструє компонент як side
effect.

## `layouts/`

Shell для nested routes: admin layout, marketing layout, authenticated area.

## `lib/`

API-клієнти, contexts, чиста бізнес-логіка без UI.

## `styles/`

Глобальні tokens або shared CSS через `css```. Для app-shell часто зручно
використовувати Light DOM, для leaf-компонентів — Shadow DOM.
