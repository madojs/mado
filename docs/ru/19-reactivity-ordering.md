# Порядок reactivity

> Небольшой набор ordering-гарантий, которые Mado считает публичным поведением.

Reactivity в Mado синхронна для чтения и планирует side effects. Цель —
предсказуемые UI-обновления без большой scheduling-модели.

## Signals

`signal(value)` возвращает getter-функцию. `set(next)` меняет значение сразу,
если `Object.is(previous, next)` не вернул `true`.

```ts
const count = signal(0);
count.set(1);
count(); // 1, сразу
```

`computed` помечается до запуска effects, поэтому effect, читающий computed,
видит актуальные dependencies, а не старый кеш.

## Effects

`effect(fn)` запускается один раз сразу. Последующие изменения dependencies
планируют один запуск effect в microtask. В тестах можно вызвать `flushSync()`,
чтобы синхронно очистить очередь.

Если effect возвращает cleanup-функцию, Mado запускает ее перед следующим
запуском effect и еще раз при вызове disposer.

```ts
const stop = effect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});

stop();
```

В компонентах и pages для unmount cleanup предпочитайте `ctx.onDispose()` /
page `onDispose()`. Cleanup effect — это cleanup между запусками.

## Batch

`batch(fn)` группирует записи signals в один subscriber pass. Effects не
запускаются до выхода из внешнего batch, включая вложенные batches.

```ts
batch(() => {
  first.set("Ada");
  batch(() => last.set("Lovelace"));
});
// effects увидят только финальную пару
```

Наблюдаемые `computed({ equals })` также сохраняют batch atomicity: они
пересчитываются один раз после внешнего batch на полностью примененном state.
Они не должны видеть половинчатый batch вроде `(new x, old y)`.

## DOM updates

`render(result, container)` переиспользует существующий template instance, когда
следующий render имеет те же template strings. Для child bindings, возвращающих
вложенный `html```, действует то же правило: те же strings обновляются на
месте, другие strings пересобирают ветку.

Это значит, что несвязанные изменения signals не пересоздают `<input>` внутри
стабильного вложенного template, поэтому focus, DOM state и listeners
сохраняются.

Списки должны использовать `each(items, key, renderItem)`. Keys задают DOM
identity. Duplicate keys предупреждают в development и получают positional
suffix, чтобы все элементы все равно отрендерились, но duplicate keys — это
ошибка данных.

## Teardown компонентов

Custom elements могут получить `disconnectedCallback()`, а затем
`connectedCallback()` во время same-tick move. Mado откладывает teardown
компонента до microtask и отменяет его при reconnect, поэтому keyed reorders
сохраняют state компонента. Настоящее удаление все равно запускает cleanup на
следующей microtask.

## Не гарантируется

Mado не гарантирует точное число внутренних scheduler microtasks, порядок
независимых effects без общих dependencies, форму generated bundle или
внутреннюю структуру modules. Это детали реализации.

Invariant tests для этого контракта:

- `test/reactivity-ordering.test.mjs`
- `test/signal-batch-equals.test.mjs`
- `test/update-nested-reuse.test.mjs`
- `test/each-component-state.test.mjs`
