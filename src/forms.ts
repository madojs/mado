/**
 * Forms without pain. Built on top of native `<form>` + Constraint Validation API.
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
 *   - validation is performed via standard browser attributes
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

import { signal, computed, type Signal } from "./signal.js";

export type FormValues = Record<string, string | number | boolean | undefined>;
export type FormErrors = Record<string, string | undefined>;

/** Field declaration. Attributes match HTML5. */
export interface FieldSchema {
  required?: boolean;
  type?: "text" | "email" | "url" | "number" | "tel" | "password";
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** Default value */
  default?: string | number | boolean;
}

export type Schema = Record<string, FieldSchema>;

export interface UseFormOptions<V extends FormValues> {
  /** Custom validator: returns errors or null. */
  validate?: (values: V) => FormErrors | null;
}

export interface FormApi<V extends FormValues> {
  values: Signal<V>;
  errors: () => FormErrors;
  touched: Signal<Record<string, boolean>>;
  submitting: Signal<boolean>;
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
  setField<K extends keyof V>(name: K, value: V[K]): void;
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
      if (s.default !== undefined) out[k] = s.default;
    }
    return out as V;
  };

  const values = signal<V>(defaults());
  const touched = signal<Record<string, boolean>>({});
  const submitting = signal(false);

  const errors = computed<FormErrors>(() => {
    const v = values();
    const out: FormErrors = {};

    for (const name in schema) {
      const s = schema[name]!;
      const raw = v[name];
      const isEmpty = raw === undefined || raw === "" || raw === null;

      if (s.required && isEmpty) {
        out[name] = "required field";
        continue;
      }
      if (isEmpty) continue;

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
    }

    if (options.validate) {
      const custom = options.validate(v);
      if (custom) Object.assign(out, custom);
    }

    return out;
  });

  const isValid = computed(() => Object.keys(errors()).length === 0);

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
    isValid,

    onInput(e) {
      const t = e.target as HTMLInputElement;
      if (!t.name) return;
      values.update((v) => ({ ...v, [t.name]: readField(t) }));
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
        touched.set(all);

        if (!isValid()) return;

        submitting.set(true);
        Promise.resolve(handler(values.peek()))
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error("[mado] form submit threw:", err);
          })
          .finally(() => submitting.set(false));
      };
    },

    setField(name, value) {
      values.update((v) => ({ ...v, [name]: value }));
    },

    reset() {
      values.set(defaults());
      touched.set({});
      submitting.set(false);
    },
  };

  return api;
}
