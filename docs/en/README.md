# Mado documentation

> Canonical project documentation. English-only since v0.12.

Read top-to-bottom for a complete mental model, or jump to the
section you need from the matrix below.

## Reading paths

- **First time here?** Start with [00 — The Mado way](./00-the-mado-way.md)
  and then [01 — Quickstart](./01-quickstart.md).
- **Already shipped one Mado app?** Skim
  [10 — Pages and components](./10-pages-and-components.md) and
  [30 — API freeze map](./30-api-freeze-map.md).
- **Coming from React / Vue / Next?**
  [42 — Why Mado](./42-why-mado.md) and
  [40 — LLM guide](./40-llm-guide.md) cover the mental shifts.
- **Backend developer?** [41 — For backenders](./41-for-backenders.md)
  is the express lane.

## Map

### Start here

| Section                       | File                                       |
| ----------------------------- | ------------------------------------------ |
| The Mado way (philosophy)     | [00-the-mado-way.md](./00-the-mado-way.md) |
| Quickstart                    | [01-quickstart.md](./01-quickstart.md)     |

### Concepts (read once)

| Section                            | File                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| Pages and components               | [10-pages-and-components.md](./10-pages-and-components.md) |
| Templates and signals              | [11-templates-and-signals.md](./11-templates-and-signals.md) |
| Routing                            | [12-routing.md](./12-routing.md)                           |
| Data — `resource()` / `mutation()` | [13-data.md](./13-data.md)                                 |
| Forms                              | [14-forms.md](./14-forms.md)                               |
| Static snapshots                   | [15-static-snapshots.md](./15-static-snapshots.md)         |
| App architecture                   | [16-app-architecture.md](./16-app-architecture.md)         |

### Production

| Section            | File                                           |
| ------------------ | ---------------------------------------------- |
| Deployment         | [20-deployment.md](./20-deployment.md)         |
| Error handling     | [21-error-handling.md](./21-error-handling.md) |
| Testing            | [22-testing.md](./22-testing.md)               |
| Cookbook           | [23-cookbook.md](./23-cookbook.md)             |

### Reference

| Section                | File                                                       |
| ---------------------- | ---------------------------------------------------------- |
| API freeze map         | [30-api-freeze-map.md](./30-api-freeze-map.md)             |
| Reactivity ordering    | [31-reactivity-ordering.md](./31-reactivity-ordering.md)   |
| v1 stability contract  | [32-v1-stability.md](./32-v1-stability.md)                 |

### Meta

| Section                                                | File                                       |
| ------------------------------------------------------ | ------------------------------------------ |
| LLM guide (pitfalls + zero-history test)               | [40-llm-guide.md](./40-llm-guide.md)       |
| For backenders                                         | [41-for-backenders.md](./41-for-backenders.md) |
| Why Mado vs Lit / Solid / Svelte / htmx / React        | [42-why-mado.md](./42-why-mado.md)         |

## Migrating from v0.11.x doc layout

The 0.12 release reorganised `docs/en/` into the groups above and
collapsed several overlapping files. Old → new map:

<!-- docs-lint:allow-legacy-mention -->

| Old (v0.11.x)                       | New (v0.12)                                                |
| ----------------------------------- | ---------------------------------------------------------- |
| `01-routing.md`                     | `12-routing.md`                                            |
| `02-project-layout.md`              | merged into `16-app-architecture.md`                       |
| `03-static-bake.md`                 | `15-static-snapshots.md`                                   |
| `04-ide-setup.md`                   | merged into `01-quickstart.md`                             |
| `05-why-mado.md`                    | `42-why-mado.md`                                           |
| `06-for-backenders.md`              | `41-for-backenders.md`                                     |
| `07-llm-pitfalls.md`                | merged into `40-llm-guide.md`                              |
| `08-llm-zero-history-test.md`       | merged into `40-llm-guide.md`                              |
| `09-shadow-vs-light-dom.md`         | replaced by `10-pages-and-components.md`                   |
| `10-app-architecture.md`            | `16-app-architecture.md`                                   |
| `11-layouts.md`                     | merged into `12-routing.md`                                |
| `12-auth-and-api.md`                | merged into `13-data.md`                                   |
| `13-deployment.md`                  | `20-deployment.md`                                         |
| `14-testing.md`                     | `22-testing.md`                                            |
| `15-error-handling.md`              | `21-error-handling.md`                                     |
| `16-bake-cookbook.md`               | `23-cookbook.md`                                           |
| `17-shadow-dom-forms.md`            | merged into `14-forms.md`                                  |
| `18-api-freeze-map.md`              | `30-api-freeze-map.md`                                     |
| `19-reactivity-ordering.md`         | `31-reactivity-ordering.md`                                |
| `20-v1-stability.md`                | `32-v1-stability.md`                                       |

<!-- /docs-lint:allow-legacy-mention -->
