import {
  component,
  html,
  type PageContext,
  type Resource,
  type SetupFn,
} from "@madojs/mado";

const directSetup: SetupFn = () => html`<span>Ready</span>`;
component("x-direct-contract", directSetup);

// @ts-expect-error 0.14 removes the renderer-function component overload.
const legacySetup: SetupFn = () => () => html`<span>Legacy</span>`;
void legacySetup;

const missingPageCleanup: PageContext<Record<string, string>, undefined> = {
  params: {},
  data: undefined,
  path: () => "/",
  child: null,
  // @ts-expect-error PageContext.onDispose is a required runtime guarantee.
  onDispose: undefined,
};
void missingPageCleanup;

declare const users: Resource<readonly string[]>;
const disposed: void = users.dispose();
void disposed;
