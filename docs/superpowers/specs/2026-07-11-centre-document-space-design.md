# NDIAN Centre Document Space — Design

**Date:** 2026-07-11
**Owner:** Teja (approved the four decisions below)
**Status:** Design approved; pending spec review → implementation plan.

## Problem

A centre owner can start uploading onboarding documents but has **no reliable way to come back to them.** Today's Round-1 portal keys a record by phone number and reloads saved *text* answers when the same phone is re-entered on the same link. That leaves three real gaps:

1. **No durable way back in** — if the owner loses the WhatsApp message with the link, they're stuck.
2. **Phone number is the only key** — anyone who types a centre's phone number could open its uploaded licences and financials (enumeration hole).
3. **Files aren't manageable on return** — only text answers reload; uploaded files can't be re-opened, replaced, or removed, and there's no clear "what's still outstanding" view.

## Goal

One durable, secure document space per centre that carries the owner across the whole onboarding — Round 1 → Round 2 (financials) → signing — reachable by a private link, with full visibility and control over their own uploads.

## Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Access span | One durable space across Round 1 → Round 2 → signing (not a one-shot resume, not a full permanent account) |
| 2 | Re-entry / identity | **Private magic link** — an unguessable 128-bit token in the URL. No password, no phone re-entry. |
| 3 | Round-2 financials gate | The link alone gates everything, including financials. No extra step. |
| 4 | Apply form + portal | **Merged** — applying creates the centre record + token and drops the owner into their document space. |

## Architecture

Three parts, one backend.

```
┌─────────────────────────────┐     POST apply      ┌──────────────────────────────┐
│  Marketing partners page     │ ──────────────────▶ │  Unified Apps Script backend │
│  (yello.health/partners,     │ ◀────────────────── │  (one web app, one Sheet,    │
│   static — design unchanged) │   {ok, portalUrl}   │   one Drive folder tree)     │
│  · apply form                │                      │                              │
│  · success screen shows the  │                      │  doPost(apply)  → create     │
│    private link + "Open my   │                      │     record + token + folder, │
│    documents →"              │                      │     email link, return url   │
└─────────────────────────────┘                      │  doGet(?c=token) → serve the │
                                                      │     document portal for that │
┌─────────────────────────────┐    google.script.run │     centre                   │
│  Document portal             │ ◀──────────────────▶ │  loadByToken / saveProgress  │
│  (served by Apps Script at   │                      │  / uploadFile / deleteFile   │
│   …/exec?c=<token>)          │                      │                              │
└─────────────────────────────┘                      └──────────────────────────────┘
```

- The **marketing partners page stays on the static site** (GitHub Pages) with its existing design. Only its apply form's submit target changes: it POSTs to the unified backend and, on success, shows the returned private link and an "Open my documents →" button.
- The **document portal** (the checklist + upload UI) is served by the Apps Script web app via `doGet` when a `?c=<token>` is present.
- The **backend** is a single Apps Script project with one Google Sheet and one Drive folder tree. It replaces the two Apps Scripts deployed on 11 Jul (the "Yello Centre Intake" leads sheet and the "Round-1 Portal" doc uploader), consolidating them.

## Data model

**One Sheet — "NDIAN Centre Records":** one row per centre.

| Column | Purpose |
|---|---|
| `token` | Unguessable id (`Utilities.getUuid()`), the record key and the URL parameter |
| `ts_created` / `last_updated` | Timestamps |
| `centre_name`, `owner_name`, `phone`, `email` | Identity + contact |
| `location`, `pin` | Centre location + 6-digit PIN |
| `modalities`, `nabl`, `pcpndt`, `volume`, `idle`, `notes` | Apply-form profile |
| `stage` | `round1` → `round2` → `signing` → `closed`. **Controls what the portal reveals.** Apply sets `round1` (upload enabled immediately); Kiran advances the rest in the sheet. |
| `pct_complete`, `status` | Progress |
| `folder_url` | Link to the centre's Drive folder |
| `answers_json` | The document items: text fields + file references `{name,url,fileId}` per item |

**Drive:** root folder → one subfolder per centre (`<centre> — <token-short>`). All uploads land there; each file's `fileId` is stored so it can be re-linked or deleted.

## Key mechanisms

**Token / magic link.** On apply, the backend mints a UUID token, writes the record, and the private URL is `…/exec?c=<token>`. The token is the sole credential (per decision 3). Returning = opening the link; `doGet` loads the record by token and renders the portal pre-filled.

**Unified journey.**
1. Owner fills the apply form (centre, owner, phone, email, location, PIN, modalities, accreditation, volume, notes).
2. Submit → backend creates record + token + Drive folder, **emails the private link** (Apps Script `MailApp`, from admin@studiocahaya.com) if an email was given, and returns `{ok, portalUrl}`.
3. Success screen: "Application received. Here's your private link to upload documents — bookmark it (we've emailed it too)." + "Open my documents →".
4. Portal shows the checklist for the centre's current stage, autosaves, and lets them manage files.
5. Return anytime via the link. When Kiran sets `stage = round2`, the same link reveals Round-2 items (bank statements, ITR) with the NDA note prominent.

**File management on return** (the parts missing today):
- Each uploaded file renders as an **openable link** (via stored `folder_url`/`fileId`).
- **Replace** (upload a new version) and **Remove** (delete the file from Drive + the record) their own uploads, with a confirm on delete.
- Add more files / edit answers anytime; autosave continues.
- A "still outstanding" summary lists items not yet done.

**Round progression.** `stage` in the sheet is the single switch. The portal filters which checklist items show by stage. Applying sets `stage = round1`, so Round-1 items are available immediately; Round-2 items appear once Kiran sets `stage = round2`. Kiran controls advancement — sensitive asks only surface once both sides agree to proceed.

**Email delivery — zero new infra.** Apps Script `MailApp.sendEmail` sends the private link from admin@studiocahaya.com. Also shown on-screen to bookmark, and Kiran can paste it into WhatsApp. (Future: auto-send via a WhatsApp/SMS gateway when one is wired.)

## Migration

Only **test data** exists in the two current sheets today — no real centre has completed the portal. So migration is trivial: stand up the unified sheet fresh, delete the test rows, and retire the two 11-Jul Apps Scripts. If any real record existed, the migration step would assign it a token and copy its data + folder; the spec keeps that path in mind but it is effectively a no-op now.

## Security posture (honest)

- Token = capability. 128-bit UUID is unguessable → closes the enumeration hole (the current risk).
- Residual risk: link **forwarding/leak**. Accepted for B2B onboarding where the owner controls their own link (decision 3).
- Data stays in the **admin@studiocahaya.com** Drive (unchanged). Sharing with Kiran + nagasaiteja@gmail.com is a manual step (Claude cannot change sharing).
- Redeploys must ship as a **new version of the existing deployment** to preserve the `/exec` URL.

## Out of scope (YAGNI)

- No passwords, accounts, or sessions.
- No OTP / SMS / WhatsApp gateway (until a provider is wired).
- No self-serve owner deletion of the whole record (only their individual files).
- No changes to the marketing page's visual design.

## Open items / risks

- **Everyone who applies gets a doc space** (consequence of merging, accepted by Teja). Watch for junk applications creating empty spaces; Kiran's `stage` field and the leads view keep this manageable.
- Apps Script daily email quota (~100–1500/day for the account) — ample for the pilot.
- The unified backend is a rework of two just-deployed scripts; the build plan should sequence it so the live apply form and portal keep working until the unified version is verified, then cut over the `/exec` URLs in one step.
