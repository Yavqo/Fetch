import { AbortError, YavqoError } from "./errors";
import type { HeadersLike, Query, QueryValue, ResponseType } from "./types";

const ABSOLUTE_URL = /^[a-z][a-z\d+\-.]*:\/\//i;

export function buildURL(url: string, baseURL?: string, query?: Query): string {
  let result =
    baseURL && !ABSOLUTE_URL.test(url)
      ? `${baseURL.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`
      : url;

  const search = serializeQuery(query);
  if (search) result += `${result.includes("?") ? "&" : "?"}${search}`;
  return result;
}

function serializeQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item != null) params.append(key, formatQueryValue(item));
    }
  }
  return params.toString();
}

function formatQueryValue(value: Exclude<QueryValue, null | undefined>): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function mergeHeaders(...sources: (HeadersLike | undefined)[]): Headers {
  const result = new Headers();
  for (const source of sources) {
    if (!source) continue;
    if (source instanceof Headers || Array.isArray(source)) {
      new Headers(source).forEach((value, key) => result.set(key, value));
    } else {
      for (const [key, value] of Object.entries(source)) {
        if (value != null) result.set(key, value);
      }
    }
  }
  return result;
}

/** True for values that should be serialized with `JSON.stringify`. */
export function isJSONBody(body: unknown): boolean {
  if (typeof body === "number" || typeof body === "boolean") return true;
  if (Array.isArray(body)) return true;
  if (typeof body !== "object" || body === null) return false;
  const proto = Object.getPrototypeOf(body);
  return proto === Object.prototype || proto === null;
}

export async function parseBody(response: Response, type: ResponseType): Promise<unknown> {
  if (type === "blob") return response.blob();
  if (type === "arrayBuffer") return response.arrayBuffer();

  const text = await response.text();
  if (!text) return undefined;
  if (type === "text") return text;

  const contentType = response.headers.get("content-type") ?? "";
  if (type === "json" || /\bjson\b/i.test(contentType)) {
    try {
      return JSON.parse(text);
    } catch (cause) {
      // An error page that claims to be JSON should still surface as an HTTPError.
      if (response.ok)
        throw new YavqoError("Failed to parse JSON response", "PARSE_ERROR", { cause });
    }
  }
  return text;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());

    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
