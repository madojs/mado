// HTTP interceptors. Register here once, every connector benefits.
//
// Auth interceptor is wired by modules/auth at boot time via registerAuthToken.

type RequestInterceptor = (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>;
type ResponseInterceptor = (res: Response) => Response | Promise<Response>;

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];

export function addRequestInterceptor(fn: RequestInterceptor): () => void {
  requestInterceptors.push(fn);
  return () => {
    const i = requestInterceptors.indexOf(fn);
    if (i >= 0) requestInterceptors.splice(i, 1);
  };
}

export function addResponseInterceptor(fn: ResponseInterceptor): () => void {
  responseInterceptors.push(fn);
  return () => {
    const i = responseInterceptors.indexOf(fn);
    if (i >= 0) responseInterceptors.splice(i, 1);
  };
}

export async function applyRequestInterceptors(
  url: string,
  init: RequestInit,
): Promise<RequestInit> {
  let current = init;
  for (const fn of requestInterceptors) {
    current = await fn(url, current);
  }
  return current;
}

export async function applyResponseInterceptors(res: Response): Promise<Response> {
  let current = res;
  for (const fn of responseInterceptors) {
    current = await fn(current);
  }
  return current;
}

// Convenience: a token provider the auth module plugs into.
let getToken: (() => string | null) | null = null;

export function registerAuthTokenProvider(provider: () => string | null): void {
  getToken = provider;
  addRequestInterceptor((_url, init) => {
    const token = getToken?.();
    if (!token) return init;
    return {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    };
  });
}