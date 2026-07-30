# Devtools and diagnostics

Development instrumentation is opt-in. Load the public pre-v1 candidate
subpath only during development and before mounting the application:

```ts
if (import.meta.env.DEV) {
  const { devtools } = await import("@madojs/mado/devtools.js");
  devtools.open();
}
```

The Vite production definition disables instrumentation emitted by core. The
conditional import also keeps the overlay controller, keyboard handler and
hook installation out of the normal production graph; an unconditional
side-effect import does not.

`Alt+Shift+M` toggles the Shadow DOM overlay. Its Overview, Reactivity,
Components, Router/Data and Timeline/Errors views are fed by a versioned
internal hook. The controller also exposes `close()`, `toggle()`, `clear()`,
`setLogLevel()` and `snapshot()`. Snapshots contain safe previews rather than
live application objects.

`localStorage.madoDebug = "1"` remains a deprecated compatibility alias and
emits a warning. It may be removed before v1; use the controller or
`mado:log-level` instead.

## Runtime diagnostics

Every record has `level`, `scope`, `code`, `message`, optional `data`, and a
timestamp. Set browser verbosity with:

```js
localStorage.setItem("mado:log-level", "debug");
```

Allowed levels are `debug`, `info`, `warn`, `error` and `silent`. Records are
also dispatched as `mado:diagnostic` events and appear in devtools.

## CLI diagnostics

```bash
mado release --log-level=debug --log-format=pretty
mado release --log-format=plain
mado release --log-format=json
```

The CLI honours `MADO_LOG_LEVEL`, `MADO_LOG_FORMAT` and `NO_COLOR`. Non-TTY
output automatically becomes plain. JSON mode writes one structured record per
line, suitable for CI ingestion.

The logger is internal infrastructure, not a public logging API for apps.
