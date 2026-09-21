#!/bin/sh
# Build the PUBLIC yello.health patient app from the yello-redesign working copy.
# Public = patient app only (no admin / centre / doctor portals), honest seed data
# (sandbox/public-seed.mjs), and bookings sent as requests to the patient-requests
# endpoint (assets/leads-config.js). /partners, /investors, /room and the policy
# pages live alongside and are never touched.
# Usage: ./deploy-app.sh [path-to-yello-redesign]   (source branch: public-launch)
set -e
SRC="${1:-$HOME/Documents/Codex/yello-redesign}"
DEST="$(cd "$(dirname "$0")" && pwd)"

BRANCH="$(git -C "$SRC" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "public-launch" ] || echo "WARNING: $SRC is on '$BRANCH', not public-launch"

# Patient app frontend only. Keep our robots/sitemap.
rsync -a --exclude 'admin.*' --exclude 'centre.*' --exclude 'doctor.*' \
  --exclude 'robots.txt' --exclude 'sitemap.xml' "$SRC/public/" "$DEST/"
rm -f "$DEST/assets/yello.orig.png"

# Server logic, run in the browser by sandbox/boot.mjs (never state.json)
cp "$SRC/server.mjs" "$DEST/server.mjs"
mkdir -p "$DEST/server"
cp "$SRC"/server/*.mjs "$DEST/server/"
rm -f "$DEST/server/persist.mjs.bak"

python3 - "$DEST" <<'PY'
import sys, pathlib
dest = pathlib.Path(sys.argv[1])

# 1. index.html: public flag + lead endpoint + sandbox runtime before app.js
inject = (
    '<script src="/assets/leads-config.js?v=20260921"></script>\n    '
    '<script>globalThis.process={argv:[],env:{},on(){}};'
    'globalThis.Buffer={concat:a=>({toString:()=>a.join("")}),'
    'from:s=>({toString:e=>e==="base64"?btoa(unescape(encodeURIComponent(String(s)))):String(s)})};</script>\n    '
    '<script type="importmap">{"imports":{'
    '"node:http":"/sandbox/node-stubs.mjs","node:fs":"/sandbox/node-stubs.mjs",'
    '"node:fs/promises":"/sandbox/node-stubs.mjs","node:path":"/sandbox/node-stubs.mjs",'
    '"node:url":"/sandbox/node-stubs.mjs"}}</script>\n    '
    '<script type="module" src="/sandbox/boot.mjs"></script>\n    '
)
f = dest / "index.html"
html = f.read_text()
if "sandbox/boot.mjs" not in html:
    pos = html.index('<script type="module" src="/app.js">')
    html = html[:pos] + inject + html[pos:]
html = html.replace('<link rel="stylesheet" href="/styles.css">',
                    '<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">\n    <link rel="stylesheet" href="/styles.css">')
f.write_text(html)
print("index.html: public runtime injected")

# 2. app shell also answers unknown paths (hash router)
(dest / "404.html").write_text(html)

# 3. about.html: portals are not public
a = dest / "about.html"
t = a.read_text().replace('href="/centre"', 'href="/partners/"').replace('href="/#account"', 'href="/#browse"')
a.write_text(t)
print("about.html: links pointed at public pages")
PY

# sandbox/boot.mjs must load after server.mjs is importable — ES modules handle ordering.
echo "Build complete. Test on localhost, then review git status before committing."
