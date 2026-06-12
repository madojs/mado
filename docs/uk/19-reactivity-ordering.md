# Порядок reactivity

> Малий набір ordering-гарантій, які Mado вважає публічною поведінкою.

Reactivity у Mado синхронна для читання і планована для side effects. Мета —
передбачувані UI updates без великої scheduling-моделі.

## Signals

`signal(value)` повертає getter-функцію. `set(next)` змінює значення одразу,
якщо `Object.is(previous, next)` не дорівнює `true`.

```ts
const count = signal(0);
count.set(1);
count(); // 1, одразу
```

Computed values позначаються до запуску effects, тому effect, який читає
computed, бачить актуальні dependencies, а не застарілий cache.

## Effects

`effect(fn)` запускається один раз одразу. Подальші зміни dependencies планують
один запуск effect у microtask. Тести можуть викликати `flushSync()`, щоб
синхронно очистити чергу.

Якщо effect повертає cleanup-функцію, Mado запускає її перед наступним запуском
effect і ще раз при виклику disposer.

```ts
const stop = effect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});

stop();
```

У компонентах і pages для unmount cleanup надавайте перевагу
`ctx.onDispose()` / page `onDispose()`. Cleanup effect — це cleanup між runs.

## Batch

`batch(fn)` групує записи signals в один subscriber pass. Effects не
запускаються до виходу з найзовнішнього batch, включно з вкладеними batches.

```ts
batch(() => {
  first.set("Ada");
  batch(() => last.set("Lovelace"));
});
// effects бачать тільки фінальну пару
```

Спостережувані `computed({ equals })` також зберігають batch atomicity: вони
перераховуються один раз після зовнішнього batch на повністю застосованому
state. Вони не повинні бачити напівзастосований batch на кшталт
`(new x, old y)`.

## DOM updates

`render(result, container)` перевикористовує наявний template instance, коли
наступний render має ті самі template strings. Для child bindings, що
повертають вкладений `html```, діє те саме правило: ті самі strings оновлюються
на місці, інші strings перебудовують гілку.

Це означає, що непов'язані зміни signals не пересоздають `<input>` у
стабільному вкладеному template, тому focus, DOM state і listeners
зберігаються.

Списки повинні використовувати `each(items, key, renderItem)`. Keys задають DOM
identity. Duplicate keys попереджають у development і отримують positional
suffix, щоб кожен item все одно рендерився, але duplicate keys — це data bug.

## Teardown компонентів

Custom elements можуть отримати `disconnectedCallback()`, а потім
`connectedCallback()` під час same-tick move. Mado відкладає teardown компонента
до microtask і скасовує його при reconnect, тому keyed reorders зберігають
state компонента. Справжнє видалення все одно запускає lifecycle cleanup на
наступній microtask.

## Не гарантується

Mado не гарантує точну кількість internal scheduler microtasks, порядок
незалежних effects без спільних dependencies, форму generated bundle або
внутрішній module layout. Це implementation details.

Invariant tests для цього контракту:

- `test/reactivity-ordering.test.mjs`
- `test/signal-batch-equals.test.mjs`
- `test/update-nested-reuse.test.mjs`
- `test/each-component-state.test.mjs`
