import type { FetchFunction } from "./types";

/** A canned response, an error to throw, or a function that builds a response per call. */
export type MockResponse = Response | Error | (() => Response | Promise<Response>);

export interface MockFetch extends FetchFunction {
  /** Every request made through the mock, in order. */
  calls: { url: string; init: RequestInit | undefined }[];
}

/**
 * Builds a `fetch` replacement for tests. Responses are returned in order and the last one repeats.
 *
 * ```ts
 * const fetch = mockFetch(jsonResponse({ id: 1 }), new TypeError("offline"));
 * const api = createClient({ fetch });
 * ```
 */
export function mockFetch(...responses: MockResponse[]): MockFetch {
  const queue = [...responses];
  const calls: MockFetch["calls"] = [];

  const fetch: FetchFunction = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error("mockFetch was called without any responses");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next.clone();
  };

  return Object.assign(fetch, { calls });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}
