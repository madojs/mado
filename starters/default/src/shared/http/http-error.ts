// One error shape for the entire app. Connectors may subclass HttpError for
// their own provider-specific codes.

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { payload?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.payload = options?.payload;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isServer(): boolean {
    return this.status >= 500;
  }
}