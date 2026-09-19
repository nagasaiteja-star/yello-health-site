// Browser sandbox boot (public build): runs the real Yello server logic client-side
// for browsing and slot availability. Bookings never go through here — the public
// app sends them to the lead endpoint (assets/leads-config.js) as requests.
import { handleApi } from "/server.mjs";
import { createPublicSeed } from "/sandbox/public-seed.mjs";

const state = createPublicSeed();

const realFetch = window.fetch.bind(window);
window.fetch = async function (input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  const headers = {};
  const rawHeaders = init.headers || {};
  if (rawHeaders instanceof Headers) rawHeaders.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  else for (const k of Object.keys(rawHeaders)) headers[k.toLowerCase()] = rawHeaders[k];
  const body = init.body ?? null;
  const req = { method, headers, async *[Symbol.asyncIterator]() { if (body) yield typeof body === "string" ? body : String(body); } };
  try {
    const result = await handleApi(req, url, state);
    return jsonResponse(result.status ?? 200, result.body);
  } catch (error) {
    return jsonResponse(error.status ?? 500, { error: error.expose ? error.message : "Unexpected server error" });
  }
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body ?? {}), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
