import type { APIRoute } from "astro";

// Follows the same switch as the robots meta tag in Layout.astro: closed to search engines
// until PUBLIC_SEARCH_INDEXING=on at launch.
export const GET: APIRoute = () => {
  const open = import.meta.env.PUBLIC_SEARCH_INDEXING === "on";
  const body = open
    ? "User-agent: *\nDisallow: /account\nDisallow: /checkout\nDisallow: /basket\nDisallow: /order/\nDisallow: /admin\nDisallow: /api/\n"
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
