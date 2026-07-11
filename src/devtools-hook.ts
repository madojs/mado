export const DEVTOOLS_HOOK_KEY = Symbol.for("@madojs/mado:devtools");

export interface MadoDevtoolsEvent {
  time: number;
  kind: string;
  target?: object;
  data?: unknown;
}

export interface MadoDevtoolsHook {
  readonly version: 1;
  emit(event: MadoDevtoolsEvent): void;
}

/* @__NO_SIDE_EFFECTS__ */
export function emitDevtools(
  kind: string,
  target?: object,
  data?: unknown,
): void {
  const hook = (globalThis as Record<PropertyKey, unknown>)[DEVTOOLS_HOOK_KEY] as
    | MadoDevtoolsHook
    | undefined;
  if (hook?.version !== 1) return;
  hook.emit({
    time: typeof performance !== "undefined" ? performance.now() : Date.now(),
    kind,
    ...(target ? { target } : {}),
    ...(data === undefined ? {} : { data }),
  });
}

export function installDevtoolsHook(hook: MadoDevtoolsHook): () => void {
  const root = globalThis as Record<PropertyKey, unknown>;
  const previous = root[DEVTOOLS_HOOK_KEY];
  root[DEVTOOLS_HOOK_KEY] = hook;
  return () => {
    if (root[DEVTOOLS_HOOK_KEY] !== hook) return;
    if (previous === undefined) delete root[DEVTOOLS_HOOK_KEY];
    else root[DEVTOOLS_HOOK_KEY] = previous;
  };
}
