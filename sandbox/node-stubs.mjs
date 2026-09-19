// Minimal stand-ins for the node: builtins that server.mjs imports.
// Only the handleApi code paths run in the browser; the HTTP-server and
// filesystem paths (listen, serveStatic, persist-to-disk) never execute.
export function createServer() { throw new Error("not available in browser"); }
export default { createServer };
export async function readFile() { throw new Error("not available in browser"); }
export function readFileSync() { throw new Error("not available in browser"); }
export function writeFileSync() {}
export function renameSync() {}
export function existsSync() { return false; }
export function extname(p) { const i = String(p).lastIndexOf("."); return i < 0 ? "" : String(p).slice(i); }
export function join(...parts) { return parts.join("/"); }
export function normalize(p) { return String(p); }
export function fileURLToPath(u) { return String(u); }
