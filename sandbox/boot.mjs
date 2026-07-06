// Browser sandbox boot: runs the real Yello server logic client-side.
// Injected before each portal's module script by deploy-app.sh, together
// with an import map that redirects node: builtins to ./node-stubs.mjs.
// Every visitor gets a private copy of the seed data; their writes persist
// in localStorage on their own device only.
import { handleApi } from "/server.mjs";
import { createSeedData } from "/server/data.mjs";

const STORAGE_KEY = "yello-sandbox-state-v1";
const state = createSeedData();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved) {
    for (const key of Object.keys(saved)) {
      // Maps (OTP stores) can't round-trip through JSON — keep fresh ones.
      if (!(state[key] instanceof Map)) state[key] = saved[key];
    }
  }
} catch { /* corrupted snapshot — start from seed */ }

let timer = null;
function persistSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const snapshot = {};
      for (const key of Object.keys(state)) {
        if (!(state[key] instanceof Map)) snapshot[key] = state[key];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch { /* quota exceeded (large document uploads) — keep state in memory */ }
  }, 300);
}

const realFetch = window.fetch.bind(window);
window.fetch = async function (input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) {
    return realFetch(input, init);
  }
  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  const headers = {};
  const rawHeaders = init.headers || (typeof input === "object" && input.headers) || {};
  if (rawHeaders instanceof Headers) rawHeaders.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  else for (const k of Object.keys(rawHeaders)) headers[k.toLowerCase()] = rawHeaders[k];
  const body = init.body ?? null;
  const req = {
    method,
    headers,
    async *[Symbol.asyncIterator]() { if (body) yield typeof body === "string" ? body : String(body); }
  };
  try {
    const result = await handleApi(req, url, state);
    if (method !== "GET") persistSoon();
    return jsonResponse(result.status ?? 200, result.body);
  } catch (error) {
    return jsonResponse(error.status ?? 500, { error: error.expose ? error.message : "Unexpected server error" });
  }
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
