/**
 * Dev logger for signals and effects.
 *
 * Enabled by a flag in localStorage:
 *   localStorage.madoDebug = '1'
 *
 * What it does:
 *   - wraps signal/effect/computed for logging
 *   - shows [signal] name: old → new
 *   - groups effects via console.group / console.groupEnd
 *
 * Setup:
 *   import 'madojs/devtools.js';  // at the very top of app.ts
 *
 * In production — just don't import this file, and all dev code will be
 * tree-shaken (or simply absent from the module graph).
 *
 * Implementation: imports the already-initialised signal module and
 * patches the factory. A simple proof-of-concept approach; for production-
 * grade DevTools a full hook is needed, but that's a different story.
 */

import * as signalModule from "./signal.js";

const ENABLED =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("madoDebug") === "1";

if (ENABLED) {
  // eslint-disable-next-line no-console
  console.info("%c[mado] devtools enabled", "color: #888");

  const origSignal = signalModule.signal;
  let counter = 0;

  // @ts-expect-error patching module live
  signalModule.signal = function patchedSignal<T>(initial: T) {
    const name = `s${++counter}`;
    const sig = origSignal(initial);
    const origSet = sig.set;
    sig.set = (next: T) => {
      const prev = sig.peek();
      if (!Object.is(prev, next)) {
        // eslint-disable-next-line no-console
        console.log(`%c[signal ${name}]`, "color: #888", prev, "→", next);
      }
      origSet(next);
    };
    return sig;
  };

  const origEffect = signalModule.effect;
  // @ts-expect-error patching module live
  signalModule.effect = function patchedEffect(fn: () => unknown) {
    let id = 0;
    return origEffect(() => {
      const tag = `[effect #${++id}]`;
      // eslint-disable-next-line no-console
      console.groupCollapsed(tag);
      try {
        return fn() as void;
      } finally {
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    });
  };
}

export {}; // side-effect module
