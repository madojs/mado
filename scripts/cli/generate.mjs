import { existsSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { logger } from "../logger.mjs";

const KINDS = [
  "module",
  "page",
  "connector",
  "resource",
  "service",
  "form",
  "component",
  "guard",
  "layout",
];

/**
 * Generators support two starter shapes:
 *
 *   modular  — src/modules/<name>/<...>           (default behaviour)
 *   universal— src/pages, src/components, src/content (the default starter)
 *
 * Detection is structural: a project with `src/modules/` is treated as
 * modular; otherwise the universal layout is assumed. This lets users of
 * either starter run `mado new` without configuring anything, and keeps
 * the modular contract intact for projects that opt into it.
 */
function detectStarterShape(ctx) {
  if (existsSync(join(ctx.projectRoot, "src/modules"))) return "modular";
  if (existsSync(join(ctx.projectRoot, "src/pages"))) return "universal";
  // No explicit hint — fall back to modular, which matches the
  // historical behaviour and is documented in the generator help.
  return "modular";
}

/** Generators that only make sense inside the modular starter. */
const MODULAR_ONLY = new Set([
  "module",
  "connector",
  "resource",
  "service",
  "form",
  "guard",
]);

export async function runNew(ctx, args) {
  const [kind, target] = args;
  if (!kind || !target) {
    printUsage();
    process.exit(1);
  }

  const shape = detectStarterShape(ctx);
  if (shape === "universal" && MODULAR_ONLY.has(kind)) {
    logger.error("mado", "generator-shape", `'${kind}' is not available in the universal starter`);
    logger.info("mado", "generator-hint", "Create src/modules/<name>/ or run: mado init my-app --starter modular");
    process.exit(1);
  }

  const generators = {
    module: scaffoldModule,
    page: scaffoldPage,
    connector: scaffoldConnector,
    resource: scaffoldResource,
    service: scaffoldService,
    form: scaffoldForm,
    component: scaffoldComponent,
    guard: scaffoldGuard,
    layout: scaffoldLayout,
  };

  const fn = generators[kind];
  if (!fn) {
    logger.error("mado", "unknown-generator", `unknown generator: ${kind}`);
    logger.info("mado", "available-generators", `available generators: ${KINDS.join(", ")}`);
    process.exit(1);
  }

  await fn(ctx, normalizeTarget(target), shape);
}

function printUsage() {
  console.error("usage: mado new <module|page|connector|resource|service|form|component|guard|layout> <path>");
  console.error("");
  console.error("examples:");
  console.error("  mado new module billing");
  console.error("  mado new page billing/pages/invoices-list");
  console.error("  mado new connector billing/api/stripe");
  console.error("  mado new resource billing/data/invoices");
  console.error("  mado new service billing/cart");
  console.error("  mado new form billing/invoice");
  console.error("  mado new component billing/components/invoice-status-badge");
  console.error("  mado new guard billing/billing");
  console.error("  mado new layout app-shell");
}

async function scaffoldModule(ctx, name) {
  assertSingleSegment("Module", name);
  const dir = join(srcDir(ctx), "modules", name);
  const camel = kebabToCamel(name);
  const Pascal = kebabToPascal(name);

  await writeOnce(
    join(dir, `${name}.types.ts`),
    `// Domain types of the ${name} module. Public via ${name}.public.ts.\n\nexport interface ${Pascal} {\n  id: string;\n}\n`,
  );
  await writeOnce(
    join(dir, `${name}.routes.ts`),
    `// Path prefix is applied in src/app.routes.ts.\n\nexport const ${camel}Routes = {\n  // "/": () => import("./${name}.page"),\n};\n`,
  );
  await writeOnce(
    join(dir, `${name}.public.ts`),
    `// Public surface of the ${name} module.\n// Anything not re-exported here is private to the module.\n\nexport type { ${Pascal} } from "./${name}.types";\n`,
  );

  console.log(
    `\nNext step: wire the module in src/app.routes.ts:\n\n` +
      `  import { ${camel}Routes } from "./modules/${name}/${name}.routes";\n\n` +
      `  "/${name}": layout({\n` +
      `    layout: () => import("./layouts/app-shell.layout"),\n` +
      `    routes: ${camel}Routes,\n` +
      `  }),\n`,
  );
}

async function scaffoldPage(ctx, target, shape) {
  const file =
    shape === "universal"
      ? join(srcDir(ctx), "pages", `${leafName(target)}.page.ts`)
      : moduleFile(ctx, target, ".page.ts");
  const name = leafName(target);
  await writeOnce(
    file,
    `import { html, page } from "@madojs/mado";

export default page({
  title: "${kebabToPascal(name)}",
  view: () => {
    // 1. LOCAL STATE
    // 2. DATA
    // 3. ACTIONS

    // 4. VIEW
    return html\`
      <section>
        <h1>${kebabToPascal(name)}</h1>
      </section>
    \`;
  },
});
`,
  );
}

async function scaffoldConnector(ctx, target) {
  const file = moduleFile(ctx, target, ".connector.ts");
  const name = leafName(target);
  const api = `${kebabToCamel(name)}Api`;
  const err = `${kebabToPascal(name)}Error`;
  const up = relative(dirname(file), join(srcDir(ctx), "shared")).split("\\").join("/");

  await writeOnce(
    file,
    `// ${kebabToPascal(name)} connector. One file per external API system.
// Shape: CONFIG -> MAPPERS -> ENDPOINTS -> ERRORS.
// Never import signals, resources, html, components, pages, or services here.

import { httpClient } from "${up}/http/http-client";
import { HttpError } from "${up}/http/http-error";

// 1. CONFIG
const base = "/api/${name}";

// 2. MAPPERS
// Map provider DTOs from _contracts/ to domain types from <module>.types.ts.

// 3. ENDPOINTS
export const ${api} = {
  list: () => httpClient.get<unknown[]>(base),
};

// 4. ERRORS
export class ${err} extends HttpError {
  override readonly name = "${err}";
}
`,
  );
}

async function scaffoldResource(ctx, target) {
  const file = moduleFile(ctx, target, ".resource.ts");
  const name = leafName(target);
  const Pascal = kebabToPascal(name);
  await writeOnce(
    file,
    `import { mutation, resource } from "@madojs/mado";

// Resource keys are URL-shaped so mutation invalidation stays predictable.
const key = "/api/${name}";

export const use${Pascal} = () =>
  resource(
    () => key,
    async () => {
      throw new Error("TODO: connect use${Pascal}() to a module connector");
    },
    { staleTime: 30_000 },
  );

export const save${Pascal} = mutation(
  async (_input: unknown) => {
    throw new Error("TODO: connect save${Pascal}() to a module connector");
  },
  { invalidates: ["/api/${name}*"] },
);
`,
  );
}

async function scaffoldService(ctx, target) {
  const file = moduleFile(ctx, target, ".service.ts");
  const name = leafName(target);
  const camel = kebabToCamel(name);
  const Pascal = kebabToPascal(name);
  await writeOnce(
    file,
    `import { computed, signal } from "@madojs/mado";

export interface ${Pascal} {
  id: string;
}

// 1. PRIVATE STATE
const _${camel} = signal<${Pascal} | null>(null);

// 2. PUBLIC READS
export const ${camel} = (): ${Pascal} | null => _${camel}();
export const has${Pascal} = computed(() => _${camel}() !== null);

// 3. ACTIONS
export function set${Pascal}(next: ${Pascal} | null): void {
  _${camel}.set(next);
}

// 4. INIT
export function init${Pascal}(): void {}
`,
  );
}

async function scaffoldForm(ctx, target) {
  const file = moduleFile(ctx, target, ".form.ts");
  const name = leafName(target);
  const useName = `use${kebabToPascal(name)}Form`;
  await writeOnce(
    file,
    `import { useForm } from "@madojs/mado";

// Call inside a page view: const form = ${useName}();
export const ${useName} = () =>
  useForm({
    // name: { required: true },
  });
`,
  );
}

async function scaffoldComponent(ctx, target, shape) {
  const file =
    shape === "universal"
      ? join(srcDir(ctx), "components", `${leafName(target)}.component.ts`)
      : moduleFile(ctx, target, ".component.ts");
  const name = leafName(target);
  const tag = name.includes("-") ? name : `x-${name}`;
  await writeOnce(
    file,
    `import { component, css, html } from "@madojs/mado";

component(
  "${tag}",
  () => () => html\`<span><slot></slot></span>\`,
  {
    styles: css\`
      :host {
        display: inline-block;
      }
    \`,
  },
);
`,
  );
}

async function scaffoldGuard(ctx, target) {
  const file = moduleFile(ctx, target, ".guard.ts");
  const name = leafName(target);
  const Pascal = kebabToPascal(name);
  await writeOnce(
    file,
    `// Return true to allow, a path string to redirect, or false to deny.

export function require${Pascal}(): boolean | string {
  return true;
}
`,
  );
}

async function scaffoldLayout(ctx, name) {
  assertSingleSegment("Layout", name);
  const file = join(srcDir(ctx), "layouts", `${name}.layout.ts`);
  await writeOnce(
    file,
    `import { html, page } from "@madojs/mado";

export default page({
  title: "${kebabToPascal(name)}",
  view: ({ child }) => html\`
    <div class="layout layout--${name}">
      <main>\${child}</main>
    </div>
  \`,
});
`,
  );

  console.log(
    `\nNext step: wrap routes with this layout in src/app.routes.ts:\n\n` +
      `  "/<prefix>": layout({\n` +
      `    layout: () => import("./layouts/${name}.layout"),\n` +
      `    routes: <moduleRoutes>,\n` +
      `  }),\n`,
  );
}

function srcDir(ctx) {
  return join(ctx.projectRoot, "src");
}

function moduleFile(ctx, target, suffix) {
  return join(srcDir(ctx), "modules", `${target}${suffix}`);
}

async function writeOnce(path, content) {
  if (await exists(path)) {
    logger.error("mado", "file-exists", `file already exists: ${path}`);
    process.exit(2);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  console.log(`created ${path}`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeTarget(target) {
  return target
    .split("\\").join("/")
    .replace(/^src\/modules\//, "")
    .replace(/^modules\//, "")
    .replace(/^src\/layouts\//, "")
    .replace(/^layouts\//, "")
    .replace(/^\/+|\/+$/g, "");
}

function leafName(target) {
  return target.split("/").filter(Boolean).at(-1) ?? target;
}

function assertSingleSegment(label, name) {
  if (name.includes("/")) {
    logger.error("mado", "invalid-name", `${label.toLowerCase()} name must be a single path segment`);
    process.exit(1);
  }
}

function kebabToCamel(s) {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function kebabToPascal(s) {
  const c = kebabToCamel(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}
