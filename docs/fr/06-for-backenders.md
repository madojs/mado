# Mado pour les développeurs backend

> Vous écrivez en Go / Rust / .NET / Java / Python et vous devez construire une UI web.  
> Cette page est le modèle mental de Mado en 10 minutes, dans votre langage.

---

## L'analogie principale

Mado est structuré **comme un serveur HTTP**. Sérieusement :

| Monde serveur | Mado |
|---|---|
| Routeur HTTP (chi, axum, mux) | `routes()` — manifeste de chemins |
| Handler `func(req, resp)` | `page({ view: (ctx) => html\`...\` })` |
| Middleware | `layout` dans `nested()` (enveloppe le handler) |
| Moteur de template (Jinja, Handlebars) | tagged template `html\`\`` |
| Client HTTP avec cache | `resource()` — fetch + cache + invalidation |
| Variable réactive / atom | `signal()` — getter réactif |
| Goroutine de fond / tâche | `effect()` — se ré-exécute automatiquement quand un signal change |
| `defer cleanup()` | `ctx.onDispose(fn)` dans le setup du composant |
| Variables ENV | `createContext()` + `provide()`/`inject()` |

Si vous comprenez un serveur HTTP, vous comprenez Mado.

---

## Structure de fichiers — comme une application ordinaire

```
src/
├── routes.ts         ← manifeste de chemins (comme router.go dans chi)
├── main.ts           ← point d'entrée (comme main.go : setup + run)
├── pages/            ← un fichier par page (comme handler.go)
├── components/       ← UI réutilisable (comme helpers/)
├── layouts/          ← wrappers pour des groupes de pages (comme middleware/)
└── lib/              ← logique métier, client API (comme service/, repo/)
```

Un fichier = une page. Pas de routage magique basé sur les fichiers — tout est déclaré à la main dans `routes.ts`.

---

## Hello World — analogie serveur

### Go (chi) — pour comparaison

```go
r := chi.NewRouter()
r.Get("/", func(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("<h1>Bonjour</h1>"))
})
r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    fmt.Fprintf(w, "<h1>Utilisateur %s</h1>", id)
})
http.ListenAndServe(":8080", r)
```

### Mado — la même chose

```ts
// src/routes.ts
import { routes } from "@madojs/mado";

export default routes({
  "/": () => import("./pages/home.js"),
  "/users/:id": () => import("./pages/user.js"),
});
```

```ts
// src/pages/home.ts
import { page, html } from "@madojs/mado";
export default page({
  view: () => html`<h1>Bonjour</h1>`,
});
```

```ts
// src/pages/user.ts
import { page, html } from "@madojs/mado";
export default page<{ id: string }>({
  view: ({ params }) => html`<h1>Utilisateur ${params.id}</h1>`,
});
```

Les paramètres de chemin sont disponibles dans `params` — exactement comme `chi.URLParam`.

---

## Signals — une variable réactive

Si vous avez écrit Erlang/Elixir avec `Agent`, ou Rust avec `Arc<Mutex<T>>`, ou simplement
stocké de l'état dans une struct et l'avez mis à jour — `signal` est la même chose, plus
le **re-rendu automatique** des composants qui lisent cet état.

```ts
import { signal, effect } from "@madojs/mado";

// "variable" avec abonnement
const count = signal(0);

// lecture
console.log(count()); // 0

// écriture
count.set(5);

// "goroutine" qui s'exécute à chaque changement
effect(() => {
  console.log("count vaut maintenant", count());
});
// → affichera "count vaut maintenant 5"

count.set(10);
// → affichera "count vaut maintenant 10"
```

Pas de règles comme "ne peut pas être utilisé dans une condition". Un signal est juste une
fonction getter. Là où il est lu — c'est là que l'abonnement est créé.

---

## `resource()` — client HTTP avec cache (comme `cache.GetOrSet`)

C'est l'**abstraction la plus utile pour un développeur backend**. C'est comme Redis avec
invalidation automatique, mais dans le navigateur.

```ts
import { resource, mutation, jsonFetcher, invalidate } from "@madojs/mado";

// "référentiel d'utilisateurs"
const userId = signal(1);

const user = resource(
  () => `/api/users/${userId()}`,         // clé de cache (réactive !)
  jsonFetcher<User>(),                    // comment charger
  { staleTime: 60_000 },                  // cache de 60 secondes
);

// dans le composant :
user.data();     // User | undefined
user.error();    // Error | null
user.loading();  // boolean

// mutation (comme POST/PUT)
const save = mutation<User, User>(
  (u) => fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then(r => r.json()),
  { invalidates: ["/api/users*"] },  // invalidation glob — comme `cache.Drop("users:*")`
);

await save.run(newUser);
// automatiquement : user.data() se mettra à jour si le glob correspond
```

Si une telle abstraction existait dans le monde Go pour les caches côté serveur — on
pleurerait tous de joie.

---

## Composants = handler avec sa propre mémoire

Un composant est un **handler** qui rend son bout d'UI. Il possède :

- des paramètres (attributs/propriétés) ;
- un état interne (`signal`s) ;
- un lifecycle : `connectedCallback` (comme Init), `disconnectedCallback` (comme Close).

```ts
import { component, html, signal } from "@madojs/mado";

component("x-counter", () => {
  const count = signal(0);

  return () => html`
    <button @click=${() => count.update(n => n + 1)}>
      Clics : ${count}
    </button>
  `;
});
```

Utilisation :

```ts
html`<x-counter></x-counter>`
```

Nous enregistrons le tag `<x-counter>` dans le navigateur — il devient une "fonction" qui
peut être insérée dans le HTML. C'est un mécanisme **natif** du navigateur (Web Components),
Mado ne fait que le coller avec les signals.

---

## Forms — comme `form.Validate()` côté backend

Mado utilise une **validation par schéma proche des contraintes HTML natives**, plus le suivi d'état.

```ts
import { useForm } from "@madojs/mado";

const f = useForm({
  email: { required: true, type: "email" },
  age:   { required: true, type: "number", min: 18 },
});

// dans le template :
html`
  <form @submit=${f.onSubmit(async (v) => {
    await api.save(v);
    f.reset();
  })}>
    <input name="email" .value=${() => f.values().email ?? ""}
           @input=${f.onInput} @blur=${f.onBlur} />
    
    ${() => f.errors().email && f.touched().email
      ? html`<small>${f.errors().email}</small>`
      : null}
    
    <button ?disabled=${() => !f.isValid() || f.submitting()}>Enregistrer</button>
  </form>
`;
```

Validation personnalisée — `validate: (values) => errors | null`. Pas de schémas Yup ni de dépendances.

---

## Context = DI / injection de dépendances

Tout comme vous passez `context.Context` à travers la pile d'appels en Go — dans Mado le
context est propagé à travers l'arbre DOM.

```ts
import { createContext, provide, inject } from "@madojs/mado";

// déclarer le "type" de la dépendance
const ApiCtx = createContext<ApiClient>(defaultApiClient);

// dans le composant racine — fournir
component("x-app", ({ host }) => {
  provide(host, ApiCtx, new ApiClient("https://api.example.com"));
  return () => html`<x-page/>`;
});

// dans n'importe quel enfant — consommer
component("x-page", ({ host }) => {
  const api = inject(host, ApiCtx);  // signal<ApiClient>
  return () => html`<div>Version API : ${() => api().version}</div>`;
});
```

C'est comme `context.WithValue` / `ctx.Value` en Go, mais réactif.

---

## SEO — pas du SSR, mais `bake` (comme `templ generate` en Go)

Si vous êtes habitué au rendu côté serveur pour le SEO, dans Mado c'est résolu différemment :
**prérendu au moment du build**.

```ts
// src/pages/product.ts
export default page({
  bake: {
    paths: () => api.allProductSlugs(),   // fetch au build-time
    data: ({ slug }) => api.getProduct(slug),
    revalidate: 3600,
  },
  head: ({ slug }, data) => ({
    description: data.description,
    canonical: `/product/${slug}`,
    og: { title: data.name, image: data.image },
  }),
  view: ({ params }) => html`<x-product data-slug=${params.slug}/>`,
});
```

```bash
npm run bake   # → out/product/iphone-15/index.html (+ sitemap)
```

Le crawler voit du HTML prêt avec des meta tags. L'utilisateur voit la même chose + interactivité
après le chargement du JS.

Plus de détails : [`03-static-bake.md`](./03-static-bake.md).

---

## Tâches typiques d'un développeur backend — recettes

### Page CRUD avec une liste

```ts
import { page, html, resource, each, signal } from "@madojs/mado";

export default page({
  view: () => {
    const users = resource(() => "/api/users", jsonFetcher<User[]>());
    
    return html`
      ${() => users.loading() ? html`<p>Chargement…</p>` : null}
      ${() => users.error() ? html`<p>Erreur : ${users.error()!.message}</p>` : null}
      <ul>
        ${() => each(users.data() ?? [], u => u.id, u => html`
          <li><a href="/users/${u.id}" data-link>${u.name}</a></li>
        `)}
      </ul>
    `;
  },
});
```

### Formulaire avec POST

```ts
import { useForm, mutation } from "@madojs/mado";

const createUser = mutation<NewUser, User>(
  (u) => fetch("/api/users", { method: "POST", body: JSON.stringify(u) }).then(r => r.json()),
  { invalidates: ["/api/users*"] },
);

// dans page.view :
const f = useForm({ name: { required: true } });

html`
  <form @submit=${f.onSubmit(async (v) => {
    await createUser.run(v);
    navigate("/users");
  })}>
    <input name="name" @input=${f.onInput}>
    <button>Créer</button>
  </form>
`;
```

### Zone protégée (middleware auth)

```ts
// src/layouts/auth-layout.ts
import { page, html, effect } from "@madojs/mado";
import { isAuthed, navigate } from "../lib/auth.js";

export default page({
  view: ({ child }) => {
    effect(() => {
      if (!isAuthed()) navigate("/login");
    });
    return html`<div class="app-shell">${child}</div>`;
  },
});
```

```ts
// src/routes.ts
import { routes, nested } from "@madojs/mado";

export default routes({
  "/login": () => import("./pages/login.js"),

  "/app/*": nested({
    layout: () => import("./layouts/auth-layout.js"),
    routes: {
      "dashboard": () => import("./pages/dashboard.js"),
      "users": () => import("./pages/users.js"),
    },
  }),
});
```

### Client API global (comme un singleton en Go)

```ts
// src/lib/api.ts
export class ApiClient {
  constructor(private base: string) {}
  get<T>(path: string): Promise<T> {
    return fetch(this.base + path).then(r => r.json());
  }
}

export const api = new ApiClient("/api");
```

Utilisé directement via `import { api } from '...'` ou via `createContext` pour la testabilité.

---

## Ce que vous n'avez **pas** besoin d'apprendre (bonne nouvelle)

- **Hooks et règles des hooks.** Pas dans Mado. Les signals sont des fonctions ordinaires.
- **VDOM et réconciliation.** Aucun. Les signals mettent à jour le DOM directement, chirurgicalement.
- **Configurations Webpack/Vite.** Pas de build. `tsc → navigateur`.
- **Tableaux de dépendances `useEffect`.** `effect()` voit ce que vous lisez de lui-même.
- **Bibliothèques de gestion d'état** (Redux/Zustand). Signals + context.
- **Transformations CSS-in-JS.** Shadow DOM + `css\`\`` + cssVars.
- **Guide de migration routing v6 → v7.** `routes()` fait 500 lignes, lisible en 20 minutes.

---

## Ce que vous **devrez** apprendre (honnêtement)

Ce sont de nouveaux concepts. Pas effrayants, mais ce sont des additions à votre base React/Vue :

1. **Custom Elements / Shadow DOM.** `<x-foo>` n'est pas une div, c'est un élément à part entière avec son propre DOM. Slots, CSS scopé. Une soirée de lecture MDN.
2. **`attribute` vs `property`.** L'attribut est une string en HTML (`data-id="5"`), la property est une propriété JS (`el.id = 5`). `?attr=${flag}` et `.prop=${value}` dans les templates se réfèrent à des choses différentes. Règle principale : **nombres/objets/tableaux — via `.prop`, drapeaux — via `?attr`, strings — via `attr`**.
3. **Signals.** Si c'est votre première fois — vous bloquerez 10 minutes, puis c'est plus facile que les hooks.
4. **templates `html\`\``.** C'est juste une fonction JS avec coloration via [lit-plugin](./04-ide-setup.md). Pas de magie.

Tout le reste — navigateur standard + TypeScript.

---

## Ce qui manque (honnêtement)

- Pas de hot reload, seulement un rechargement complet via SSE. Suffisant pour la plupart des cas, mais pas comme Vite.
- Pas d'extension navigateur dev-tools. Utilisez `localStorage.madoDebug = '1'` + console.
- Pas de starters StackBlitz (encore).
- Pas d'assistant IA qui connaît Mado aussi bien que React. En cas de doute — lisez `src/`, c'est pas effrayant.

---

## Lecture complémentaire

- **[`01-routing.md`](./01-routing.md)** — le router en détail.
- **[`02-project-layout.md`](./02-project-layout.md)** — structure du projet.
- **[`03-static-bake.md`](./03-static-bake.md)** — SEO sans SSR.
- **[`examples/showcase/`](../../examples/showcase/)** — exemple complet (landing + admin).

Si quelque chose n'est pas clair — ouvrez une issue, ou ouvrez simplement le source. Il est vraiment lisible en une soirée.
