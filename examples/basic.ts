import { HTTPError, createClient } from "@yavqo/fetch";

interface User {
  id: number;
  name: string;
}

const api = createClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  retries: 2,
});

const user = await api.get<User>("/users/123");
const users = await api.get<User[]>("/users", { query: { page: 1, role: ["admin", "dev"] } });
const created = await api.post<User>("/users", { name: "Ada" });

try {
  await api.delete(`/users/${created.id}`);
} catch (error) {
  if (error instanceof HTTPError && error.status === 404) {
    console.log("Already deleted");
  } else {
    throw error;
  }
}

console.log(user.name, users.length);
