// Browser-safe content module. `paths()` and `initialData()` in
// `guide.page.ts` import from here, so this file MUST stay in the
// client bundle — no Node-only APIs, no secrets, no env reads.
//
// In a larger app you would replace this with a markdown loader or a
// public JSON file fetched at build time.
// `Guide` is a JsonValue-safe shape: only plain string fields so it can
// be passed to `static.initialData` and survive the snapshot serializer.
// The explicit index signature satisfies Mado's `JsonValue` constraint
// without any runtime cost.
export type Guide = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  [key: string]: string;
};

export const guides: Guide[] = [
  {
    slug: "components",
    title: "Web Components are the app shell",
    summary:
      "Every visual unit in Mado is a real custom element with its own open shadow root.",
    body:
      "Mado does not ship a virtual DOM. The same custom element you " +
      "register with `component()` runs in the live SPA and inside the " +
      "snapshotted Declarative Shadow DOM the static release produces.",
  },
  {
    slug: "signals",
    title: "Signals are the reactivity model",
    summary:
      "Read with `count()`, write with `count.set()`, derive with `computed()`.",
    body:
      "Signals are getter functions. Subscriptions are automatic inside " +
      "`html\\`...\\`` template fragments and `effect()` callbacks, and " +
      "released when the surrounding component or page unmounts.",
  },
  {
    slug: "snapshots",
    title: "Browser-rendered static snapshots",
    summary:
      "`mado release` runs your app in a real Chromium and freezes the " +
      "rendered HTML — including the Shadow DOM — into one file per route.",
    body:
      "The snapshot ships as Declarative Shadow DOM. On first paint the " +
      "client component re-attaches to the same host with zero hydration " +
      "boundary and zero duplicated trees.",
  },
];

export function findGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}