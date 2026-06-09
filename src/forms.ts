/**
 * Forms without pain. Built on native `<form>` submit/input events plus a
 * small schema validator whose rules mirror common HTML constraints.
 *
 *   const f = useForm({
 *     email: { required: true, type: 'email' },
 *     age:   { min: 18 },
 *   });
 *
 *   html`
 *     <form @submit=${f.onSubmit(async values => { await save(values) })}>
 *       <input name="email" .value=${() => f.values().email ?? ''}
 *              @input=${f.onInput} />
 *       ${() => f.errors().email ? html`<err>${f.errors().email}</err>` : null}
 *
 *       <input name="age" type="number" .value=${() => f.values().age ?? ''}
 *              @input=${f.onInput} />
 *
 *       <button ?disabled=${() => !f.isValid() || f.submitting()}>Save</button>
 *     </form>
 *   `;
 *
 * What's inside:
 *   - validation rules mirror common HTML constraints
 *     (required, min, max, pattern, type=email/url/number, etc.);
 *   - custom rules via a validate(values) function returning
 *     { field: 'msg' } or null;
 *   - all fields are automatically "touched" on blur — errors
 *     are shown only after user interaction;
 *   - submit() is aborted if the form is invalid.
 *
 * No Yup/Zod/Formik dependencies. If you really want them —
 * pass your own validate(values) and wire it to anything.
 */

import { signal, computed, type Signal, type Computed } from "./signal.js";

export type FormValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | FormValue[]
  | { [key: string]: FormValue };
export type FormValues = Record<string, FormValue>;
export type FormErrors = Record<string, string | undefined>;

export type FieldValidator<V extends FormValues = FormValues> = (
  value: FormValue,
  values: V,
  path: string,
) => string | null | undefined;

export type AsyncFieldValidator<V extends FormValues = FormValues> = (
  value: FormValue,
  values: V,
  path: string,
) => Promise<string | null | undefined>;

/** Field declaration. Rules intentionally match common HTML constraints. */
export interface FieldSchema {
  required?: boolean;
  type?: "text" | "email" | "url" | "number" | "tel" | "password";
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** Default value */
  default?: FormValue;
  /** Synchronous custom validator for this field. */
  validate?: FieldValidator;
  /** Asynchronous custom validator for this field. */
  validateAsync?: AsyncFieldValidator;
}

export type Schema = Record<string, FieldSchema>;

export interface UseFormOptions<V extends FormValues> {
  /** Custom validator: returns errors or null. */
  validate?: (values: V) => FormErrors | null;
  /** Async custom validator, usually for server-backed uniqueness checks. */
  validateAsync?: (values: V) => Promise<FormErrors | null>;
}

export interface FieldArrayApi<T extends FormValue = FormValue> {
  /** Current array value. */
  items: () => T[];
  /** Field name helper: `items.0.title`. */
  path(index: number, field?: string): string;
  append(value: T): void;
  prepend(value: T): void;
  insert(index: number, value: T): void;
  remove(index: number): void;
  move(from: number, to: number): void;
  replace(items: readonly T[]): void;
  set(index: number, value: T): void;
}

export interface FormApi<V extends FormValues> {
  values: Signal<V>;
  errors: () => FormErrors;
  touched: Signal<Record<string, boolean>>;
  submitting: Signal<boolean>;
  validating: Computed<boolean>;
  validatingFields: Signal<Record<string, boolean>>;
  isValid: () => boolean;

  /** Binding for @input/@change: automatically picks up name+value+type. */
  onInput: (e: Event) => void;
  /** Binding for @blur: marks the field as touched. */
  onBlur: (e: Event) => void;
  /** Submit wrapper: calls handler only if the form is valid. */
  onSubmit: (
    handler: (values: V) => void | Promise<void>,
  ) => (e: Event) => void;

  /** Set a field value programmatically. */
  setField<K extends keyof V & string>(name: K, value: V[K]): void;
  setField(name: string, value: FormValue): void;
  /** Run async validators for a single field path. */
  validateField(name: string): Promise<boolean>;
  /** Run all sync + async validators and update errors. */
  validate(): Promise<boolean>;
  /** Helper for dynamic arrays stored under one form field. */
  array<T extends FormValue = FormValue>(name: keyof V & string): FieldArrayApi<T>;
  /** Reset to defaults. */
  reset(): void;
}

export function useForm<V extends FormValues>(
  schema: Schema,
  options: UseFormOptions<V> = {},
): FormApi<V> {
  const defaults = () => {
    const out: FormValues = {};
    for (const k in schema) {
      const s = schema[k]!;
      if (s.default !== undefined) out[k] = cloneFormValue(s.default);
    }
    return out as V;
  };

  const values = signal<V>(defaults());
  const touched = signal<Record<string, boolean>>({});
  const submitting = signal(false);
  const asyncErrors = signal<FormErrors>({});
  const validatingFields = signal<Record<string, boolean>>({});
  const validating = computed(() => Object.keys(validatingFields()).length > 0);

  const fieldRuns = new Map<string, number>();
  let formRun = 0;
  let formAsyncPaths: string[] = [];

  const syncErrors = computed<FormErrors>(() => {
    const v = values();
    const out: FormErrors = {};

    for (const pattern in schema) {
      const s = schema[pattern]!;
      const paths = expandSchemaPath(v, pattern);
      for (const name of paths) validateSyncField(out, s, v, name);
    }

    if (options.validate) {
      const custom = options.validate(v);
      if (custom) Object.assign(out, custom);
    }

    return out;
  });

  const errors = computed<FormErrors>(() => ({
    ...syncErrors(),
    ...asyncErrors(),
  }));

  const isValid = computed(() => Object.keys(errors()).length === 0);

  function validateSyncField(
    out: FormErrors,
    s: FieldSchema,
    v: V,
    name: string,
  ): void {
    const raw = getPath(v, name);
    const isEmpty = raw === undefined || raw === "" || raw === null;

    if (s.required && isEmpty) {
      out[name] = "required field";
      return;
    }
    if (isEmpty) return;

    if (s.type === "email" && typeof raw === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) out[name] = "invalid email";
    } else if (s.type === "url" && typeof raw === "string") {
      try {
        new URL(raw);
      } catch {
        out[name] = "invalid URL";
      }
    } else if (s.type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) out[name] = "must be a number";
      else {
        if (s.min !== undefined && n < s.min) out[name] = `minimum ${s.min}`;
        if (s.max !== undefined && n > s.max) out[name] = `maximum ${s.max}`;
      }
    }

    if (typeof raw === "string") {
      if (s.minLength !== undefined && raw.length < s.minLength) {
        out[name] = `minimum ${s.minLength} characters`;
      }
      if (s.maxLength !== undefined && raw.length > s.maxLength) {
        out[name] = `maximum ${s.maxLength} characters`;
      }
      if (s.pattern && !new RegExp(s.pattern).test(raw)) {
        out[name] = "invalid format";
      }
    }

    if (s.validate) {
      const custom = s.validate(raw, v, name);
      if (custom) out[name] = custom;
    }
  }

  const setFieldValidating = (name: string, enabled: boolean): void => {
    validatingFields.update((m) => {
      if (enabled) return { ...m, [name]: true };
      const next = { ...m };
      delete next[name];
      return next;
    });
  };

  const setAsyncErrors = (
    clearPaths: readonly string[],
    nextErrors: FormErrors,
  ): void => {
    asyncErrors.update((prev) => {
      const next = { ...prev };
      for (const path of clearPaths) delete next[path];
      for (const [path, message] of Object.entries(nextErrors)) {
        if (message) next[path] = message;
        else delete next[path];
      }
      return next;
    });
  };

  const clearAsyncPrefix = (prefix: string): void => {
    asyncErrors.update((prev) => clearRecordPrefix(prev, prefix));
  };

  const validateField = async (name: string): Promise<boolean> => {
    const matching = Object.entries(schema).filter(
      ([pattern, s]) => s.validateAsync && schemaPathMatches(pattern, name),
    );

    const run = (fieldRuns.get(name) ?? 0) + 1;
    fieldRuns.set(name, run);
    setAsyncErrors([name], {});

    if (matching.length === 0) return !errors.peek()[name];

    setFieldValidating(name, true);
    const snapshot = values.peek();
    const next: FormErrors = {};
    try {
      for (const [, s] of matching) {
        const message = await s.validateAsync!(
          getPath(snapshot, name),
          snapshot,
          name,
        );
        if (message) {
          next[name] = message;
          break;
        }
      }
    } catch (err) {
      next[name] = "validation failed";
      // eslint-disable-next-line no-console
      console.error("[mado] field validator threw:", err);
    } finally {
      if (fieldRuns.get(name) === run) {
        setAsyncErrors([name], next);
        setFieldValidating(name, false);
      }
    }

    return !errors.peek()[name];
  };

  const validateAll = async (): Promise<boolean> => {
    const run = ++formRun;
    if (Object.keys(syncErrors.peek()).length > 0) return false;

    if (options.validateAsync) setFieldValidating("$form", true);

    const snapshot = values.peek();
    const paths = concreteSchemaPaths(snapshot, schema);

    await Promise.all(paths.map((path) => validateField(path)));

    if (options.validateAsync) {
      try {
        const custom = await options.validateAsync(values.peek());
        if (formRun === run) {
          setAsyncErrors(formAsyncPaths, custom ?? {});
          formAsyncPaths = Object.keys(custom ?? {});
        }
      } catch (err) {
        if (formRun === run) {
          setAsyncErrors(formAsyncPaths, { $form: "validation failed" });
          formAsyncPaths = ["$form"];
        }
        // eslint-disable-next-line no-console
        console.error("[mado] form validator threw:", err);
      } finally {
        if (formRun === run) setFieldValidating("$form", false);
      }
    }

    return Object.keys(errors.peek()).length === 0;
  };

  const readField = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox") return el.checked;
      if (el.type === "number") return el.value === "" ? "" : Number(el.value);
    }
    return el.value;
  };

  const api: FormApi<V> = {
    values,
    errors,
    touched,
    submitting,
    validating,
    validatingFields,
    isValid,

    onInput(e) {
      const t = e.target as HTMLInputElement;
      if (!t.name) return;
      api.setField(t.name, readField(t));
      void validateField(t.name);
    },

    onBlur(e) {
      const t = e.target as HTMLInputElement;
      if (!t.name) return;
      touched.update((m) => ({ ...m, [t.name]: true }));
    },

    onSubmit(handler) {
      return (e: Event) => {
        e.preventDefault();
        // mark all fields as touched to show all errors
        const all: Record<string, boolean> = {};
        for (const k in schema) all[k] = true;
        for (const k of concreteSchemaPaths(values.peek(), schema)) all[k] = true;
        touched.set(all);

        void (async () => {
          if (!(await validateAll())) return;

          submitting.set(true);
          try {
            await handler(values.peek());
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[mado] form submit threw:", err);
          } finally {
            submitting.set(false);
          }
        })();
      };
    },

    setField(name: string, value: FormValue) {
      values.update((v) => setPath(v, name, value) as V);
      setAsyncErrors([name], {});
    },

    validateField,

    validate: validateAll,

    array<T extends FormValue = FormValue>(
      name: keyof V & string,
    ): FieldArrayApi<T> {
      const read = (): T[] => {
        const value = getPath(values.peek(), name);
        return Array.isArray(value) ? (value as T[]) : [];
      };
      const write = (items: readonly T[]): void => {
        values.update((v) => setPath(v, name, [...items]) as V);
        touched.update((m) => clearRecordPrefix(m, name));
        clearAsyncPrefix(name);
      };
      const clamp = (index: number, length: number): number =>
        Math.max(0, Math.min(index, length));

      return {
        items: read,
        path(index, field) {
          return field ? `${name}.${index}.${field}` : `${name}.${index}`;
        },
        append(value) {
          write([...read(), value]);
        },
        prepend(value) {
          write([value, ...read()]);
        },
        insert(index, value) {
          const items = read();
          const at = clamp(index, items.length);
          write([...items.slice(0, at), value, ...items.slice(at)]);
        },
        remove(index) {
          const items = read();
          if (index < 0 || index >= items.length) return;
          write(items.filter((_, i) => i !== index));
        },
        move(from, to) {
          const items = read();
          if (from < 0 || from >= items.length) return;
          const next = [...items];
          const [item] = next.splice(from, 1);
          next.splice(clamp(to, next.length), 0, item!);
          write(next);
        },
        replace(items) {
          write(items);
        },
        set(index, value) {
          const items = read();
          if (index < 0 || index >= items.length) return;
          const next = [...items];
          next[index] = value;
          write(next);
        },
      };
    },

    reset() {
      values.set(defaults());
      touched.set({});
      asyncErrors.set({});
      validatingFields.set({});
      formAsyncPaths = [];
      submitting.set(false);
    },
  };

  return api;
}

function cloneFormValue<T extends FormValue>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneFormValue) as T;
  if (value && typeof value === "object") {
    const out: Record<string, FormValue> = {};
    for (const [k, v] of Object.entries(value)) out[k] = cloneFormValue(v);
    return out as T;
  }
  return value;
}

function getPath(value: FormValue, path: string): FormValue {
  let current = value;
  for (const part of splitPath(path)) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, FormValue>)[part];
  }
  return current;
}

function setPath(root: FormValues, path: string, value: FormValue): FormValues {
  return setPathParts(root, splitPath(path), value) as FormValues;
}

function setPathParts(
  current: FormValue,
  parts: readonly string[],
  value: FormValue,
): FormValue {
  if (parts.length === 0) return value;

  const key = parts[0]!;
  const rest = parts.slice(1);
  const container = Array.isArray(current)
    ? [...current]
    : current && typeof current === "object"
      ? { ...(current as Record<string, FormValue>) }
      : isArrayIndex(key)
        ? []
        : {};

  (container as Record<string, FormValue>)[key] = setPathParts(
    (container as Record<string, FormValue>)[key],
    rest,
    value,
  );
  return container as FormValue;
}

function splitPath(path: string): string[] {
  return path.split(".").filter(Boolean);
}

function isArrayIndex(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

function expandSchemaPath(values: FormValues, pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  return expandParts(values, splitPath(pattern), []);
}

function expandParts(
  current: FormValue,
  parts: readonly string[],
  prefix: string[],
): string[] {
  if (parts.length === 0) return [prefix.join(".")];

  const [part, ...rest] = parts;
  if (part === "*") {
    if (!Array.isArray(current)) return [];
    return current.flatMap((item, index) =>
      expandParts(item, rest, [...prefix, String(index)]),
    );
  }

  const next =
    current && typeof current === "object"
      ? (current as Record<string, FormValue>)[part!]
      : undefined;
  return expandParts(next, rest, [...prefix, part!]);
}

function concreteSchemaPaths(values: FormValues, schema: Schema): string[] {
  const paths = new Set<string>();
  for (const pattern in schema) {
    for (const path of expandSchemaPath(values, pattern)) paths.add(path);
  }
  return [...paths];
}

function schemaPathMatches(pattern: string, path: string): boolean {
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(path);
  if (patternParts.length !== pathParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    if (expected !== "*" && expected !== pathParts[i]) return false;
  }
  return true;
}

function clearRecordPrefix<T>(
  record: Record<string, T>,
  prefix: string,
): Record<string, T> {
  const next = { ...record };
  const dotted = `${prefix}.`;
  for (const key of Object.keys(next)) {
    if (key === prefix || key.startsWith(dotted)) delete next[key];
  }
  return next;
}
