#!/bin/sh
# Rebuild the yello.health static site from the yello-redesign working copy.
# Copies the app's public/ + server logic here, injects the browser-sandbox
# bootstrap into each portal page, then leaves the result ready to commit.
# Usage: ./deploy-app.sh [path-to-yello-redesign]
set -e
SRC="${1:-$HOME/Documents/Codex/yello-redesign}"
DEST="$(cd "$(dirname "$0")" && pwd)"

# App frontend (never delete: /partners, CNAME, sandbox/ live alongside)
rsync -a "$SRC/public/" "$DEST/"

# Server logic, imported by sandbox/boot.mjs in the browser
# (all modules — data.mjs grows new imports as the app evolves; never state.json)
cp "$SRC/server.mjs" "$DEST/server.mjs"
mkdir -p "$DEST/server"
cp "$SRC"/server/*.mjs "$DEST/server/"

# Inject globals shim + import map + sandbox boot before each portal's module script
python3 - "$DEST" <<'PY'
import sys, pathlib
dest = pathlib.Path(sys.argv[1])
inject = (
    '<script>globalThis.process={argv:[],env:{},on(){}};'
    'globalThis.Buffer={concat:a=>({toString:()=>a.join("")}),'
    'from:s=>({toString:e=>e==="base64"?btoa(unescape(encodeURIComponent(String(s)))):String(s)})};</script>\n    '
    '<script type="importmap">{"imports":{'
    '"node:http":"/sandbox/node-stubs.mjs",'
    '"node:fs":"/sandbox/node-stubs.mjs",'
    '"node:fs/promises":"/sandbox/node-stubs.mjs",'
    '"node:path":"/sandbox/node-stubs.mjs",'
    '"node:url":"/sandbox/node-stubs.mjs"}}</script>\n    '
    '<script type="module" src="/sandbox/boot.mjs"></script>\n    '
)
for name in ["index.html", "centre.html", "admin.html", "doctor.html"]:
    f = dest / name
    html = f.read_text()
    marker = '<script type="module" src="/'
    if "sandbox/boot.mjs" in html:
        continue
    pos = html.index(marker)
    f.write_text(html[:pos] + inject + html[pos:])
    print(f"injected: {name}")
PY

# Hash router handles unknown paths; serve the app shell on 404s too
cp "$DEST/index.html" "$DEST/404.html"

# Keep /partners in the sitemap the app build ships
python3 - "$DEST" <<'PY'
import sys, pathlib
f = pathlib.Path(sys.argv[1]) / "sitemap.xml"
xml = f.read_text()
if "/partners" not in xml:
    entry = "  <url><loc>https://yello.health/partners/</loc></url>\n"
    xml = xml.replace("</urlset>", entry + "</urlset>")
    f.write_text(xml)
    print("sitemap: added /partners")
PY

echo "Build complete. Review with git status, then commit + push to deploy."
