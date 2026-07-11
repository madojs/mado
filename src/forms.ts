/**
 * Typed form state over the browser's native form and constraint-validation
 * model. HTML owns required/type/min/max/pattern; Mado owns reactive state,
 * touched/dirty flags, async validation cancellation and submit state.
 */

import { computed, signal, type Computed, type Signal } from "./signal.js";
import { reportError } from "./diagnostics.js";

export type FormValue = unknown;
export type FormValues = Record<string, unknown>;
export type FormErrors<V extends FormValues = FormValues> = Partial<
  Record<string, string>
>;
export type FormTouched<V extends FormValues = FormValues> = Partial<
  Record<string, boolean>
>;

export interface FormValidationContext {
  signal: AbortSignal;
  form: HTMLFormElement | null;
}

export type FormValidator<V extends FormValues> = (
  values: Readonly<V>,
  context: FormValidationContext,
) => FormErrors<V> | null | Promise<FormErrors<V> | null>;

export interface UseFormOptions<V extends FormValues> {
  initial: V;
  validate?: FormValidator<V>;
}

export interface FormApi<V extends FormValues> {
  values: Signal<V>;
  errors: Computed<FormErrors<V>>;
  touched: Signal<FormTouched<V>>;
  dirty: Computed<boolean>;
  submitting: Signal<boolean>;
  validating: Signal<boolean>;
  isValid: Computed<boolean>;
  onInput(event: Event): void;
  onBlur(event: Event): void;
  onSubmit(
    handler: (values: Readonly<V>, event: SubmitEvent) => void | Promise<void>,
  ): (event: SubmitEvent) => void;
  setField<K extends Extract<keyof V, string>>(name: K, value: V[K]): void;
  reset(nextInitial?: V): void;
  validate(form?: HTMLFormElement | null): Promise<boolean>;
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function useForm<V extends FormValues>(
  options: UseFormOptions<V>,
): FormApi<V> {
  let initial = cloneValues(options.initial);
  const values = signal<V>(cloneValues(initial));
  const nativeErrors = signal<FormErrors<V>>({});
  const customErrors = signal<FormErrors<V>>({});
  const touched = signal<FormTouched<V>>({});
  const submitting = signal(false);
  const validating = signal(false);
  const errors = computed<FormErrors<V>>(() => ({
    ...nativeErrors(),
    ...customErrors(),
  }));
  const dirty = computed(() => !sameValues(values(), initial));
  const isValid = computed(() => Object.keys(errors()).length === 0);

  let lastForm: HTMLFormElement | null = null;
  let validationController: AbortController | null = null;
  let validationRun = 0;
  let activeSubmits = 0;

  const rememberForm = (event: Event, control?: FormControl | null) => {
    const current = event.currentTarget;
    if (isForm(current)) lastForm = current;
    else if (control?.form) lastForm = control.form;
  };

  const setField = <K extends Extract<keyof V, string>>(
    name: K,
    value: V[K],
  ): void => {
    values.update((current) => ({ ...current, [name]: value }));
    customErrors.update((current) => withoutKey(current, name));
  };

  const validate = async (
    form: HTMLFormElement | null = lastForm,
  ): Promise<boolean> => {
    if (form) lastForm = form;
    validationController?.abort();
    const controller = new AbortController();
    validationController = controller;
    const run = ++validationRun;

    const nextNative: FormErrors<V> = {};
    for (const control of controlsOf(form)) {
      const message = nativeValidationMessage(control);
      if (message) nextNative[control.name] = message;
    }
    nativeErrors.set(nextNative);

    if (!options.validate) {
      if (validationController === controller) validationController = null;
      return Object.keys(nextNative).length === 0;
    }

    validating.set(true);
    try {
      const result = await options.validate(values.peek(), {
        signal: controller.signal,
        form,
      });
      if (controller.signal.aborted || run !== validationRun) return false;
      customErrors.set(result ?? {});
      return Object.keys({ ...nextNative, ...(result ?? {}) }).length === 0;
    } catch (error) {
      if (controller.signal.aborted || run !== validationRun) return false;
      customErrors.set({ $form: "validation failed" });
      reportError("forms", "validator", "form validator threw", error);
      return false;
    } finally {
      if (run === validationRun) {
        validating.set(false);
        validationController = null;
      }
    }
  };

  const api: FormApi<V> = {
    values,
    errors,
    touched,
    dirty,
    submitting,
    validating,
    isValid,

    onInput(event) {
      const control = controlFromEvent(event);
      if (!control?.name) return;
      rememberForm(event, control);
      const name = control.name as Extract<keyof V, string>;
      setField(name, readControlValue(control, values.peek()[name], lastForm) as V[typeof name]);
      const message = nativeValidationMessage(control);
      nativeErrors.update((current) =>
        message ? { ...current, [name]: message } : withoutKey(current, name));
    },

    onBlur(event) {
      const control = controlFromEvent(event);
      if (!control?.name) return;
      rememberForm(event, control);
      touched.update((current) => ({ ...current, [control.name]: true }));
    },

    onSubmit(handler) {
      return (event) => {
        event.preventDefault();
        const form = isForm(event.currentTarget) ? event.currentTarget : lastForm;
        if (form) lastForm = form;
        const allTouched: FormTouched<V> = { ...touched.peek() };
        for (const control of controlsOf(form)) allTouched[control.name] = true;
        touched.set(allTouched);

        void (async () => {
          if (!(await validate(form))) {
            form?.reportValidity?.();
            return;
          }
          activeSubmits++;
          submitting.set(true);
          try {
            await handler(values.peek(), event);
          } catch (error) {
            reportError("forms", "submit", "form submit threw", error);
          } finally {
            activeSubmits--;
            submitting.set(activeSubmits > 0);
          }
        })();
      };
    },

    setField,

    reset(nextInitial) {
      validationRun++;
      validationController?.abort();
      validationController = null;
      validating.set(false);
      if (nextInitial) initial = cloneValues(nextInitial);
      values.set(cloneValues(initial));
      nativeErrors.set({});
      customErrors.set({});
      touched.set({});
      lastForm?.reset?.();
    },

    validate,
  };

  return api;
}

function controlFromEvent(event: Event): FormControl | null {
  const path = event.composedPath?.() ?? [];
  for (const candidate of path) {
    if (isFormControl(candidate)) return candidate;
  }
  return isFormControl(event.target) ? event.target : null;
}

function isFormControl(value: unknown): value is FormControl {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { name?: unknown; value?: unknown; tagName?: unknown };
  return typeof candidate.name === "string" &&
    ("value" in candidate || String(candidate.tagName).toLowerCase() === "select");
}

function isForm(value: unknown): value is HTMLFormElement {
  return !!value && typeof value === "object" &&
    String((value as { tagName?: unknown }).tagName).toLowerCase() === "form";
}

function controlsOf(form: HTMLFormElement | null): FormControl[] {
  if (!form) return [];
  const elements = form.elements ? Array.from(form.elements) :
    Array.from(form.querySelectorAll("input,select,textarea"));
  return elements.filter(isFormControl);
}

function nativeValidationMessage(control: FormControl): string | null {
  if (typeof control.checkValidity !== "function") return null;
  return control.checkValidity()
    ? null
    : control.validationMessage || "Invalid value";
}

function readControlValue(
  control: FormControl,
  previous: unknown,
  form: HTMLFormElement | null,
): unknown {
  if (isInput(control)) {
    if (control.type === "checkbox") {
      if (Array.isArray(previous)) {
        return controlsOf(form)
          .filter((item) => isInput(item) && item.type === "checkbox" &&
            item.name === control.name && item.checked)
          .map((item) => (item as HTMLInputElement).value);
      }
      return control.checked;
    }
    if (control.type === "radio") return control.checked ? control.value : previous;
    if (control.type === "number" || control.type === "range") {
      return control.value === "" ? "" : control.valueAsNumber;
    }
    if (control.type === "file") {
      const files = Array.from(control.files ?? []);
      return control.multiple ? files : files[0] ?? null;
    }
  }
  if (isSelect(control) && control.multiple) {
    return Array.from(control.selectedOptions, (option) => option.value);
  }
  return control.value;
}

function isInput(control: FormControl): control is HTMLInputElement {
  return String(control.tagName).toLowerCase() === "input";
}

function isSelect(control: FormControl): control is HTMLSelectElement {
  return String(control.tagName).toLowerCase() === "select";
}

function cloneValues<V extends FormValues>(value: V): V {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      Array.isArray(item) ? [...item] : item,
    ]),
  ) as V;
}

function sameValues(a: FormValues, b: FormValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length || left.some((item, i) => !Object.is(item, right[i]))) {
        return false;
      }
    } else if (!Object.is(left, right)) {
      return false;
    }
  }
  return true;
}

function withoutKey<T extends Record<string, unknown>>(value: T, key: string): T {
  const next = { ...value };
  delete next[key];
  return next;
}
