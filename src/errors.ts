import type { YavqoResponse } from "./types";

/** Base class for every error thrown by Yavqo Fetch. */
export class YavqoError extends Error {
  readonly code: string;

  constructor(message: string, code = "YAVQO_ERROR", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YavqoError";
    this.code = code;
  }
}

/** The server responded with a non-2xx status. */
export class HTTPError extends YavqoError {
  readonly status: number;
  readonly statusText: string;
  /** The parsed response body, if any. */
  readonly data: unknown;
  readonly response: YavqoResponse;

  constructor(response: YavqoResponse) {
    const reason = response.statusText ? ` ${response.statusText}` : "";
    super(`Request failed with status ${response.status}${reason}`, "HTTP_ERROR");
    this.name = "HTTPError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = response.data;
    this.response = response;
  }
}

/** The request did not complete within the configured timeout. */
export class TimeoutError extends YavqoError {
  readonly timeout: number;

  constructor(timeout: number, options?: { cause?: unknown }) {
    super(`Request timed out after ${timeout}ms`, "TIMEOUT", options);
    this.name = "TimeoutError";
    this.timeout = timeout;
  }
}

/** The request never received a response (DNS failure, connection reset, CORS, ...). */
export class NetworkError extends YavqoError {
  constructor(cause?: unknown) {
    super("Network request failed", "NETWORK_ERROR", { cause });
    this.name = "NetworkError";
  }
}

/** The request was cancelled through the caller's `AbortSignal`. */
export class AbortError extends YavqoError {
  constructor(options?: { cause?: unknown }) {
    super("Request was aborted", "ABORTED", options);
    this.name = "AbortError";
  }
}
