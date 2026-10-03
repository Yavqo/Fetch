# Yavqo Fetch

**Native fetch, but cleaner.**

A tiny, typed HTTP client for JavaScript and TypeScript, built on the platform `fetch`. No runtime dependencies, about 3 KB gzipped, and it runs anywhere `fetch` does: Node.js 18+, browsers, Next.js, Deno, Bun and edge runtimes.

```ts
import { createClient } from "@yavqo/fetch";

const api = createClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  retries: 2,
});

const user = await api.get<User>("/users/123");
```

## Features

- `get`, `post`, `put`, `patch` and `delete`, plus `request` for everything else
- Automatic JSON request and response handling
- Typed responses: `api.get<User>(...)`
- Base URL, default headers, and query parameters
- Timeouts and `AbortController` cancellation
- Retries with configurable count, delay and methods
- Request and response interceptors
- Consistent, typed errors
- HTTP status helpers
- ESM and CJS builds with type declarations, tree-shakeable

## Installation

```bash
npm install @yavqo/fetch
```

```bash
pnpm add @yavqo/fetch
yarn add @yavqo/fetch
bun add @yavqo/fetch
```

## Usage

### Making requests

```ts
const users = await api.get<User[]>("/users", { query: { page: 2, role: ["admin", "dev"] } });
const created = await api.post<User>("/users", { name: "Ada" });
await api.put("/users/1", { name: "Ada Lovelace" });
await api.patch("/users/1", { active: false });
await api.delete("/users/1");
```

Plain objects and arrays are sent as JSON with the right `content-type`. Strings, `FormData`, `URLSearchParams`, `Blob`, streams and other `fetch` body types are passed through untouched.

The verb methods return the parsed body. When you also need the status or headers, use `request`:

```ts
const res = await api.request<User>("/users/123");
res.data; // User
res.status; // 200
res.headers.get("etag");
```

### Query parameters

```ts
await api.get("/search", { query: { q: "fetch", page: 1, tag: ["a", "b"], draft: undefined } });
// GET /search?q=fetch&page=1&tag=a&tag=b
```

`null` and `undefined` values are skipped, arrays repeat the key, and `Date` values are sent as ISO strings. Query parameters are appended to any already in the URL.

### Headers

```ts
const api = createClient({ headers: { authorization: `Bearer ${token}` } });

await api.get("/me", { headers: { "x-request-id": id } });
```

Per-request headers override client defaults. Headers set to `undefined` are ignored.

### Timeouts and cancellation

```ts
await api.get("/slow", { timeout: 3000 }); // throws TimeoutError after 3s

const controller = new AbortController();
const pending = api.get("/users", { signal: controller.signal });
controller.abort(); // throws AbortError
```

The timeout applies to each attempt, including reading the response body.

### Retries

```ts
const api = createClient({
  retries: 3,
  retryDelay: (attempt) => 500 * 2 ** attempt, // or a fixed number of ms
});
```

A request is retried when:

- the network fails or the attempt times out, or
- the response status is `408`, `425`, `429`, `500`, `502`, `503` or `504`.

If the server sends a `Retry-After` header (for example with a `429`), it is used instead of `retryDelay`, capped at 30 seconds. Use `retryStatuses` to change which statuses are retried.

By default only idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`) are retried, so a `POST` is never sent twice by surprise. Opt in per client or per request:

```ts
await api.post("/orders", order, { retries: 2, retryMethods: ["POST"] });
```

The default delay is exponential: 300ms, 600ms, 1200ms, and so on. Aborting the request also cancels any pending retry delay.

### Derived clients

`extend` creates a new client on top of an existing one. Options are layered over the parent's defaults, headers are merged, and current interceptors are copied. The parent is not affected.

```ts
const admin = api.extend({ baseURL: "https://api.example.com/admin", headers: { "x-admin": "1" } });
```

### Interceptors

```ts
const eject = api.interceptors.request.use((config) => {
  config.headers.set("authorization", `Bearer ${getToken()}`);
});

api.interceptors.response.use((response) => {
  if (response.status === 401) signOut();
});

eject(); // remove the request interceptor
```

An interceptor can mutate its argument, return a replacement, or return nothing. It can be async. Interceptors run in registration order, once per call (not once per retry).

Response interceptors run on every final response, including `4xx` and `5xx`, before `HTTPError` is thrown. That makes them a good place for logging or handling `401`s.

### Error handling

Every error extends `YavqoError`:

| Class          | When                                                                 | Useful fields                              |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| `HTTPError`    | The response status is not 2xx                                       | `status`, `statusText`, `data`, `response` |
| `TimeoutError` | The attempt exceeded `timeout`                                       | `timeout`                                  |
| `NetworkError` | No response was received (DNS, offline, CORS, ...)                   | `cause`                                    |
| `AbortError`   | The caller's `AbortSignal` fired                                     |                                            |
| `YavqoError`   | Base class. Also thrown for unparseable JSON (`code: "PARSE_ERROR"`) | `code`                                     |

```ts
import { HTTPError, TimeoutError } from "@yavqo/fetch";

try {
  await api.get<User>("/users/123");
} catch (error) {
  if (error instanceof HTTPError && error.status === 404) {
    // error.data holds the parsed error body
  } else if (error instanceof TimeoutError) {
    // ...
  } else {
    throw error;
  }
}
```

### Status helpers

```ts
import { isClientError, isServerError, isSuccess } from "@yavqo/fetch";

isSuccess(204); // true
isClientError(404); // true
isServerError(503); // true
```

### Next.js

`next` options pass straight through to `fetch`:

```ts
const posts = await api.get<Post[]>("/posts", { next: { revalidate: 60, tags: ["posts"] } });
```

## API reference

### `createClient(options?)`

Returns a client. `options` are defaults for every request and accept everything under [Request options](#request-options) except `body`, `query` and `signal`.

### Client methods

| Method                           | Returns                     |
| -------------------------------- | --------------------------- |
| `get<T>(url, options?)`          | `Promise<T>`                |
| `post<T>(url, body?, options?)`  | `Promise<T>`                |
| `put<T>(url, body?, options?)`   | `Promise<T>`                |
| `patch<T>(url, body?, options?)` | `Promise<T>`                |
| `delete<T>(url, options?)`       | `Promise<T>`                |
| `request<T>(url, options?)`      | `Promise<YavqoResponse<T>>` |
| `interceptors.request.use(fn)`   | `() => void` (eject)        |
| `interceptors.response.use(fn)`  | `() => void` (eject)        |

`request` accepts a `method` option (default `GET`), so it covers `HEAD`, `OPTIONS` and any custom method.

### Request options

All standard `fetch` options (`credentials`, `cache`, `mode`, `keepalive`, ...) plus:

| Option          | Type                                                    | Default                       | Description                              |
| --------------- | ------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| `baseURL`       | `string`                                                |                               | Prepended to relative URLs               |
| `headers`       | `HeadersInit \| Record<string, string \| undefined>`    |                               | Merged over client defaults              |
| `query`         | `Record<string, value \| value[]>`                      |                               | URL query parameters                     |
| `body`          | `unknown`                                               |                               | Objects and arrays become JSON           |
| `signal`        | `AbortSignal`                                           |                               | Cancels the request                      |
| `timeout`       | `number`                                                | `0` (none)                    | Milliseconds per attempt                 |
| `retries`       | `number`                                                | `0`                           | Extra attempts after the first           |
| `retryDelay`    | `number \| (attempt, error) => number`                  | `300 * 2 ** attempt`          | Delay before each retry, in ms           |
| `retryStatuses` | `number[]`                                              | `408 425 429 500 502 503 504` | Statuses that may be retried             |
| `retryMethods`  | `string[]`                                              | `GET HEAD OPTIONS PUT DELETE` | Methods that may be retried              |
| `responseType`  | `"auto" \| "json" \| "text" \| "blob" \| "arrayBuffer"` | `"auto"`                      | How to read the body                     |
| `fetch`         | `typeof fetch`                                          | global `fetch`                | Custom implementation (useful for tests) |

With `responseType: "auto"`, bodies with a JSON `content-type` are parsed, an empty body gives `undefined`, and anything else is returned as text.

### `YavqoResponse<T>`

| Field        | Description                                   |
| ------------ | --------------------------------------------- |
| `data`       | The parsed body                               |
| `status`     | HTTP status code                              |
| `statusText` | HTTP status text                              |
| `ok`         | `true` for 2xx                                |
| `headers`    | `Headers`                                     |
| `url`        | Final URL                                     |
| `raw`        | The underlying `Response` (body already read) |

### Types

`Client`, `ClientOptions`, `RequestOptions`, `RequestConfig`, `RequestInterceptor`, `ResponseInterceptor`, `YavqoResponse`, `ResponseType`, `RetryDelay`, `Query`, `HeadersLike` and `FetchFunction` are all exported.

## Examples

Runnable-style examples live in [`examples/`](examples): basic usage, auth and cancellation, and Next.js.

## Testing your code

Pass a `fetch` implementation to avoid real network calls:

```ts
const api = createClient({
  fetch: async () =>
    new Response(JSON.stringify({ id: 1 }), {
      headers: { "content-type": "application/json" },
    }),
});
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Yavqo Labs
