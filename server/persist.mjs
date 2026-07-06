import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const defaultFile = process.env.YELLO_STATE_FILE || join(__dirname, "state.json");

let saveTimer = null;
let boundState = null;
let boundFile = defaultFile;

export function loadState(createSeed, file = defaultFile) {
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      // Merge over a fresh seed so new top-level collections added in code
      // still exist when restoring an older snapshot.
      const seed = createSeed();
      for (const key of Object.keys(raw)) seed[key] = raw[key];
      console.log(`State restored from ${file}`);
      return seed;
    } catch (error) {
      console.error(`Could not read ${file} (${error.message}) — starting from seed data`);
    }
  }
  return createSeed();
}

export function bindPersistence(state, file = defaultFile) {
  boundState = state;
  boundFile = file;
  const flushAndExit = () => {
    flush();
    process.exit(0);
  };
  process.on("SIGINT", flushAndExit);
  process.on("SIGTERM", flushAndExit);
}

export function schedulePersist() {
  if (!boundState || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 400);
}

export function flush() {
  if (!boundState) return;
  try {
    const tmp = `${boundFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(boundState));
    renameSync(tmp, boundFile);
  } catch (error) {
    console.error(`State save failed: ${error.message}`);
  }
}
