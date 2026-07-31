/**
 * Typed form state over the browser's native form and constraint-validation
 * model. HTML owns required/type/min/max/pattern; Mado owns reactive state,
 * touched/dirty flags, async validation cancellation and submit state.
 */
import { type Computed, type Signal } from "./signal.js";
export type FormValue = unknown;
export type FormValues = Record<string, unknown>;
/** Field errors plus the optional `$form` error for the whole value snapshot. */
export type FormErrors<V extends FormValues = FormValues> = Partial<Record<string, string>>;
export type FormTouched<V extends FormValues = FormValues> = Partial<Record<string, boolean>>;
export interface FormValidationContext {
    signal: AbortSignal;
    form: HTMLFormElement | null;
}
export type FormValidator<V extends FormValues> = (values: Readonly<V>, context: FormValidationContext) => FormErrors<V> | null | Promise<FormErrors<V> | null>;
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
    onSubmit(handler: (values: Readonly<V>, event: SubmitEvent) => void | Promise<void>): (event: SubmitEvent) => void;
    setField<K extends Extract<keyof V, string>>(name: K, value: V[K]): void;
    /**
     * Replaces externally supplied errors, such as a normalized server response.
     * Passing an empty object clears them without changing touched state.
     */
    setErrors(errors: FormErrors<V>): void;
    reset(nextInitial?: V): void;
    validate(form?: HTMLFormElement | null): Promise<boolean>;
}
export declare function useForm<V extends FormValues>(options: UseFormOptions<V>): FormApi<V>;
