import type { YavqoResponse } from "./types";

/** What was being requested. The URL never includes the query string, which may hold secrets. */
export interface RequestInfo {
  method: string;
  url: string;
}

const describe = (request?: RequestInfo) =>
  request ? `${request.method} ${request.url}` : "Request";

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
  readonly request?: RequestInfo;

  constructor(response: YavqoResponse, request?: RequestInfo) {
    const reason = response.statusText ? ` ${response.statusText}` : "";
    super(`${describe(request)} failed with status ${response.status}${reason}`, "HTTP_ERROR");
    this.name = "HTTPError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = response.data;
    this.response = response;
    this.request = request;
  }
}

/** The request did not complete within the configured timeout. */
export class TimeoutError extends YavqoError {
  readonly timeout: number;
  readonly request?: RequestInfo;

  constructor(timeout: number, options?: { cause?: unknown; request?: RequestInfo }) {
    super(`${describe(options?.request)} timed out after ${timeout}ms`, "TIMEOUT", options);
    this.name = "TimeoutError";
    this.timeout = timeout;
    this.request = options?.request;
  }
}

/** The request never received a response (DNS failure, connection reset, CORS, ...). */
export class NetworkError extends YavqoError {
  readonly request?: RequestInfo;

  constructor(cause?: unknown, request?: RequestInfo) {
    super(`${describe(request)} failed: no response received`, "NETWORK_ERROR", { cause });
    this.name = "NetworkError";
    this.request = request;
  }
}

/** The request was cancelled through the caller's `AbortSignal`. */
export class AbortError extends YavqoError {
  constructor(options?: { cause?: unknown }) {
    super("Request was aborted", "ABORTED", options);
    this.name = "AbortError";
  }
}
