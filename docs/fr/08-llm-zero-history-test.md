# Test LLM sans historique

Ce document définit un test de validation pratique pour Mado.

La question n'est pas "un LLM peut-il générer du code frontend ?" Il le peut. La question est :
un LLM fraîchement initialisé peut-il écrire du Mado idiomatique sans retomber dans du code
de forme React ?

## Contexte autorisé

Pour le premier passage, donnez à l'agent uniquement :

- `AGENTS.md`
- `README.md`
- `docs/ru/07-llm-pitfalls.md`
- `examples/basic/README.md` si un tour minimal de l'API est nécessaire
- des fichiers `examples/showcase/**` spécifiques uniquement quand l'agent demande un pattern
  d'application plus grande

L'agent peut rechercher des API ciblées dans `src/` quand il est bloqué, mais ne doit pas
charger tout le framework dans le context.

## Tâche

Construire `examples/tickets` : une petite SPA d'administration de tickets pour un développeur
solo/backend.

Comportement requis :

- routes : `/`, `/tickets`, `/tickets/new`, `/tickets/:id`, `*` ;
- API mock en mémoire avec des délais async réalistes ;
- page de liste avec `resource()`, `queryParam()` filtres de recherche/statut, `computed()`,
  et des lignes `each()` avec clés ;
- flux de création et d'édition avec `useForm()` + `mutation()` + `invalidates` ;
- état UI local avec `signal()` ;
- composants shell, metric et badge avec slot pour une UI admin plus réaliste ;
- test de smoke important le build de l'exemple.

## Liste de contrôle des échecs

Cherchez ces éléments après l'implémentation :

- JSX, `useState`, `useEffect`, `ref`, `$state`, ou composants de style classe ;
- `${signal()}` ou `${signal() + 1}` là où un thunk enfant réactif est requis ;
- `disabled=${...}` au lieu de `?disabled=${...}` ;
- listes dynamiques rendues avec un mapping de tableau sans clé au lieu de `each()` ;
- imports ESM navigateur sans `.js` ;
- `resource()` créé en dehors du setup du composant ;
- nouvelles dépendances runtime ou nouvelles API publiques du framework.

## Notes de résultats

L'implémentation actuelle de `examples/tickets` n'a pas nécessité de nouvelles API publiques ni
de dépendances runtime.

CI exécute `npm run llm:smoke` comme proxy déterministe pour cette tâche :
il vérifie que `llms.txt` contient toujours les règles clés, compare l'artefact
commité `examples/tickets` à la surface API Mado requise et aux failure
patterns, puis build le projet et lance `test/tickets-smoke.test.mjs`.

Le principal point de pression dans la documentation reste le lifecycle : les anciens exemples
peuvent donner l'impression qu'il est acceptable de créer `resource()` directement dans
`page.view()`. L'exemple tickets utilise plutôt des composants wrapper au niveau page, de sorte
que les resources sont enregistrées à l'intérieur du setup du composant et se nettoient avec
le composant.
