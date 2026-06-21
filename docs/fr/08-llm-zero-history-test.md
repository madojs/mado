# Test LLM sans historique

Ce document définit un test manuel pour vérifier qu'un LLM fraîchement
initialisé écrit du Mado idiomatique au lieu de reproduire React dans des
tagged templates.

## Contexte autorisé

- `AGENTS.md`
- `README.md`
- `docs/fr/07-llm-pitfalls.md` ou la version anglaise
- fichiers de l'espace externe `madojs-examples` seulement si l'agent demande
  un pattern d'application plus large

## Tâche

Construire une petite SPA ticket-admin :

- routes : `/`, `/tickets`, `/tickets/new`, `/tickets/:id`, `*` ;
- mock API en mémoire avec délais async réalistes ;
- liste avec `resource()`, `queryParam()`, `computed()` et `each()` keyed ;
- create/edit avec `useForm()` + `mutation()` + `invalidates` ;
- état UI local avec `signal()`.

## Checklist d'échec

- JSX, `useState`, `useEffect`, `ref`, `$state`, classes custom elements ;
- `${signal()}` là où un child thunk réactif est nécessaire ;
- `disabled=${...}` au lieu de `?disabled=${...}` ;
- `.map()` non-keyed pour des listes dynamiques ;
- `resource()` créé hors contexte lifecycle-aware ;
- nouvelles dépendances runtime ou nouvelles API publiques.

## Notes

L'implémentation historique tickets vit dans l'espace externe d'exemples. Le
core repository ne livre plus cet artefact ; utilisez cette page comme script
d'évaluation manuel quand vous mettez à jour les règles LLM.
