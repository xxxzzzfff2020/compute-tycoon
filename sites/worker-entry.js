/** Minimal Cloudflare Workers adapter for the existing static Vite H5. */
const worker = {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response("Static asset binding unavailable", { status: 503 });
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;

    const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");
    if (!acceptsHtml) return response;

    const indexUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

export default worker;
