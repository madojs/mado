# Mado v1 release roadmap

The implementation hardening lands in 0.13.0: safe output ownership,
serialization, lifecycle teardown, transactional navigation, native forms,
stable data semantics, the frozen API, devtools, deterministic capture and a
reproducible package.

Release progression:

1. Publish 0.13.0 as the final pre-v1 breaking release.
2. Dogfood it on one static/content site and one authenticated modular app.
3. Fix discovered contract defects and publish 1.0.0-rc.1.
4. Publish another RC whenever a public contract changes.
5. Publish 1.0.0 after an RC has no P0/P1 issues, no API changes and the full
   Node/browser/package matrix is green.

The gate is `npm run verify:release`, plus Node 22/24, Chromium/Firefox/WebKit,
Windows package smoke, a 17 KiB gzip runtime budget and a separately measured
24 KiB devtools budget. Runtime dependencies remain zero.
