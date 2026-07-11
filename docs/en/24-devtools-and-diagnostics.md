# Devtools and diagnostics

Development instrumentation is opt-in and compiled out of production builds.
Import the stable devtools subpath before application startup:

```ts
import { devtools } from "@madojs/mado/devtools.js";

devtools.open();
```

`Alt+Shift+M` toggles the Shadow DOM overlay. Its Overview, Reactivity,
Components, Router/Data and Timeline/Errors views are fed by a versioned
internal hook. The controller also exposes `close()`, `toggle()`, `clear()`,
`setLogLevel()` and `snapshot()`. Snapshots contain safe previews rather than
live application objects.

`localStorage.madoDebug = "1"` is accepted during 0.13 migration only and emits
a deprecation warning.

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
