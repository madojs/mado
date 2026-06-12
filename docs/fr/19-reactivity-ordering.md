# Ordre de la réactivité

> Le petit ensemble de garanties d'ordre que Mado traite comme comportement public.

La réactivité de Mado est synchrone pour les lectures et planifiée pour les
side effects. Le but est une mise à jour UI prévisible plutôt qu'un grand modèle
de scheduling.

## Signals

`signal(value)` renvoie une fonction getter. `set(next)` change la valeur
immédiatement sauf si `Object.is(previous, next)` vaut `true`.

```ts
const count = signal(0);
count.set(1);
count(); // 1, immédiatement
```

Les computed values sont marquées avant l'exécution des effects : un effect qui
lit un computed observe les dépendances courantes, pas un cache obsolète.

## Effects

`effect(fn)` s'exécute une première fois immédiatement. Les changements
ultérieurs de dépendances planifient une seule exécution en microtask. Les tests
peuvent appeler `flushSync()` pour vider cette file de façon synchrone.

Si un effect retourne une fonction de cleanup, Mado l'exécute avant l'exécution
suivante de l'effect et à nouveau quand le disposer est appelé.

```ts
const stop = effect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});

stop();
```

Dans les composants et pages, préférez `ctx.onDispose()` / page `onDispose()`
pour le cleanup à l'unmount. Le cleanup d'un effect est un cleanup par run.

## Batch

`batch(fn)` regroupe les écritures de signals en un seul passage des
subscribers. Les effects ne s'exécutent pas avant la sortie du batch le plus
extérieur, y compris avec des batches imbriqués.

```ts
batch(() => {
  first.set("Ada");
  batch(() => last.set("Lovelace"));
});
// les effects ne voient que la paire finale
```

Les `computed({ equals })` observés préservent aussi l'atomicité du batch : ils
se recalculent une fois après le batch extérieur, sur l'état entièrement
appliqué. Ils ne doivent pas observer un batch à moitié appliqué comme
`(new x, old y)`.

## Mises à jour DOM

`render(result, container)` réutilise l'instance de template existante quand le
render suivant a les mêmes template strings. Pour les child bindings qui
retournent un `html``` imbriqué, la même règle s'applique : mêmes strings =
mise à jour sur place, autres strings = reconstruction de cette branche.

Ainsi, des changements de signals sans rapport ne recréent pas un `<input>`
dans un template imbriqué stable : focus, état DOM et listeners survivent.

Les listes doivent utiliser `each(items, key, renderItem)`. Les keys définissent
l'identité DOM. Les duplicate keys avertissent en development et retombent sur
un suffixe positionnel pour que chaque item soit rendu, mais les duplicate keys
sont un bug de données.

## Teardown des composants

Les custom elements peuvent recevoir `disconnectedCallback()` puis
`connectedCallback()` pendant un déplacement dans le même tick. Mado diffère le
teardown du composant jusqu'à une microtask et l'annule si l'élément est
reconnecté, donc les reorders keyed préservent l'état du composant. Une vraie
suppression lance tout de même le cleanup lifecycle à la microtask suivante.

## Non garanti

Mado ne garantit pas le nombre exact de microtasks internes du scheduler,
l'ordre des effects indépendants sans dépendances communes, la forme du bundle
généré ni le layout interne des modules. Ce sont des détails d'implémentation.

Les tests invariants de ce contrat vivent dans :

- `test/reactivity-ordering.test.mjs`
- `test/signal-batch-equals.test.mjs`
- `test/update-nested-reuse.test.mjs`
- `test/each-component-state.test.mjs`
