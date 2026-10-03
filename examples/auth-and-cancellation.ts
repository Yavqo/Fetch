import { AbortError, createClient } from "@yavqo/fetch";

let token = "initial-token";

const api = createClient({ baseURL: "https://api.example.com" });

api.interceptors.request.use((config) => {
  config.headers.set("authorization", `Bearer ${token}`);
});

api.interceptors.response.use((response) => {
  if (response.status === 401) token = "";
});

const controller = new AbortController();
const search = api.get("/search", { query: { q: "fetch" }, signal: controller.signal });

// For example, when the user types another character:
controller.abort();

try {
  await search;
} catch (error) {
  if (!(error instanceof AbortError)) throw error;
}
