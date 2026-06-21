export function printHelp(ctx) {
  const mode = ctx.isRepo ? "repo-mode (framework repository)" : "app-mode";
  console.log(`mado commands (${mode}):

  Project lifecycle:
    mado init <name> [--starter default] [--force]
                           scaffold a new app
    mado dev               Vite dev server
    mado build             tsc package compile (writes internal dist/)
    mado typecheck         tsc --noEmit
    mado test              run unit tests

  Production:
    mado bake [--entry <file>] [--template <html>] [--out <dir>] [--base-url <url>]
                           prerender baked routes  -> out/
    mado release           typecheck + vite build + bake -> out/
    mado preview           serve exactly out/ locally

  Generators:
    mado new <module|page|connector|resource|service|form|component|guard|layout> <path>

  Configuration:
    Put app/dev/build settings in vite.config.ts.
    Mado CLI flags are explicit per command.

  Docs: README.md and docs/en/README.md.`);
}
