import { AbortError, HTTPError, NetworkError, TimeoutError, YavqoError } from "./errors";
import type {
  Client,
  ClientOptions,
  RequestConfig,
  RequestInterceptor,
  RequestOptions,
  ResponseInterceptor,
  YavqoResponse,
} from "./types";
import { buildURL, isJSONBody, mergeHeaders, parseBody, sleep } from "./utils";

const IDEMPOTENT_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];
const RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];
const MAX_RETRY_AFTER = 30_000;
const defaultRetryDelay = (attempt: number) => 300 * 2 ** attempt;

export function createClient(defaults: ClientOptions = {}): Client {
  return build(defaults, [], []);
}

function build(
  defaults: ClientOptions,
  requestHooks: RequestInterceptor[],
  responseHooks: ResponseInterceptor[],
): Client {
  const register =
    <T>(hooks: T[]) =>
    (hook: T) => {
      hooks.push(hook);
      return () => {
        const index = hooks.indexOf(hook);
        if (index !== -1) hooks.splice(index, 1);
      };
    };

  async function request<T = unknown>(
    url: string,
    options: RequestOptions & { method?: string } = {},
  ): Promise<YavqoResponse<T>> {
    let config = resolveConfig(url, defaults, options);
    for (const hook of requestHooks) {
      const next = await hook(config);
      if (next) config = next;
    }

    let response = await send(config);
    for (const hook of responseHooks) {
      const next = await hook(response);
      if (next) response = next;
    }

    if (!response.ok) throw new HTTPError(response);
    return response as YavqoResponse<T>;
  }

  const withBody =
    (method: string) =>
    async <T>(url: string, body?: unknown, options?: Omit<RequestOptions, "body">) =>
      (await request<T>(url, { ...options, method, body })).data;

  return {
    request,
    extend: (options = {}) =>
      build(
        { ...defaults, ...options, headers: mergeHeaders(defaults.headers, options.headers) },
        [...requestHooks],
        [...responseHooks],
      ),
    head: async (url, options) => (await request(url, { ...options, method: "HEAD" })).headers,
    get: async (url, options) => (await request(url, { ...options, method: "GET" })).data as never,
    post: withBody("POST"),
    put: withBody("PUT"),
    patch: withBody("PATCH"),
    delete: async (url, options) =>
      (await request(url, { ...options, method: "DELETE" })).data as never,
    interceptors: {
      request: { use: register(requestHooks) },
      response: { use: register(responseHooks) },
    },
  };
}

function resolveConfig(
  url: string,
  defaults: ClientOptions,
  options: RequestOptions & { method?: string },
): RequestConfig {
  const {
    baseURL,
    query,
    body,
    headers,
    method = "GET",
    signal,
    timeout = 0,
    retries = 0,
    retryDelay = defaultRetryDelay,
    retryMethods = IDEMPOTENT_METHODS,
    retryStatuses = RETRY_STATUSES,
    responseType = "auto",
    fetch,
    ...init
  } = { ...defaults, ...options };

  const merged = mergeHeaders(defaults.headers, options.headers);
  if (!merged.has("accept")) merged.set("accept", "application/json, text/plain, */*");

  let payload: BodyInit | undefined;
  if (body != null) {
    if (isJSONBody(body)) {
      payload = JSON.stringify(body);
      if (!merged.has("content-type")) merged.set("content-type", "application/json");
    } else {
      payload = body as BodyInit;
    }
  }

  return {
    url: buildURL(url, baseURL, query),
    method: method.toUpperCase(),
    headers: merged,
    body: payload,
    signal: signal ?? undefined,
    timeout,
    retries,
    retryDelay,
    retryMethods: retryMethods.map((m) => m.toUpperCase()),
    retryStatuses,
    responseType,
    fetch,
    init,
  };
}

async function send(config: RequestConfig): Promise<YavqoResponse> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < config.retries && config.retryMethods.includes(config.method);
    let error: unknown;

    try {
      const response = await attemptOnce(config);
      if (response.ok || !canRetry || !config.retryStatuses.includes(response.status))
        return response;
      error = new HTTPError(response);
    } catch (e) {
      if (!canRetry || !(e instanceof NetworkError || e instanceof TimeoutError)) throw e;
      error = e;
    }

    const { retryDelay } = config;
    const delay = typeof retryDelay === "function" ? retryDelay(attempt, error) : retryDelay;
    await sleep(retryAfter(error) ?? delay, config.signal);
  }
}

/** Reads a `Retry-After` header (seconds or HTTP date) from a failed response, capped at 30s. */
function retryAfter(error: unknown): number | undefined {
  if (!(error instanceof HTTPError)) return undefined;
  const value = error.response.headers.get("retry-after");
  if (!value) return undefined;

  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isNaN(ms) ? undefined : Math.min(Math.max(ms, 0), MAX_RETRY_AFTER);
}

/** One attempt: fetch, read the body, and translate failures into Yavqo errors. */
async function attemptOnce(config: RequestConfig): Promise<YavqoResponse> {
  const controller = new AbortController();
  const { signal, timeout } = config;
  let timedOut = false;

  const abort = () => controller.abort();
  const timer =
    timeout > 0
      ? setTimeout(() => {
          timedOut = true;
          abort();
        }, timeout)
      : undefined;

  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });

  try {
    const doFetch = config.fetch ?? fetch;
    const raw = await doFetch(config.url, {
      ...config.init,
      method: config.method,
      headers: config.headers,
      body: config.body,
      signal: controller.signal,
    });
    const data = await parseBody(raw, config.responseType);

    return {
      data,
      status: raw.status,
      statusText: raw.statusText,
      ok: raw.ok,
      headers: raw.headers,
      url: raw.url || config.url,
      raw,
    };
  } catch (error) {
    if (error instanceof YavqoError) throw error;
    if (timedOut) throw new TimeoutError(timeout, { cause: error });
    if (signal?.aborted) throw new AbortError({ cause: error });
    throw new NetworkError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
