import { describe, expect, it } from "vitest";
import { createClient } from "../src";
import { jsonResponse, mockFetch } from "../src/testing";

describe("mockFetch", () => {
  it("returns responses in order and repeats the last one", async () => {
    const fetch = mockFetch(jsonResponse({ n: 1 }), jsonResponse({ n: 2 }));
    const api = createClient({ fetch });

    expect(await api.get("https://api.test")).toEqual({ n: 1 });
    expect(await api.get("https://api.test")).toEqual({ n: 2 });
    expect(await api.get("https://api.test")).toEqual({ n: 2 });
  });

  it("records calls", async () => {
    const fetch = mockFetch(jsonResponse({}));
    await createClient({ fetch }).post("https://api.test/x", { a: 1 });

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]!.url).toBe("https://api.test/x");
    expect(fetch.calls[0]!.init).toMatchObject({ method: "POST", body: '{"a":1}' });
  });

  it("throws errors and supports response factories", async () => {
    const fetch = mockFetch(new TypeError("offline"), () => jsonResponse({ ok: true }));
    const api = createClient({ fetch });

    await expect(api.get("https://api.test")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(await api.get("https://api.test")).toEqual({ ok: true });
  });

  it("jsonResponse sets the content type and keeps init", async () => {
    const res = jsonResponse({ a: 1 }, { status: 201 });

    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});
