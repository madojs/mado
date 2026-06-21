// ESLint config for the Mado modular starter.
//
// Goals:
//   1. Enforce architectural boundaries (shared/ vs modules/, public surface).
//   2. Enforce file-form conventions (a *.connector.ts cannot import a *.page.ts, etc.).
//   3. Forbid barrel files and runtime CSS imports outside main.ts.
//
// One ESLint config, always strict. There is no "loose" mode.

import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        // App composition root — entry points + manifest.
        { type: "app-root", pattern: "src/{main,app.routes}.ts", mode: "file" },

        // App-level layouts. Live in src/layouts/ because they describe
        // app zones (auth zone, app zone, marketing zone), not domains.
        { type: "app-layout", pattern: "src/layouts/*.layout.ts", mode: "file" },

        // Cross-cutting layer.
        { type: "shared", pattern: "src/shared/**" },

        // Module sub-layers (more specific patterns first).
        // NB: there is no `module-layout` — modules don't own layouts.
        { type: "module-public", pattern: "src/modules/*/*.public.ts", mode: "file" },
        { type: "module-types", pattern: "src/modules/*/*.types.ts", mode: "file" },
        { type: "module-routes", pattern: "src/modules/*/*.routes.ts", mode: "file" },
        { type: "module-guard", pattern: "src/modules/*/*.guard.ts", mode: "file" },
        { type: "module-contracts", pattern: "src/modules/*/_contracts/**" },
        { type: "module-connector", pattern: "src/modules/**/*.connector.ts", mode: "file" },
        { type: "module-resource", pattern: "src/modules/**/*.resource.ts", mode: "file" },
        { type: "module-service", pattern: "src/modules/**/*.service.ts", mode: "file" },
        { type: "module-form", pattern: "src/modules/**/*.form.ts", mode: "file" },
        { type: "module-page", pattern: "src/modules/**/*.page.ts", mode: "file" },
        { type: "module-component", pattern: "src/modules/**/*.component.ts", mode: "file" },
        { type: "module-internal", pattern: "src/modules/*/**" },
      ],
      "boundaries/include": ["src/**/*.ts"],
    },
    rules: {
      // ---------------------------------------------------------------------
      // 1. Module boundaries
      // ---------------------------------------------------------------------
      "boundaries/element-types": [
        2,
        {
          default: "disallow",
          rules: [
            // app-root may import anything (it composes the app)
            { from: "app-root", allow: ["*"] },

            // app-layout: pure UI wrapper. May read other modules' public
            // for nav state (auth, i18n…). No connectors/resources/services.
            {
              from: "app-layout",
              allow: ["shared", "module-public", "module-types"],
            },

            // shared/* lives in isolation
            { from: "shared", allow: ["shared"] },

            // module-public: gateway only re-exports module internals
            {
              from: "module-public",
              allow: [
                "shared",
                "module-internal",
                "module-types",
                "module-service",
                "module-resource",
                "module-form",
                "module-guard",
              ],
            },

            // module-types are pure types
            { from: "module-types", allow: ["module-types"] },

            // module-routes: plain map of paths to lazy pages of THIS module.
            // Modules do not own layouts — composition happens in app.routes.ts.
            {
              from: "module-routes",
              allow: ["module-page"],
            },

            // module-guard: reads service state of its own module
            {
              from: "module-guard",
              allow: ["module-service", "module-public", "module-types", "shared"],
            },

            // _contracts are private DTOs of one connector
            { from: "module-contracts", allow: ["module-contracts"] },

            // Connectors talk to HTTP and contracts. No UI, no signals.
            {
              from: "module-connector",
              allow: ["shared", "module-contracts", "module-types"],
            },

            // Resources/mutations bridge connector ↔ app
            {
              from: "module-resource",
              allow: ["shared", "module-connector", "module-types", "module-public"],
            },

            // Services hold module state. May talk to other modules' public.
            {
              from: "module-service",
              allow: [
                "shared",
                "module-connector",
                "module-resource",
                "module-types",
                "module-public",
              ],
            },

            // Forms = schema + validators
            {
              from: "module-form",
              allow: ["shared", "module-types", "module-public"],
            },

            // Pages may use everything inside their own module + shared + others' public
            {
              from: "module-page",
              allow: [
                "shared",
                "module-component",
                "module-service",
                "module-resource",
                "module-form",
                "module-types",
                "module-public",
                "module-internal",
              ],
            },

            // Reusable components stay UI-only: no business state.
            {
              from: "module-component",
              allow: ["shared", "module-component", "module-types"],
            },

            // Fallback for module-internal helpers (_parts/*, etc.)
            {
              from: "module-internal",
              allow: ["shared", "module-internal", "module-types", "module-public"],
            },
          ],
        },
      ],

      // ---------------------------------------------------------------------
      // 2. No barrel files. Encourages explicit imports, helps tree-shaking
      //    and reduces LLM context noise.
      // ---------------------------------------------------------------------
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message:
            "Barrel re-exports are forbidden. Re-export individual symbols in *.public.ts.",
        },
      ],

      // ---------------------------------------------------------------------
      // 3. Imports
      // ---------------------------------------------------------------------
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/index", "**/index.ts", "**/index.js"],
              message: "Do not import from index files. Import the file directly.",
            },
          ],
        },
      ],

      // ---------------------------------------------------------------------
      // 4. TypeScript hygiene
      // ---------------------------------------------------------------------
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Only main.ts may import CSS at runtime.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/main.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*.css", "**/*.css"],
              message:
                "Import CSS only in src/main.ts. Component styles must use css`` inside the component file.",
            },
            {
              group: ["**/index", "**/index.ts", "**/index.js"],
              message: "Do not import from index files. Import the file directly.",
            },
          ],
        },
      ],
    },
  },

  // _contracts are DTOs for connectors only.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.connector.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_contracts/*"],
              message:
                "External DTOs (_contracts) are private to the connector. Use the domain type instead.",
            },
          ],
        },
      ],
    },
  },
];
