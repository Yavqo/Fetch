import { describe, expect, it } from "vitest";
import { isClientError, isInformational, isRedirect, isServerError, isSuccess } from "../src";

describe("status helpers", () => {
  it("classifies status codes by range", () => {
    expect(isInformational(101)).toBe(true);
    expect(isSuccess(200)).toBe(true);
    expect(isSuccess(299)).toBe(true);
    expect(isRedirect(302)).toBe(true);
    expect(isClientError(404)).toBe(true);
    expect(isServerError(503)).toBe(true);
  });

  it("rejects codes outside their range", () => {
    expect(isSuccess(199)).toBe(false);
    expect(isSuccess(300)).toBe(false);
    expect(isClientError(500)).toBe(false);
    expect(isServerError(499)).toBe(false);
    expect(isServerError(600)).toBe(false);
  });
});
