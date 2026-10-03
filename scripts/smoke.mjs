// Runs the built package against a real local server. Used on Node, Bun and Deno in CI.
import assert from "node:assert/strict";
import http from "node:http";
import { HTTPError, TimeoutError, createClient } from "../dist/index.js";
import { jsonResponse, mockFetch } from "../dist/testing.js";

let flaky = 0;
const server = http.createServer((req, res) => {
  const url = req.url ?? "";
  if (url === "/flaky" && ++flaky < 3) {
    res.statusCode = 503;
    return res.end();
  }
  if (url === "/slow") return void setTimeout(() => res.end("late"), 1000);
  if (url === "/missing") {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end('{"error":"nope"}');
  }
  if (url === "/stream") return res.end("streamed");

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ method: req.method, url, body, type: req.headers["content-type"] }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

try {
  const api = createClient({ baseURL, retries: 2, retryDelay: 10 });

  const echoed = await api.post("/echo", { a: 1 }, { query: { x: [1, 2] } });
  assert.deepEqual(echoed, {
    method: "POST",
    url: "/echo?x=1&x=2",
    body: '{"a":1}',
    type: "application/json",
  });

  const retries = [];
  await api.get("/flaky", { onRetry: (info) => retries.push(info.attempt) });
  assert.deepEqual(retries, [1, 2]);

  const error = await api.get("/missing").catch((e) => e);
  assert.ok(error instanceof HTTPError);
  assert.equal(error.status, 404);
  assert.deepEqual(error.data, { error: "nope" });

  assert.equal(
    await api.get("/missing", { validateStatus: (s) => s === 404 }).then((d) => d.error),
    "nope",
  );

  const timeout = await api.get("/slow", { timeout: 50, retries: 0 }).catch((e) => e);
  assert.ok(timeout instanceof TimeoutError);

  const stream = await api.get("/stream", { responseType: "stream" });
  assert.equal(await new Response(stream).text(), "streamed");

  const mock = mockFetch(jsonResponse({ ok: true }));
  assert.deepEqual(await createClient({ fetch: mock }).get("https://example.test"), { ok: true });
  assert.equal(mock.calls.length, 1);

  console.log("smoke ok");
} finally {
  server.close();
}
