import { defineConfig, type Plugin } from "vite";
import { mado } from "@madojs/mado/vite";

/**
 * Tiny in-memory mock for the auth + billing API used by this starter.
 *
 * Mounted only in `dev` so `mado release` ships a clean bundle that
 * talks to your real backend. The endpoint shape mirrors what
 * `auth.connector.ts` and `stripe.connector.ts` expect: any change in
 * one must be mirrored in the other.
 *
 * Disable by removing this plugin or setting `MADO_MOCK_API=0`.
 */
function devApiMock(): Plugin {
  const users = new Map<string, { password: string; user: unknown }>([
    [
      "demo@mado.dev",
      {
        password: "demo123",
        user: {
          id: "u_demo",
          email: "demo@mado.dev",
          roles: ["user"],
          permissions: ["billing.read", "billing.invoices.pay"],
        },
      },
    ],
  ]);
  const invoices = Array.from({ length: 6 }, (_, i) => ({
    id: `in_${1000 + i}`,
    number: `INV-${1000 + i}`,
    customer_email: "demo@mado.dev",
    amount_due: 1000 * (i + 1),
    currency: "usd",
    status: i % 3 === 0 ? "paid" : i % 3 === 1 ? "pending" : "draft",
    created: Math.floor(Date.now() / 1000) - i * 86_400,
  }));
  let token: string | null = null;
  const json = (res: import("http").ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  const readJson = (req: import("http").IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let buf = "";
      req.on("data", (chunk) => (buf += chunk));
      req.on("end", () => {
        try {
          resolve(buf ? JSON.parse(buf) : {});
        } catch {
          resolve({});
        }
      });
    });

  return {
    name: "starter:dev-api-mock",
    apply: "serve",
    configureServer(server) {
      if (process.env.MADO_MOCK_API === "0") return;
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) return next();

        // ---- auth -----------------------------------------------------
        if (url === "/api/auth/login" && req.method === "POST") {
          const body = await readJson(req);
          const entry = users.get(String(body.email ?? ""));
          if (!entry || entry.password !== body.password) {
            return json(res, 401, { error: "invalid_credentials" });
          }
          token = `tok_${Math.random().toString(36).slice(2)}`;
          return json(res, 200, { token, user: entry.user });
        }
        if (url === "/api/auth/me" && req.method === "GET") {
          if (!token) return json(res, 401, { error: "unauthenticated" });
          const entry = users.values().next().value;
          if (!entry) return json(res, 500, { error: "mock_user_missing" });
          return json(res, 200, entry.user);
        }
        if (url === "/api/auth/logout" && req.method === "POST") {
          token = null;
          return json(res, 204, null);
        }

        // ---- billing --------------------------------------------------
        if (url.startsWith("/api/billing/stripe/invoices")) {
          const id = url.match(/\/invoices\/([^/?]+)/)?.[1];
          if (req.method === "POST" && url.endsWith("/pay") && id) {
            const inv = invoices.find((x) => x.id === id);
            if (!inv) return json(res, 404, { error: "not_found" });
            inv.status = "paid";
            return json(res, 200, inv);
          }
          if (id && req.method === "GET") {
            const inv = invoices.find((x) => x.id === id);
            return inv
              ? json(res, 200, inv)
              : json(res, 404, { error: "not_found" });
          }
          if (req.method === "GET") {
            return json(res, 200, { data: invoices, has_more: false });
          }
        }

        return next();
      });
    },
  };
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    devApiMock(),
    mado({
      // Public origin used to build absolute URLs for static snapshots
      // (sitemap, canonical, OpenGraph). Combined with Vite's `base`,
      // the canonical for a route is `site + base + pathname`.
      //
      // REQUIRED when any page declares `static`. Set to your deployment
      // origin (e.g. https://your-app.example) before running
      // `mado release`. Override per environment via:
      //   mado release --base-url https://staging.example
      //   MADO_SITE=https://staging.example mado release
      // site: "https://your-app.example",
    }),
  ],
});
