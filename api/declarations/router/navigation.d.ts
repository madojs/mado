/**
 * Browser integration: History API, click interception, hover-prefetch,
 * View Transitions, queryParam.
 *
 * Everything that touches `window` / `document` / `history` lives here,
 * so match.ts remains clean and testable without jsdom.
 */
import { type Signal } from "./../signal.js";
import { type Routes } from "./match.js";
import type { TemplateResult } from "../html/template-types.js";
export interface RouterApi {
    /** Signal function that returns the current TemplateResult. */
    view: () => TemplateResult;
    /** Current path as a signal. */
    path: () => string;
    /** Programmatic navigation. No-op after dispose(). */
    navigate(to: string, opts?: {
        replace?: boolean;
    }): void;
    /** Remove listeners, cancel delayed navigation writes and release resources. */
    dispose(): void;
}
export interface RouterOptions {
    /**
     * Use the View Transitions API on navigation (smooth crossfade).
     * Default `true` — if the browser doesn't support it, safely
     * falls back to a plain set().
     */
    viewTransitions?: boolean;
    /**
     * Hook for hover prefetch. Receives the pathname of the candidate
     * (without origin, query/hash stripped). Used by routes()
     * to register loaders; raw router() doesn't normally need this.
     */
    prefetch?: (pathname: string) => void;
    /**
     * Restore saved scroll on back/forward and scroll new navigations to top.
     * Default true.
     */
    scrollRestoration?: boolean;
    /**
     * Move focus to the main content landmark after navigation.
     * Default true.
     */
    focusManagement?: boolean;
}
/**
 * Minimal History API router.
 *
 *   const route = router({
 *     '/':          () => html`<x-home/>`,
 *     '/users/:id': ({ id }) => html`<x-user .id=${id}/>`,
 *     '*':          () => html`<x-404/>`,
 *   });
 *
 *   html`<main>${route.view}</main>`
 *
 * Lifecycle: subscribes to popstate + intercepts clicks
 * on `<a data-link>` + hover-prefetch (if hook given). All this
 * is removed in `dispose()` — mandatory to call in tests and
 * dev-overlay, otherwise listener leak.
 */
export declare function router(routes: Routes, options?: RouterOptions): RouterApi;
/**
 * Global helper for programmatic navigation. Equivalent to
 * `api.navigate(to)` for any active router — updates the URL
 * via History API and dispatches `popstate`, which all
 * active routers on the page will pick up.
 *
 *   import { navigate } from "@madojs/mado";
 *   navigate("/users/42");
 *
 * Used inside form handlers / events when you don't have
 * direct access to RouterApi (e.g. inside a component's setup function
 * that didn't receive the router as a parameter).
 */
export declare function navigate(to: string, opts?: {
    replace?: boolean;
}): void;
export interface QueryParam {
    (): string;
    set(value: string | null, opts?: {
        push?: boolean;
    }): void;
}
/**
 * Reactive query parameter.
 *
 *   const page = queryParam('page', '1');
 *   page();              // '1' (or current URL value)
 *   page.set('2');       // history.replaceState and update subscribed slots
 *   page.set(null);      // delete the parameter
 */
export declare function queryParam(name: string, defaultValue?: string): QueryParam;
/**
 * For typing purposes — same characteristics as Signal<string>.
 * Convenient in places that expect a plain signal.
 */
export type QuerySignal = Signal<string>;
