export function printHelp(ctx) {
  const mode = ctx.isRepo ? "repo-mode (framework repository)" : "app-mode";
  const buildLine = ctx.isRepo
    ? "    mado build             tsc package compile (writes internal dist/)"
    : "    mado build             Vite production SPA build -> out/";
  console.log(`mado commands (${mode}):

  Project lifecycle:
    mado init <name> [--starter default] [--force]
                           scaffold a new app
    mado dev               Vite dev server
${buildLine}
    mado typecheck         tsc --noEmit
    mado test              run unit tests

  Production:
    mado static [--entry <file>] [--out <dir>] [--base-url <url>]
                [--browser-channel chrome | --browser-path <path>]
                           browser-snapshot static routes -> out/
                           (low-level; prefer \`mado release\`)
    mado release           typecheck + vite build + static snapshots
                           + deployment files -> out/
    mado preview           serve exactly out/ locally (production-like)

  Generators:
    mado new <module|page|connector|resource|service|form|component|guard|layout> <path>

  Configuration:
    Put app/dev/build settings in vite.config.ts.
    Mado CLI flags are explicit per command.

  Docs: README.md and docs/en/README.md.`);
}
