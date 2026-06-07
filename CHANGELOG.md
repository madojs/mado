# Changelog

## 0.5.1

Patch release focused on first-user DX after the public npm launch.

### Fixed

- Generated starter apps can now run `mado dev` / `mado serve` from the app
  root instead of assuming the framework repository layout.
- The CRUD starter shell is a real Web Component again, using Shadow DOM and
  `<slot>` for route projection.
- Feature components in the CRUD starter are imported by the pages that render
  them, avoiding a confusing "import everything in main" pattern.
- The minimal starter counter tag registration now matches the rendered
  `<x-app-counter>` tag.
- The router default 404 view is rendered through `html` templates, not dynamic
  `innerHTML`.
- `npm run bundle` defaults to the existing showcase entry instead of the old
  removed `examples/main.ts`.

### Changed

- Starter packages include `npm run dev` and generated `.gitignore` defaults.
- README and docs clarify that Mado works with browser primitives rather than
  replacing the platform.
- Form documentation now describes `useForm()` as schema-based validation close
  to HTML constraints, matching the implementation.
- Shadow DOM / Light DOM docs now explain layout components, `<slot>`, and
  component registration imports.
- Deep imports are documented as internal/unstable before v1.
- CI workflows use Node24-based GitHub actions and the obsolete Cloudflare
  showcase deploy workflow was removed.
- The release workflow updates npm before publish and creates GitHub releases
  through the GitHub CLI.
- Browser regression now runs on a weekly schedule as well as manually.

## 0.5.0

First public release preparation for Mado.

### Added

- `mado init <name>` project creation command.
- `minimal` and `crud` starters included in the npm package.
- GitHub CI workflow with typecheck, build, tests, package dry-run and tarball starter smoke.
- Tag-based release workflow for npm publishing after Trusted Publishing is configured.
- Manual browser regression workflow.
- Release notes generator based on Conventional Commit subjects.

### Changed

- Package version is set to `0.5.0`.
- npm package files include starters, AI-agent docs and changelog.

### Release Notes

- First npm publish is intended to be manual.
