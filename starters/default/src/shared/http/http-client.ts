// One http client for the whole app. Modules' *.connector.ts files build on
// top of this and never call fetch() directly. This is what lets you swap
// auth, retries or base URLs in one place.

import { HttpError } from "./http-error";
import { applyRequestInterceptors, applyResponseInterceptors } from "./interceptors";

export interface HttpRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const baseUrl = (() => {
  if (typeof window === "undefined") return "";
  const meta = document.querySelector('meta[name="api-base"]');
  return meta?.getAttribute("content") ?? "";
})();

function buildUrl(path: string, query?: HttpRequest["query"]): string {
  const url = new URL(path, baseUrl || window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString().replace(window.location.origin, "");
}

async function request<T>(path: string, init: HttpRequest = {}): Promise<T> {
  const url = buildUrl(path, init.query);

  let req: RequestInit = {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  };
  if (init.body !== undefined) req.body = JSON.stringify(init.body);
  if (init.signal) req.signal = init.signal;

  req = await applyRequestInterceptors(url, req);

  let res: Response;
  try {
    res = await fetch(url, req);
  } catch (cause) {
    throw new HttpError(0, "NETWORK_ERROR", "Network request failed", { cause });
  }

  res = await applyResponseInterceptors(res);

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text().catch(() => "");
    }
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : res.statusText) || "Request failed";
    throw new HttpError(res.status, `HTTP_${res.status}`, message, { payload });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const httpClient = {
  get: <T>(path: string, init?: Omit<HttpRequest, "method" | "body">) =>
    request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, body?: unknown, init?: Omit<HttpRequest, "method" | "body">) =>
    request<T>(path, { ...init, method: "POST", body }),
  put: <T>(path: string, body?: unknown, init?: Omit<HttpRequest, "method" | "body">) =>
    request<T>(path, { ...init, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, init?: Omit<HttpRequest, "method" | "body">) =>
    request<T>(path, { ...init, method: "PATCH", body }),
  delete: <T>(path: string, init?: Omit<HttpRequest, "method" | "body">) =>
    request<T>(path, { ...init, method: "DELETE" }),
};
