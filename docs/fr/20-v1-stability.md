# Stabilité v1

> Ce que Mado promet après v1, et ce qui reste libre d'évoluer.

Mado v1 signifie que le contrat public côté application est assez stable pour
de vraies applications métier. Cela ne veut pas dire que chaque fichier interne,
octet généré, starter copy ou diagnostic string est gelé pour toujours.

À lire avec :

- [Carte de gel de l'API](./18-api-freeze-map.md)
- [Ordre de la réactivité](./19-reactivity-ordering.md)

## Stable sous SemVer

Après v1, Mado considère comme protégés par SemVer :

- Les exports publics de `@madojs/mado`.
- Les types TypeScript publics exportés depuis `@madojs/mado`.
- Le subpath side-effect `@madojs/mado/devtools.js`.
- La syntaxe de template binding : child `${}`, `@event`, `.prop`,
  `?boolean`, attribute bindings, directives et `each()`.
- Les semantics des signals documentées dans le guide d'ordre de réactivité.
- Les semantics du lifecycle composant : setup une fois par connection
  lifetime, teardown différé pour les same-tick moves, cleanup via
  `ctx.onDispose`.
- Les contrats router/page/resource/form documentés dans les docs anglaises.
- Les noms de commandes CLI et leur intention générale (`build`, `dev`,
  `release`, `bake`, `preview`, `init`, `new`).

Casser cela nécessite une version majeure.

## Autorisé en minor releases

Les minor releases peuvent ajouter :

- De nouveaux root exports.
- De nouvelles options sur des API existantes.
- De nouveaux diagnostics et warnings.
- De nouveaux starters, examples, docs et flags CLI.
- Des améliorations de performance et des rewrites internes.

Une minor release ne devrait pas forcer les apps correctes existantes à changer
leur code.

## Autorisé en patch releases

Les patch releases peuvent corriger des bugs, durcir les diagnostics, améliorer
les docs et faire des changements d'implémentation compatibles. Un patch peut
changer le timing seulement si l'ancien timing était un bug non documenté et
que le changement conserve le contrat d'ordre de réactivité.

## Non stable

Ne sont volontairement pas protégés par SemVer :

- Les subpaths internes du package autres que `@madojs/mado/devtools.js`.
- Les fichiers sous `src/`, `dist/src/` et les frontières de modules
  d'implémentation.
- `_testHooks`, internals de diagnostics et warning codes.
- Le JavaScript exact généré, les noms de chunks, le contenu sourcemap et le
  byte layout du bundle.
- Les structures internes du parser, des bindings, du routeur et du cache
  resource.
- Le texte visuel et les données de démonstration des starters.

Les apps ne doivent pas importer de fichiers internes ni vérifier l'output exact
du bundle.

## Bundle et output de release

Mado gardera un size budget et des tests de release déterministe, mais la
stabilité v1 ne fige pas l'output du bundler octet par octet. Les hashes,
frontières de chunks et noms d'assets générés peuvent changer tant que le
contrat de déploiement documenté continue de fonctionner.

## Si une release vous casse

Si une mise à jour casse du code qui utilise seulement les exports publics et le
comportement documenté, traitez-le comme un bug. Ouvrez une issue avec :

- la version de Mado avant et après ;
- l'API publique impliquée ;
- une reproduction minimale ;
- si la casse concerne le runtime, les types TypeScript, l'output CLI ou les docs.

Si la casse dépend d'un subpath interne ou de l'output généré exact, cela peut
quand même valoir un rapport, mais ce n'est pas considéré comme une casse SemVer.
