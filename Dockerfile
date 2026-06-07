# Two-stage build: tsc + esbuild bundle → nginx static.
# No webpack/CRA/Nx: two tools, one understandable place.

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Cache dependencies.
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples
COPY scripts ./scripts

RUN npx tsc
RUN node scripts/bundle.mjs

# ---------- Stage 2: serve ----------
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
