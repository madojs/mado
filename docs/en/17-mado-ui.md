# Mado UI

> Reviewed, copy-owned UI source for Mado applications — without a second
> browser runtime.

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
installs create or update `.mado-ui.lock.json`, which records registry
compatibility, versions and source hashes. Commit both files.

Before adding, updating or recreating UI source, inspect these files when they
already exist. They let the CLI distinguish pristine files, application
customizations, missing files and upstream changes without preventing edits.

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

The catalog changes faster than framework documentation, so the canonical
item list, accessibility contracts and CLI details live in the
[Mado UI repository](https://github.com/madojs/ui).
