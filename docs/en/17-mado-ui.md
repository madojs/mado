# Mado UI

> Reviewed, copy-owned UI source for Mado applications — without a second
> browser runtime.

The canonical catalog is [ui.madojs.dev](https://ui.madojs.dev). Use it to
inspect each item's source, dependencies, composition, public API,
accessibility, focus and fallback contract before installing it.

Mado core and Mado UI solve different problems:

```text
@madojs/mado  = browser runtime and application framework
@madojs/ui    = development CLI and versioned source registry
your project  = owner of every installed UI file
```

The UI CLI copies components, native CSS recipes, blocks and page/layout
templates into the application. Installed source is ordinary application code:
edit it, review it and ship it with the rest of the project. Browser code never
imports `@madojs/ui`.

Mado UI is still pre-1.0. Its intentionally focused registry continues to be
validated alongside real Mado applications.

## Start

Run the CLI from an existing Mado application:

```bash
npx @madojs/ui@latest init
npx @madojs/ui@latest list
npx @madojs/ui@latest view panel
npx @madojs/ui@latest add button field panel
```

Use npm's `latest` dist-tag for normal work, including when returning to the
application much later. It selects the current CLI and registry for that
invocation; it does **not** silently replace source already copied into the
project. Use an exact package version only when reproducing an older
installation.

The CLI validates the installed or declared Mado version against every item in
the resolved dependency graph and stops rather than installing incompatible
source.

## Project state

`init` creates `mado-ui.json`, the human-owned path configuration. Successful
installs create or update `.mado-ui.lock.json`. Commit both files.

Lock format 2 records:

- `explicitItems`: the items the developer actually requested;
- every installed item's direct `dependencies`, captured at installation;
- registry version and compatibility generation;
- copied source paths, project targets and normalized source hashes.

The explicit roots and their locked dependency edges are ownership metadata,
not a cache. Commands use that recorded graph to retain shared dependencies and
identify new orphans deterministically. They must not reconstruct ownership
from a newer registry release whose dependency graph may have changed.

Before adding, updating or recreating UI source, inspect these files when they
already exist. They let the CLI distinguish pristine files, application
customizations, missing files and upstream changes without preventing edits.

### Migrate a format-1 lock explicitly

Format-1 locks recorded installed items but not which ones were direct
requests. The CLI deliberately never guesses those roots. Recover the original
explicit item names from project history or from the person who installed
them, preview the migration, and then apply the same command:

```bash
npx @madojs/ui@latest migrate badge dialog --dry-run
npx @madojs/ui@latest migrate badge dialog
```

Migration succeeds only when those roots and their dependency closure exactly
reproduce the complete legacy installation. It updates lock metadata
transactionally and does not rewrite installed source. If the original roots
cannot be established, stop and resolve that ownership decision rather than
inferring it from current files or the current registry.

## Inspect and update

```bash
npx @madojs/ui@latest list
npx @madojs/ui@latest view dialog
npx @madojs/ui@latest diff
npx @madojs/ui@latest update --dry-run
npx @madojs/ui@latest update
npx @madojs/ui@latest doctor
```

`add` plans the complete dependency graph and refuses to overwrite existing
targets by default. `update` compares the lock, local source and current
registry before replacing a pristine file. Review `diff` before deliberately
overwriting a customization. Replacing one requires
`update <item> --overwrite`; the flag is invalid without explicit item names
and never expands to implicit dependencies.

## Remove owned source

Removal is explicit and conservative:

```bash
npx @madojs/ui@latest remove tooltip --dry-run
npx @madojs/ui@latest remove tooltip
```

`remove` accepts one or more items recorded in `explicitItems`; it never means
"remove everything". It plans from the dependency edges in the lock, keeps
items still reachable from another explicit root and includes newly orphaned
dependencies in the preview.

Only regular files whose current hash still matches the lock are deleted.
Missing owned files are forgotten, while customized files, shared lock
targets, paths outside configured roots, symlinks and non-regular files stop
the complete transaction. Directories and untracked files are never removed.
If another explicit root still depends on a selected item, remove the
dependent roots together or leave the shared item installed.

Do not replace this command with manual file deletion or hand-edit the lock.
Use `--dry-run` first when reviewing the exact deletion plan.

## Core generator or UI registry?

```bash
mado new component avatar
npx @madojs/ui@latest add avatar
```

- `mado new component` creates a minimal local component skeleton.
- `mado-ui add` installs reviewed registry source and its dependencies.

The registry grows from foundations to primitives, blocks and templates. Some
items are Mado Web Components; native buttons, controls, disclosures and
similar platform elements remain semantic HTML plus opt-in CSS and, where
behavior requires it, a copied binding helper. A custom element is used only
when that boundary improves rather than weakens browser behavior.

The catalog changes faster than framework documentation. Use the
[live Mado UI catalog](https://ui.madojs.dev) for the canonical item list,
accessibility contracts and CLI guide; implementation history and registry
source live in the [Mado UI repository](https://github.com/madojs/ui).
