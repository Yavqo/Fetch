# Changelog

## 0.1.0

Initial release.

- `createClient` with `get`, `post`, `put`, `patch`, `delete` and `request`
- Automatic JSON request and response handling
- Query parameters, base URL, default and per-request headers
- Timeouts, retries with configurable count, delay and methods, and `AbortSignal` support
- Request and response interceptors
- `HTTPError`, `TimeoutError`, `NetworkError`, `AbortError` and `YavqoError`
- `extend()` for derived clients, `head()`, `retryStatuses`, and `Retry-After` support (capped at 30s)
- `validateStatus`, `onRetry`, and `responseType: "stream"`
- `@yavqo/fetch/testing` with `mockFetch` and `jsonResponse`
- Path params (`/users/:id`), default client `query`, `totalTimeout` and `retryJitter`
- Error messages include the method and URL (without the query string) and errors expose `request`
- Status helpers: `isSuccess`, `isRedirect`, `isClientError`, `isServerError`, `isInformational`
