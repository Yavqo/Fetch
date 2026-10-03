import { createClient } from "@yavqo/fetch";

interface Post {
  id: number;
  title: string;
}

const api = createClient({ baseURL: "https://api.example.com", timeout: 5000 });

// Works in server components, route handlers and server actions.
export async function getPosts() {
  return api.get<Post[]>("/posts", { next: { revalidate: 60, tags: ["posts"] } });
}

// A derived client with its own base URL and headers.
const admin = api.extend({ baseURL: "https://api.example.com/admin", headers: { "x-admin": "1" } });

export async function getAdminPosts() {
  return admin.get<Post[]>("/posts");
}
