export type HeadersLike = HeadersInit | Record<string, string | undefined>;

export type QueryValue = string | number | boolean | Date | null | undefined;
export type Query = Record<string, QueryValue | QueryValue[]>;

export type ResponseType = "auto" | "json" | "text" | "blob" | "arrayBuffer" | "stream";

export type RetryDelay = number | ((attempt: number, error: unknown) => number);

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryInfo {
  /** Which retry this is, starting at 1. */
  attempt: number;
  /** What failed: an `HTTPError`, `NetworkError` or `TimeoutError`. */
  error: unknown;
  /** Milliseconds until the retry is sent. */
  delay: number;
  request: RequestConfig;
}

export interface RequestOptions extends Omit<
  RequestInit,
  "body" | "headers" | "method" | "signal"
> {
  /** Prepended to relative URLs. Ignored when the URL is absolute. */
  baseURL?: string;
  headers?: HeadersLike;
  /** Query parameters. Merged over the client's default `query`. */
  query?: Query;
  /** Values for `:name` placeholders in the URL path, e.g. `/users/:id`. Values are URL-encoded. */
  params?: Record<string, string | number | boolean>;
  /** Plain objects and arrays are sent as JSON. Everything else is passed to `fetch` as-is. */
  body?: unknown;
  signal?: AbortSignal | null;
  /** Milliseconds before the request is aborted. `0` disables the timeout. Default: `0`. */
  timeout?: number;
  /** Milliseconds allowed for the whole call including retries and delays. `0` disables it. Default: `0`. */
  totalTimeout?: number;
  /** Extra attempts after the first one. Default: `0`. */
  retries?: number;
  /** Milliseconds to wait between attempts, or a function of the attempt number (starting at 0). Default: exponential from 300ms. */
  retryDelay?: RetryDelay;
  /** Randomizes each retry delay to between 50% and 100% of its value, to avoid synchronized retries. Default: `false`. */
  retryJitter?: boolean;
  /** Methods that are retried. Default: `GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`. */
  retryMethods?: string[];
  /** Response statuses that are retried. Default: `408 425 429 500 502 503 504`. */
  retryStatuses?: number[];
  /** Called before each retry. Useful for logging and metrics. */
  onRetry?: (info: RetryInfo) => void;
  /** Decides whether a status is a success. Statuses it rejects throw `HTTPError`. Default: 2xx. */
  validateStatus?: (status: number) => boolean;
  /**
   * How to read the response body. `auto` picks JSON or text from the `content-type` header.
   * `stream` returns `response.body` unread, and the timeout then only covers waiting for headers.
   */
  responseType?: ResponseType;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchFunction;
  /** Passed through to `fetch` for Next.js caching. */
  next?: { revalidate?: number | false; tags?: string[] };
}

export type ClientOptions = Omit<RequestOptions, "body" | "params" | "signal">;

/** The request as it is sent. Request interceptors may modify or replace it. */
export interface RequestConfig {
  url: string;
  method: string;
  headers: Headers;
  body?: BodyInit;
  signal?: AbortSignal;
  timeout: number;
  totalTimeout: number;
  retries: number;
  retryDelay: RetryDelay;
  retryJitter: boolean;
  retryMethods: string[];
  retryStatuses: number[];
  onRetry?: (info: RetryInfo) => void;
  validateStatus: (status: number) => boolean;
  responseType: ResponseType;
  fetch?: FetchFunction;
  /** Remaining options forwarded to `fetch` (`credentials`, `cache`, `next`, ...). */
  init: RequestInit;
}

export interface YavqoResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
  url: string;
  /** The underlying `Response`. Its body has already been read. */
  raw: Response;
}

type MaybePromise<T> = T | Promise<T>;

export type RequestInterceptor = (config: RequestConfig) => MaybePromise<RequestConfig | void>;
export type ResponseInterceptor = (response: YavqoResponse) => MaybePromise<YavqoResponse | void>;

export interface Interceptors<T> {
  /** Registers an interceptor and returns a function that removes it. */
  use(interceptor: T): () => void;
}

type RequestMethodOptions = Omit<RequestOptions, "body">;

export interface Client {
  request<T = unknown>(
    url: string,
    options?: RequestOptions & { method?: string },
  ): Promise<YavqoResponse<T>>;
  /** Creates a new client with these options layered over this client's defaults and interceptors. */
  extend(options?: ClientOptions): Client;
  /** Sends a HEAD request and returns the response headers. */
  head(url: string, options?: RequestMethodOptions): Promise<Headers>;
  get<T = unknown>(url: string, options?: RequestMethodOptions): Promise<T>;
  post<T = unknown>(url: string, body?: unknown, options?: RequestMethodOptions): Promise<T>;
  put<T = unknown>(url: string, body?: unknown, options?: RequestMethodOptions): Promise<T>;
  patch<T = unknown>(url: string, body?: unknown, options?: RequestMethodOptions): Promise<T>;
  delete<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  interceptors: {
    request: Interceptors<RequestInterceptor>;
    response: Interceptors<ResponseInterceptor>;
  };
}
