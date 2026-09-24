# Yello Investor Room — deploy & run

A data room in the style of Papermark: an email-gated link per investor, a confidentiality click-through, page-by-page time tracking and an instant kill switch. It runs on Google Sheets and Apps Script under **dr.nagasaiteja@yello.health**, costs ₹0 and needs no new vendor.

| Piece | Where |
|---|---|
| Public request page | `yello.health/investors/` |
| Viewer | `yello.health/room/?k=<token>` (the files in `room/`) |
| API + admin | This Apps Script project, bound to the Sheet **Yello Investor Room** |
| Documents | Drive: `Yello Investor Room/docs/<doc-id>/p01.png, p02.png…`. **Never put them in this repo**, because the repo is public. |

## One-time setup (≈10 min, signed in as dr.nagasaiteja@yello.health)
1. Create a new Google Sheet named **Yello Investor Room**.
2. Open **Extensions → Apps Script**. Create two script files, `Code.gs` and `Admin.gs`, and paste in this folder's files.
3. Reload the Sheet. A **Yello Room** menu appears. Run **Yello Room → Set up / upgrade room** (also after every code upgrade — it adds new tabs/columns and never deletes data) and approve the permissions it asks for (Sheets, Drive, mail, triggers). This step:
   - creates the tabs: Links, Requests, NDA, Views, Docs, Visits, Questions, Downloads, Blocklist and Dashboard;
   - creates the Drive folder;
   - sets up a daily digest email at 19:00 IST and an hourly dashboard refresh;
   - sends alerts to **dr.nagasaiteja@yello.health** (partners@yello.health is a group that also delivers to Teja and Kiran). To send them somewhere else, change `ALERT_EMAIL` under **Project Settings → Script properties**.
4. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*. Copy the `/exec` URL.
5. Paste that URL into `assets/room-config.js` as `ROOM_API`, bump the `?v=` query in `room/index.html` and `investors/index.html`, then commit and push. **Pushing publishes the site. Ask Teja before pushing.**

To redeploy later, use **Deploy → Manage deployments → Edit → New version**. This keeps the same `/exec` URL.

## What the room does (v2, 24 Sep 2026 — Papermark parity)
| Feature | How |
|---|---|
| Email gate, per-investor links, passcode, expiry, revoke | Links tab + menu |
| Confidentiality click-through | NDA tab (version `CONF-v2`, discloses device + approximate location tracking) |
| Data room with folders, several docs | Docs tab `folder` + `order`; the room groups docs by folder |
| Live HTML decks | Drop one self-contained `.html` in `docs/<id>/`; slides = `<section>`; served in a sandboxed frame, watermarked, time tracked per slide |
| Image docs (PDF exports etc.) | `p01.png…` in `docs/<id>/` |
| Allow list | Shareable (`*`) links: `allow` column — emails and/or `@domain` |
| Block list | Blocklist tab (or menu) — emails or `@domain`; cuts live sessions on the next call |
| Download on/off per link | Links `download` = Y/N. Image docs → PDF, HTML docs → HTML, both watermarked with the viewer's email; each download is logged and emailed |
| Device, city, visit time | Visits tab; an email on every visit ("First open" / "Return visit #n") with city + device |
| Questions from inside the viewer | "Ask a question" on any page → Questions tab + instant email; reply goes straight to the investor |
| End-of-doc feedback | 👍/👎 + comment on the last page → Questions tab (kind = feedback) |
| Screenshot protection | Page blurs whenever the room isn't the focused window, and on screenshot/print/save shortcuts; printing disabled |
| Dashboard with charts | Dashboard tab, rebuilt hourly: investor table, % of each doc read, page drop-off, questions + 3 kinds of charts |
| Draft review | **Preview link for me** — a founders' link that also shows unpublished drafts; excluded from the dashboard |

## Daily use (all from the Sheet menu)
- **Someone requests access** → you get an email. Select their row in **Requests**, then **Yello Room → Approve selected request**. Choose which docs they see and when access expires. The menu offers to email them the link.
- **Invite someone directly** → **New investor link…**. Use `*` as the email to make a shareable link that records whatever email the viewer enters.
- **Cut off access** → select the row in **Links**, then **Revoke selected link**. Their next page load is refused.
- **Engagement** → the **Dashboard** tab shows minutes per investor and seconds per page. You get an email the first time each link is opened, plus the 19:00 digest.

## Publishing a document (the gate matters)
**Live HTML (preferred for decks):** upload the self-contained `.html` into `Yello Investor Room/docs/<doc-id>/`, then run **Publish doc from folder…**. Each `<section>` is one slide.

**Page images:**
1. Render the pages outside the repo:
   `node tools/render-pages.mjs ../NDIAN-Investor-Presentation-10Cr.html /tmp/deck-v1 section`
   For a PDF, export the slides as PNG from the source app instead.
2. Run **Yello Room → Publish doc from folder…** with an id such as `deck-v1`. The first run creates the Drive folder. Upload the PNGs into it, then run the step again.
3. The menu asks for a title, a room folder (e.g. Pitch, Round terms, Diligence) and a sort order, then two questions:
   - **Is this legal paper?** Answer Yes for a term sheet or anything similar. It then shows the red not-for-signature banner.
   - **Has it passed `ndian-claims-check` and been approved by Teja?** Answer No and it stays a draft that only preview links can see.

## Local testing (no Google needed)
`node tools/mock-room-api.mjs` (port 4181) and `node tools/serve.mjs` (port 4185), or use the `yello-room-mock-api` and `yello-health-site` launch configs. On localhost, `room-config.js` points at the mock automatically.

Test links:
- `?k=demo`: email test@example.com, passcode 1234
- `?k=open`: any email works (no downloads)
- `?k=firm`: any `@fund.test` email only (allow list)
- `?k=preview`: founder@yello.test — sees the draft doc
- `?k=revoked`
- `?k=expired`

`GET /state` dumps the mock's data. `POST /admin/revoke?k=demo` tests the kill switch; `POST /admin/block?e=@fund.test` tests the block list. The mock's HTML doc is the real 16 Cr deck read from disk.

## Limits (by design)
- Pages carry the viewer's email as a watermark and blur when the room loses focus. That stops casual copying and desktop screenshots, but not a phone camera. The confidentiality acknowledgement covers the rest.
- City comes from the viewer's IP (ipwho.is, fallback geojs.io) and is approximate; VPNs show the VPN's city.
- A session lasts 6 hours. After that the viewer re-enters their email, and the confidentiality step is not repeated.
- A link locks for an hour after 10 wrong email or passcode tries.
- Time on page only counts while the tab is visible, and stops after 5 minutes with no input.
