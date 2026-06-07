/**
 * API layer: all network access lives here.
 *
 * Mado convention:
 *   - do not call `fetch` directly from components;
 *   - all requests go through resource() (read) or mutation() (write).
 * This gives cache, cancellation, and one place for logging/retries.
 */

import { jsonFetcher } from "@madojs/mado";

const BASE = "https://jsonplaceholder.typicode.com";

export interface Post {
  id: number;
  title: string;
  body: string;
}

export const api = {
  posts: {
    list: jsonFetcher<Post[]>(),
    listUrl: (page: number, limit: number) =>
      `${BASE}/posts?_page=${page}&_limit=${limit}`,
    /** Cache key used by mutation invalidates. */
    listKey: () => `${BASE}/posts*`,

    async create(title: string): Promise<Post> {
      const r = await fetch(`${BASE}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body: "demo", userId: 1 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Post;
    },
  },
};
