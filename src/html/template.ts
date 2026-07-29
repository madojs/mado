/**
 * Template instantiation + public `html\`\`` tag + `render()`.
 *
 * Data flow:
 *   html`...`              → TemplateResult { strings, values }
 *   parseTemplate(strings) → ParsedTemplate { template, bindings }   (cached by strings)
 *   instantiate(result)    → InstantiatedTemplate { fragment, nodes, commit, update, dispose }
 *   render(result, host)   → clones or reuses instance in host
 *
 * Only the glue lives here: parser and bindings are in neighbour files.
 */

import type { Disposer } from "../signal.js";
import { warnOnce } from "../diagnostics.js";
import {
  parseTemplate,
  resolvePath,
  type AttrBindingSpec,
  type BindingSpec,
} from "./parser.js";
import {
  bindAttr,
  bindChild,
  createChildState,
  disposeChildState,
  isChildStateMounted,
  type BindingCommit,
  type ChildState,
} from "./bindings.js";
import {
  _getTemplateOwner,
  type InstantiatedTemplate,
  type TemplateResult,
} from "./template-types.js";
import { _flushDeferredStaticElements } from "../component.js";

/**
 * `html\`<div>${value}</div>\`` → template descriptor.
 *
 * By itself renders and parses NOTHING — this simply captures
 * { strings, values } from the tagged-template literal. The heavy work
 * (parsing + cloning) happens on the first `render()` /
 * `instantiate()` call and is cached by `strings` identity.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): TemplateResult {
  return { _mado: true, strings, values };
}

/**
 * Create a ready template instance: clones the pre-parsed template,
 * resolves all BindingSpec → concrete DOM nodes of the clone, binds
 * initial values. Mount-sensitive work remains queued until commit() is called
 * after insertion. The returned object is self-contained: update(result)
 * patches only what actually changed and transfers internal ownership,
 * while dispose() cleans up effects and removes nodes from the DOM.
 *
 * Exported (not only used from render()) so that
 * keyed `each` reconciliation can manage instance lifetimes directly.
 */
export function instantiate(result: TemplateResult): InstantiatedTemplate {
  const initialOwner = _getTemplateOwner(result);

  let parsed: ReturnType<typeof parseTemplate>;
  let fragment: DocumentFragment;
  try {
    parsed = parseTemplate(result.strings);
    fragment = parsed.template.content.cloneNode(true) as DocumentFragment;
  } catch (error) {
    try {
      initialOwner?.();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[mado] template parsing and owner cleanup both failed.",
      );
    }
    throw error;
  }

  interface BindingRuntime {
    spec: BindingSpec;
    disposers: Disposer[];
  }

  const childStates: Map<number, ChildState> = new Map();
  const attrBound: Map<number, { el: Element; spec: AttrBindingSpec }> =
    new Map();
  const runtimes: BindingRuntime[] = [];
  const pendingCommits: BindingCommit[] = [];
  // Capture the stable roots before child bindings add dynamic siblings around
  // their anchors. ChildState owns those dynamic nodes; the instance owns only
  // the roots cloned from the parsed template.
  const nodes = [...fragment.childNodes];
  let currentValues: readonly unknown[] | undefined;
  let currentOwner: Disposer | undefined;
  let committed = false;
  let disposed = false;
  let bindingDepth = 0;

  // Resolve all BindingSpec.path → concrete nodes of the cloned
  // fragment. This is done ONCE, in the instance creation phase.
  try {
    for (const b of parsed.bindings) {
      if (b.type === "child") {
        const parent = resolvePath(fragment, b.path);
        const placeholder = parent.childNodes[b.childIndex] as Comment;
        childStates.set(b.id, createChildState(placeholder));
      } else {
        const el = resolvePath(fragment, b.path) as Element;
        attrBound.set(b.id, { el, spec: b });
      }
      runtimes.push({ spec: b, disposers: [] });
    }
  } catch (error) {
    try {
      initialOwner?.();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[mado] template resolution and owner cleanup both failed.",
      );
    }
    throw error;
  }

  const queueCommit = (task: BindingCommit): void => {
    pendingCommits.push(task);
  };

  const flushCommits = (): void => {
    if (!committed || bindingDepth > 0 || pendingCommits.length === 0) return;
    const batch = pendingCommits.splice(0);
    const completed: BindingCommit[] = [];
    try {
      for (const task of batch) {
        task.commit();
        completed.push(task);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (let index = completed.length - 1; index >= 0; index--) {
        try {
          completed[index]!.rollback();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "[mado] template commit and rollback both failed.",
        );
      }
      throw error;
    }
  };

  const bindingComplete = (): void => {
    flushCommits();
  };

  const disposeDisposers = (items: Disposer[]): void => {
    const errors: unknown[] = [];
    for (const dispose of items.splice(0)) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "[mado] binding cleanup failed.");
    }
  };

  const bindRuntime = (
    runtime: BindingRuntime,
    values: readonly unknown[],
  ): void => {
    disposeDisposers(runtime.disposers);
    const nextDisposers: Disposer[] = [];
    runtime.disposers = nextDisposers;
    try {
      const b = runtime.spec;
      if (b.type === "child") {
        bindChild(
          childStates.get(b.id)!,
          values[b.slot],
          nextDisposers,
          instantiate,
          queueCommit,
          bindingComplete,
        );
      } else {
        const ab = attrBound.get(b.id)!;
        bindAttr(
          ab.el,
          ab.spec,
          values,
          nextDisposers,
          queueCommit,
          bindingComplete,
        );
      }
    } catch (error) {
      try {
        disposeDisposers(nextDisposers);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "[mado] binding setup and cleanup both failed.",
        );
      }
      throw error;
    }
  };

  const sameRuntimeInputs = (
    spec: BindingSpec,
    previous: readonly unknown[],
    next: readonly unknown[],
  ): boolean => {
    const slots = spec.type === "child" ? [spec.slot] : spec.slots;
    return slots.every((slot) =>
      sameBindingValue(previous[slot], next[slot]),
    );
  };

  const updateValues = (values: readonly unknown[]) => {
    if (disposed) {
      throw new Error("[mado] cannot update a disposed template instance.");
    }

    const previousValues = currentValues;
    const changed: BindingRuntime[] = [];
    const pendingStart = pendingCommits.length;
    bindingDepth++;

    try {
      for (const runtime of runtimes) {
        if (
          previousValues &&
          sameRuntimeInputs(runtime.spec, previousValues, values)
        ) {
          continue;
        }
        changed.push(runtime);
        bindRuntime(runtime, values);
      }
      currentValues = [...values];
      bindingDepth--;
      flushCommits();
    } catch (error) {
      // Suppress commit flushing while the previous bindings are restored.
      if (bindingDepth === 0) bindingDepth++;
      const rollbackErrors: unknown[] = [];

      for (let index = changed.length - 1; index >= 0; index--) {
        const runtime = changed[index]!;
        try {
          disposeDisposers(runtime.disposers);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      // Failed/new commit tasks are owned by the just-disposed binding states.
      // Drop their inert queue entries before restored refs enqueue fresh ones.
      if (pendingCommits.length > pendingStart) {
        pendingCommits.splice(pendingStart);
      }

      if (previousValues) {
        for (const runtime of changed) {
          try {
            bindRuntime(runtime, previousValues);
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
      }

      currentValues = previousValues;
      bindingDepth--;

      if (previousValues && rollbackErrors.length === 0) {
        try {
          flushCommits();
        } catch (rollbackCommitError) {
          rollbackErrors.push(rollbackCommitError);
        }
      }

      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "[mado] template update and rollback both failed.",
        );
      }
      throw error;
    }
  };

  const update = (next: TemplateResult): void => {
    const nextOwner = _getTemplateOwner(next);
    try {
      updateValues(next.values);
    } catch (error) {
      try {
        if (nextOwner !== currentOwner) nextOwner?.();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "[mado] template update and candidate owner cleanup both failed.",
        );
      }
      throw error;
    }

    const previousOwner = currentOwner;
    currentOwner = nextOwner;
    if (previousOwner !== nextOwner) previousOwner?.();
  };

  const disposeInstance = (): void => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const runtime of runtimes) {
      try {
        disposeDisposers(runtime.disposers);
      } catch (error) {
        errors.push(error);
      }
    }
    pendingCommits.length = 0;
    for (const st of childStates.values()) {
      try {
        disposeChildState(st);
      } catch (error) {
        errors.push(error);
      }
    }
    const owner = currentOwner;
    currentOwner = undefined;
    try {
      owner?.();
    } catch (error) {
      errors.push(error);
    }
    for (const n of nodes) {
      try {
        n.parentNode?.removeChild(n);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "[mado] template disposal failed.");
    }
  };

  try {
    update(result);
  } catch (error) {
    try {
      disposeInstance();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[mado] template initialization and cleanup both failed.",
      );
    }
    throw error;
  }

  return {
    fragment,
    nodes,
    commit() {
      if (disposed) return;
      const wasCommitted = committed;
      committed = true;
      try {
        flushCommits();
      } catch (error) {
        committed = wasCommitted;
        // The first mount commit is transactional and terminal on failure.
        // Some completed tasks (notably nested instances) are deliberately
        // disposed during rollback, so retrying the consumed batch could never
        // reproduce a coherent tree. Dispose the complete instance instead.
        if (!wasCommitted) {
          try {
            disposeInstance();
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "[mado] template commit and disposal both failed.",
            );
          }
        }
        throw error;
      }
    },
    update,
    dispose: disposeInstance,
    isMountedIn(container: Node) {
      return (
        nodes.every((node) => node.parentNode === container) &&
        [...childStates.values()].every(isChildStateMounted)
      );
    },
    _strings: result.strings,
  };
}

function sameBindingValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (
    typeof previous !== "object" ||
    previous === null ||
    typeof next !== "object" ||
    next === null
  ) {
    return false;
  }
  const previousRef = previous as {
    _madoDirective?: unknown;
    callback?: unknown;
  };
  const nextRef = next as {
    _madoDirective?: unknown;
    callback?: unknown;
  };
  return (
    previousRef._madoDirective === "ref" &&
    nextRef._madoDirective === "ref" &&
    previousRef.callback === nextRef.callback
  );
}

// ---------- Public render ----------

const rendered = new WeakMap<Element | ShadowRoot, InstantiatedTemplate>();

/**
 * Render a TemplateResult into a container.
 *
 * Semantics:
 *   - first call → instantiate + appendChild;
 *   - repeated call with the same tagged literal (same strings identity) →
 *     update(result), DOM is not recreated;
 *   - repeated call with a different literal → dispose old + new instantiate.
 *
 * Container can be either an Element or a ShadowRoot (used
 * in component() for rendering into a shadow tree).
 */
export function render(
  result: TemplateResult,
  container: Element | ShadowRoot,
): Disposer {
  let existing = rendered.get(container);
  if (existing && !isMountedIn(existing, container)) {
    existing.dispose();
    rendered.delete(container);
    existing = undefined;
  }
  if (existing) {
    if (existing._strings === result.strings) {
      existing.update(result);
      return renderDisposer(container, existing);
    }
  }

  // Static snapshots write first-paint markup into #app and mark the
  // container. That markup is not hydrated: once the client app starts, Mado
  // owns the container again and atomically replaces it with live bindings.
  const isStaticContainer =
    !existing &&
    "hasAttribute" in container &&
    container.hasAttribute("data-mado-static");

  if (!isStaticContainer && !existing && container.childNodes.length > 0) {
    warnOnce(
      "render-unmanaged-dom",
      "render() called on a container with existing DOM that was not created by Mado. It will remain alongside the new render output.",
    );
  }

  // Build the live fragment OFF-DOM first. This guarantees that:
  //   - any new Custom Element inside the fragment is parsed and constructed
  //     but its connectedCallback() does not fire until insertion,
  //   - the old static tree (whose deferred children skipped setup()) is
  //     still in the DOM as inert first-paint markup,
  //   - we then swap children atomically with replaceChildren(), avoiding
  //     any frame where the container is visibly empty.
  const inst = instantiate(result);
  if (isStaticContainer) {
    const takeoverState = captureTakeoverState(container);
    const staticNodes = [...container.childNodes];
    // Order matters: remove the marker BEFORE inserting the live fragment so
    // newly-connecting Custom Elements no longer see a static ancestor and
    // run setup() exactly once.
    try {
      container.removeAttribute("data-mado-static");
      container.replaceChildren(inst.fragment);
      _flushDeferredStaticElements();
      restoreTakeoverState(container, takeoverState);
      inst.commit();
    } catch (error) {
      let cleanupError: unknown;
      try {
        inst.dispose();
      } catch (caught) {
        cleanupError = caught;
      } finally {
        container.setAttribute("data-mado-static", "");
        container.replaceChildren(...staticNodes);
      }
      if (cleanupError !== undefined) {
        throw new AggregateError(
          [error, cleanupError],
          "[mado] static takeover commit and cleanup both failed.",
        );
      }
      throw error;
    }
  } else {
    try {
      container.appendChild(inst.fragment);
      inst.commit();
    } catch (error) {
      try {
        inst.dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "[mado] render commit and cleanup both failed.",
        );
      }
      throw error;
    }
  }

  // A different-template replacement is prepared and committed while the
  // previous instance is still alive. Binding/ref failures therefore leave the
  // last successful render untouched. The overlap exists only synchronously
  // inside this call; once the new tree commits, the old owner is disposed.
  if (existing) {
    try {
      existing.dispose();
    } catch (error) {
      // disposeInstance removes owned DOM even when user cleanup throws. The
      // newly committed instance is valid and must remain the container owner.
      rendered.set(container, inst);
      throw error;
    }
  }
  rendered.set(container, inst);
  return renderDisposer(container, inst);
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ControlState = [
  value: string,
  checked: boolean | undefined,
  focused: boolean,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined,
  selectionDirection: "forward" | "backward" | "none" | null | undefined,
];

function captureTakeoverState(container: Element | ShadowRoot): ControlState[] {
  const active = document.activeElement;
  return collectControls(container).map((control) => [
    control.value,
    "checked" in control ? control.checked : undefined,
    control === active,
    "selectionStart" in control ? control.selectionStart : undefined,
    "selectionEnd" in control ? control.selectionEnd : undefined,
    "selectionDirection" in control ? control.selectionDirection : undefined,
  ]);
}

function restoreTakeoverState(
  container: Element | ShadowRoot,
  states: ControlState[],
  attempts = 120,
): void {
  const controls = collectControls(container);
  if (controls.length < states.length && attempts > 0) {
    requestAnimationFrame(() => restoreTakeoverState(container, states, attempts - 1));
    return;
  }
  for (let index = 0; index < states.length; index++) {
    const state = states[index]!;
    const control = controls[index];
    if (!control) continue;
    if (!(control.localName === "input" && (control as HTMLInputElement).type === "file")) {
      control.value = state[0];
    }
    if (state[1] !== undefined && "checked" in control) control.checked = state[1];
    if (state[2]) {
      control.focus();
      if (state[3] !== undefined && "setSelectionRange" in control) {
        control.setSelectionRange?.(
          state[3],
          state[4] ?? null,
          state[5] ?? undefined,
        );
      }
    }
  }
}

function collectControls(root: Element | ShadowRoot): Control[] {
  const controls = [...root.querySelectorAll<Control>("input,select,textarea")];
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) controls.push(...collectControls(element.shadowRoot));
  }
  return controls;
}

/** Dispose the template currently owned by a render container. */
export function unmount(container: Element | ShadowRoot): void {
  const instance = rendered.get(container);
  if (!instance) return;
  rendered.delete(container);
  instance.dispose();
}

function renderDisposer(
  container: Element | ShadowRoot,
  instance: InstantiatedTemplate,
): Disposer {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (rendered.get(container) !== instance) return;
    unmount(container);
  };
}

function isMountedIn(
  instance: InstantiatedTemplate,
  container: Element | ShadowRoot,
): boolean {
  return instance.nodes.length === 0 || instance.isMountedIn(container);
}
