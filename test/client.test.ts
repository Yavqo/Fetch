import { describe, expect, it, vi } from "vitest";
import {
  AbortError,
  HTTPError,
  NetworkError,
  TimeoutError,
  YavqoError,
  createClient,
  type FetchFunction,
} from "../src";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const mockFetch = (...responses: (Response | Error)[]) => {
  const queue = [...responses];
  return vi.fn<FetchFunction>(async () => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (next instanceof Error) throw next;
    return next.clone();
  });
};

const hangingFetch: FetchFunction = (_url, init) =>
  new Promise((_, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort);
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caught = (promise: Promise<unknown>): Promise<any> =>
  promise.then(
    () => undefined,
    (e) => e,
  );

describe("requests", () => {
  it("returns parsed JSON from get()", async () => {
    const fetch = mockFetch(json({ id: 1, name: "Ada" }));
    const api = createClient({ fetch });

    await expect(api.get<{ id: number }>("https://api.test/users/1")).resolves.toEqual({
      id: 1,
      name: "Ada",
    });
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "GET" });
  });

  it("joins baseURL and url regardless of slashes", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ baseURL: "https://api.test/v1/", fetch });

    await api.get("/users");
    await api.get("https://other.test/x");

    expect(fetch.mock.calls[0]![0]).toBe("https://api.test/v1/users");
    expect(fetch.mock.calls[1]![0]).toBe("https://other.test/x");
  });

  it("serializes query params, skipping null and undefined", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ fetch });

    await api.get("https://api.test/search?x=1", {
      query: { q: "a b", page: 2, tag: ["a", "b"], skip: undefined, none: null, on: true },
    });

    expect(fetch.mock.calls[0]![0]).toBe(
      "https://api.test/search?x=1&q=a+b&page=2&tag=a&tag=b&on=true",
    );
  });

  it.each(["post", "put", "patch"] as const)("%s() sends objects as JSON", async (method) => {
    const fetch = mockFetch(json({ ok: true }));
    const api = createClient({ fetch });

    await api[method]("https://api.test/items", { name: "x" });

    const init = fetch.mock.calls[0]![1]!;
    expect(init.method).toBe(method.toUpperCase());
    expect(init.body).toBe('{"name":"x"}');
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("sends delete() with the DELETE method", async () => {
    const fetch = mockFetch(new Response(null, { status: 204 }));
    const api = createClient({ fetch });

    await expect(api.delete("https://api.test/items/1")).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "DELETE" });
  });

  it("passes non-JSON bodies through untouched", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ fetch });
    const form = new URLSearchParams({ a: "1" });

    await api.post("https://api.test/form", form);

    const init = fetch.mock.calls[0]![1]!;
    expect(init.body).toBe(form);
    expect((init.headers as Headers).has("content-type")).toBe(false);
  });

  it("merges default and per-request headers", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ fetch, headers: { authorization: "Bearer a", "x-a": "1" } });

    await api.get("https://api.test", { headers: { "x-a": "2", "x-b": undefined } });

    const headers = fetch.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer a");
    expect(headers.get("x-a")).toBe("2");
    expect(headers.has("x-b")).toBe(false);
  });

  it("returns text for non-JSON responses", async () => {
    const api = createClient({ fetch: mockFetch(new Response("hello")) });
    await expect(api.get("https://api.test")).resolves.toBe("hello");
  });

  it("honours responseType", async () => {
    const api = createClient({ fetch: mockFetch(new Response("[1,2]")) });
    await expect(api.get("https://api.test", { responseType: "json" })).resolves.toEqual([1, 2]);
  });

  it("exposes status and headers through request()", async () => {
    const api = createClient({ fetch: mockFetch(json({ a: 1 }, 201)) });
    const res = await api.request<{ a: number }>("https://api.test", { method: "POST" });

    expect(res.status).toBe(201);
    expect(res.data.a).toBe(1);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("forwards extra fetch options", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ fetch, credentials: "include" });

    await api.get("https://api.test", { next: { revalidate: 60 } });

    expect(fetch.mock.calls[0]![1]).toMatchObject({
      credentials: "include",
      next: { revalidate: 60 },
    });
  });
});

describe("errors", () => {
  it("throws HTTPError with status and parsed body", async () => {
    const api = createClient({ fetch: mockFetch(json({ message: "nope" }, 404)) });

    const error = await caught(api.get("https://api.test"));

    expect(error).toBeInstanceOf(HTTPError);
    expect(error).toBeInstanceOf(YavqoError);
    expect(error.status).toBe(404);
    expect(error.data).toEqual({ message: "nope" });
    expect(error.response.ok).toBe(false);
  });

  it("falls back to text when an error body is not valid JSON", async () => {
    const bad = new Response("<html>", {
      status: 502,
      headers: { "content-type": "application/json" },
    });
    const api = createClient({ fetch: mockFetch(bad) });

    const error = await caught(api.get("https://api.test"));

    expect(error).toBeInstanceOf(HTTPError);
    expect(error.data).toBe("<html>");
  });

  it("throws a parse error when a successful body is invalid JSON", async () => {
    const bad = new Response("{", { headers: { "content-type": "application/json" } });
    const api = createClient({ fetch: mockFetch(bad) });

    await expect(api.get("https://api.test")).rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  it("wraps fetch failures in NetworkError", async () => {
    const cause = new TypeError("fetch failed");
    const api = createClient({ fetch: mockFetch(cause) });

    const error = await caught(api.get("https://api.test"));

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.cause).toBe(cause);
  });
});

describe("timeout and cancellation", () => {
  it("throws TimeoutError when the timeout elapses", async () => {
    const api = createClient({ fetch: hangingFetch, timeout: 20 });

    const error = await caught(api.get("https://api.test"));

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.timeout).toBe(20);
  });

  it("throws AbortError when the caller aborts", async () => {
    const api = createClient({ fetch: hangingFetch });
    const controller = new AbortController();

    const pending = api.get("https://api.test", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(AbortError);
  });

  it("throws AbortError immediately for an already aborted signal", async () => {
    const fetch = hangingFetch;
    const api = createClient({ fetch });

    await expect(
      api.get("https://api.test", { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(AbortError);
  });
});

describe("retries", () => {
  const fast = { retryDelay: 1 };

  it("retries retryable statuses until success", async () => {
    const fetch = mockFetch(json({}, 503), json({}, 503), json({ ok: true }));
    const api = createClient({ fetch, retries: 2, ...fast });

    await expect(api.get("https://api.test")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("gives up after the configured number of retries", async () => {
    const fetch = mockFetch(json({}, 500));
    const api = createClient({ fetch, retries: 2, ...fast });

    await expect(api.get("https://api.test")).rejects.toBeInstanceOf(HTTPError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry other 4xx responses", async () => {
    const fetch = mockFetch(json({}, 400));
    const api = createClient({ fetch, retries: 3, ...fast });

    await expect(api.get("https://api.test")).rejects.toBeInstanceOf(HTTPError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries network errors and timeouts", async () => {
    const fetch = mockFetch(new TypeError("down"), json({ ok: true }));
    const api = createClient({ fetch, retries: 1, ...fast });

    await expect(api.get("https://api.test")).resolves.toEqual({ ok: true });
  });

  it("does not retry POST by default", async () => {
    const fetch = mockFetch(json({}, 503), json({ ok: true }));
    const api = createClient({ fetch, retries: 2, ...fast });

    await expect(api.post("https://api.test", {})).rejects.toBeInstanceOf(HTTPError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries POST when retryMethods allows it", async () => {
    const fetch = mockFetch(json({}, 503), json({ ok: true }));
    const api = createClient({ fetch, retries: 1, retryMethods: ["post"], ...fast });

    await expect(api.post("https://api.test", {})).resolves.toEqual({ ok: true });
  });

  it("passes the attempt number and error to a retryDelay function", async () => {
    const retryDelay = vi.fn(() => 1);
    const api = createClient({
      fetch: mockFetch(json({}, 502), json({}, 502), json({})),
      retries: 2,
      retryDelay,
    });

    await api.get("https://api.test");

    expect(retryDelay).toHaveBeenNthCalledWith(1, 0, expect.any(HTTPError));
    expect(retryDelay).toHaveBeenNthCalledWith(2, 1, expect.any(HTTPError));
  });

  it("stops waiting between retries when aborted", async () => {
    const fetch = mockFetch(json({}, 503));
    const api = createClient({ fetch, retries: 3, retryDelay: 10_000 });
    const controller = new AbortController();

    const pending = api.get("https://api.test", { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await expect(pending).rejects.toBeInstanceOf(AbortError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("interceptors", () => {
  it("runs request interceptors and applies their changes", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ fetch });
    api.interceptors.request.use((config) => {
      config.headers.set("authorization", "Bearer token");
    });

    await api.get("https://api.test");

    expect((fetch.mock.calls[0]![1]!.headers as Headers).get("authorization")).toBe("Bearer token");
  });

  it("lets a request interceptor replace the config", async () => {
    const fetch = mockFetch(json({}));
    const api = createClient({ fetch });
    api.interceptors.request.use(async (config) => ({ ...config, url: "https://rewritten.test" }));

    await api.get("https://api.test");

    expect(fetch.mock.calls[0]![0]).toBe("https://rewritten.test");
  });

  it("lets a response interceptor transform the response", async () => {
    const api = createClient({ fetch: mockFetch(json({ a: 1 })) });
    api.interceptors.response.use((res) => ({ ...res, data: { wrapped: res.data } }));

    await expect(api.get("https://api.test")).resolves.toEqual({ wrapped: { a: 1 } });
  });

  it("shows error responses to response interceptors before throwing", async () => {
    const seen: number[] = [];
    const api = createClient({ fetch: mockFetch(json({}, 401)) });
    api.interceptors.response.use((res) => {
      seen.push(res.status);
    });

    await expect(api.get("https://api.test")).rejects.toBeInstanceOf(HTTPError);
    expect(seen).toEqual([401]);
  });

  it("removes an interceptor with the returned function", async () => {
    const hook = vi.fn();
    const api = createClient({ fetch: mockFetch(json({})) });
    const eject = api.interceptors.request.use(hook);

    eject();
    await api.get("https://api.test");

    expect(hook).not.toHaveBeenCalled();
  });

  it("runs interceptors once per call, not once per retry", async () => {
    const hook = vi.fn();
    const api = createClient({
      fetch: mockFetch(json({}, 503), json({})),
      retries: 1,
      retryDelay: 1,
    });
    api.interceptors.request.use(hook);
    api.interceptors.response.use(hook);

    await api.get("https://api.test");

    expect(hook).toHaveBeenCalledTimes(2);
  });
});

describe("retry options", () => {
  it("honours Retry-After when it is present", async () => {
    const limited = new Response("{}", { status: 429, headers: { "retry-after": "0" } });
    const retryDelay = vi.fn(() => 10_000);
    const api = createClient({
      fetch: mockFetch(limited, json({ ok: true })),
      retries: 1,
      retryDelay,
    });

    await expect(api.get("https://api.test")).resolves.toEqual({ ok: true });
    expect(retryDelay).toHaveBeenCalledTimes(1);
  });

  it("caps Retry-After at 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      const limited = new Response("{}", { status: 503, headers: { "retry-after": "3600" } });
      const fetch = mockFetch(limited, json({ ok: true }));
      const pending = createClient({ fetch, retries: 1 }).get("https://api.test");

      await vi.advanceTimersByTimeAsync(29_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries only the statuses in retryStatuses", async () => {
    const fetch = mockFetch(json({}, 404), json({ ok: true }));
    const api = createClient({ fetch, retries: 1, retryDelay: 1, retryStatuses: [404] });

    await expect(api.get("https://api.test")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("head() and extend()", () => {
  it("head() returns the response headers", async () => {
    const fetch = mockFetch(new Response(null, { headers: { etag: "abc" } }));
    const headers = await createClient({ fetch }).head("https://api.test");

    expect(headers.get("etag")).toBe("abc");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "HEAD" });
  });

  it("extend() layers options and merges headers without touching the parent", async () => {
    const fetch = mockFetch(json({}));
    const parent = createClient({ fetch, baseURL: "https://api.test", headers: { "x-a": "1" } });
    const child = parent.extend({ baseURL: "https://api.test/v2", headers: { "x-b": "2" } });

    await child.get("/users");
    await parent.get("/users");

    const [childCall, parentCall] = fetch.mock.calls;
    expect(childCall![0]).toBe("https://api.test/v2/users");
    const childHeaders = childCall![1]!.headers as Headers;
    expect([childHeaders.get("x-a"), childHeaders.get("x-b")]).toEqual(["1", "2"]);
    expect(parentCall![0]).toBe("https://api.test/users");
    expect((parentCall![1]!.headers as Headers).has("x-b")).toBe(false);
  });

  it("extend() inherits interceptors but keeps them independent afterwards", async () => {
    const inherited = vi.fn();
    const childOnly = vi.fn();
    const parent = createClient({ fetch: mockFetch(json({})) });
    parent.interceptors.request.use(inherited);
    const child = parent.extend();
    child.interceptors.request.use(childOnly);

    await child.get("https://api.test");
    await parent.get("https://api.test");

    expect(inherited).toHaveBeenCalledTimes(2);
    expect(childOnly).toHaveBeenCalledTimes(1);
  });
});

describe("validateStatus", () => {
  it("treats statuses it accepts as success", async () => {
    const api = createClient({
      fetch: mockFetch(json({ gone: true }, 404)),
      validateStatus: (s) => s < 500,
    });

    await expect(api.get("https://api.test")).resolves.toEqual({ gone: true });
  });

  it("throws HTTPError for 2xx statuses it rejects", async () => {
    const api = createClient({ fetch: mockFetch(json({}, 200)), validateStatus: () => false });

    await expect(api.get("https://api.test")).rejects.toBeInstanceOf(HTTPError);
  });

  it("does not retry statuses it accepts", async () => {
    const fetch = mockFetch(json({}, 503));
    const api = createClient({ fetch, retries: 2, retryDelay: 1, validateStatus: () => true });

    await api.get("https://api.test");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("onRetry", () => {
  it("reports each retry with its attempt number, error and delay", async () => {
    const onRetry = vi.fn();
    const api = createClient({
      fetch: mockFetch(json({}, 503), new TypeError("offline"), json({ ok: true })),
      retries: 2,
      retryDelay: 5,
      onRetry,
    });

    await api.get("https://api.test");

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({
      attempt: 1,
      delay: 5,
      error: expect.any(HTTPError),
    });
    expect(onRetry.mock.calls[1]![0]).toMatchObject({
      attempt: 2,
      error: expect.any(NetworkError),
    });
    expect(onRetry.mock.calls[1]![0].request.url).toBe("https://api.test");
  });

  it("is not called when nothing is retried", async () => {
    const onRetry = vi.fn();
    await createClient({ fetch: mockFetch(json({})), retries: 2, onRetry }).get("https://api.test");

    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe("responseType: stream", () => {
  it("returns the unread body stream", async () => {
    const api = createClient({ fetch: mockFetch(new Response("chunk")) });

    const stream = await api.get<ReadableStream<Uint8Array>>("https://api.test", {
      responseType: "stream",
    });

    await expect(new Response(stream).text()).resolves.toBe("chunk");
  });

  it("still parses error bodies so HTTPError carries them", async () => {
    const api = createClient({ fetch: mockFetch(json({ message: "no" }, 500)) });

    const error = await caught(api.get("https://api.test", { responseType: "stream" }));

    expect(error).toBeInstanceOf(HTTPError);
    expect(error.data).toEqual({ message: "no" });
  });

  it("lets the caller's signal cancel the stream after the response arrived", async () => {
    let streamSignal: AbortSignal | undefined;
    const fetch: FetchFunction = async (_url, init) => {
      streamSignal = init?.signal ?? undefined;
      return new Response("chunk");
    };
    const controller = new AbortController();

    await createClient({ fetch }).get("https://api.test", {
      responseType: "stream",
      signal: controller.signal,
    });
    controller.abort();

    expect(streamSignal?.aborted).toBe(true);
  });
});
