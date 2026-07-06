/* Yello for Centres — supply-side onboarding.
   Apply → lead → OTP login → tier-gated diligence wizard → submit. */

const state = {
  view: "landing",
  centre: null,
  step: 0,
  auth: { mobile: "", otpRequested: false },
  console: null,
  consoleTab: "overview"
};

const app = document.querySelector("#app");

const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: "POST", body: b }),
  patch: (p, b) => request(p, { method: "PATCH", body: b })
};
async function request(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(v) { return `₹${Number(v || 0).toLocaleString("en-IN")}`; }
function esc(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function toast(message) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

const TIER_CODE = { Marketplace: "M", Branded: "B", "Fully Managed": "F" };
function tierCode() { return TIER_CODE[state.centre?.tier] || null; }

function valueCard(title, text) {
  return `<div class="panel"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p></div>`;
}

function readFileAsData(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.readAsDataURL(file);
  });
}

function isImage(type, name) {
  return /^image\//.test(type || "") || /\.(png|jpe?g|webp|gif|svg)$/i.test(name || "");
}

// Only inline image/PDF data URLs are safe to place in href/src.
function safeUrl(url) {
  return /^data:(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf);/i.test(String(url || "")) ? esc(url) : "";
}

function filePreview(file) {
  const src = safeUrl(file.dataUrl);
  const openable = src ? `href="${src}" target="_blank" rel="noreferrer"` : "";
  if (isImage(file.type, file.name) && src) {
    return `<a class="file-prev" ${openable}><img src="${src}" alt="${esc(file.name)}"><span>${esc(file.name)}</span></a>`;
  }
  return `<a class="file-prev doc" ${openable}><span class="fp-ico">${/\.pdf$/i.test(file.name) ? "📕" : "📄"}</span><span>${esc(file.name)}</span></a>`;
}

function docThumb(doc) {
  const src = safeUrl(doc.dataUrl);
  const open = src ? `href="${src}" target="_blank" rel="noreferrer"` : "";
  if (isImage(doc.type, doc.file) && src) {
    return `<a class="doc-file" ${open}><img class="doc-thumb" src="${src}" alt=""> ${esc(doc.file)}</a>`;
  }
  return `<a class="doc-file" ${open}>${/\.pdf$/i.test(doc.file) ? "📕" : "📄"} ${esc(doc.file)}</a>`;
}

/* ---------- onboarding schema ---------- */

const TIERS = [
  { v: "Marketplace", d: "List & get demand. You keep your books. Lightest onboarding — no P&L." },
  { v: "Branded", d: "Our brand, your operations. Headline financials, brand licence + fee." },
  { v: "Fully Managed", d: "We run it, you own it. Full financial diligence — the guarantee is the deal." }
];

const SECTIONS = [
  {
    key: "tier", n: 1, title: "Partnership", desc: "How you want to work with Yello. This sets how much we ask for.",
    tiers: ["M", "B", "F"], special: "tier"
  },
  {
    key: "contact", n: 2, title: "Account & contacts", desc: "Who we speak to. Your mobile is your login.", tiers: ["M", "B", "F"],
    fields: [
      { k: "financeName", label: "Finance contact — name", type: "text" },
      { k: "financePhone", label: "Finance contact — phone", type: "phone" },
      { k: "labInchargeName", label: "Lab in-charge — name", type: "text" },
      { k: "email", label: "Centre email", type: "email" },
      { k: "language", label: "Preferred language", type: "select", options: ["English", "Telugu", "Hindi"] },
      { k: "dpdp", label: "I consent to Yello processing centre & patient data under the DPDP Act", type: "checkbox", req: true }
    ]
  },
  {
    key: "identity", n: 3, title: "Business & legal", desc: "Who you legally are.", tiers: ["M", "B", "F"],
    fields: [
      { k: "legalName", label: "Legal entity name", type: "text", req: true },
      { k: "brandName", label: "Brand / trade name", type: "text" },
      { k: "entityType", label: "Entity type", type: "select", options: ["Proprietorship", "Partnership", "LLP", "Pvt Ltd", "Trust"], req: true },
      { k: "yearEstablished", label: "Year established", type: "number" },
      { k: "gstin", label: "GSTIN", type: "text", tiers: ["B", "F"] },
      { k: "pan", label: "PAN", type: "text", tiers: ["B", "F"] },
      { k: "city", label: "City", type: "text" },
      { k: "locality", label: "Locality / area", type: "text" },
      { k: "address", label: "Registered office address", type: "textarea", req: true },
      { k: "owners", label: "Ownership (name · % holding)", type: "repeat", cols: ["Owner name", "% holding"], tiers: ["B", "F"] }
    ]
  },
  {
    key: "compliance", n: 4, title: "Licences & accreditation", desc: "Regulatory reality — verified before any patient is routed.", tiers: ["M", "B", "F"],
    fields: [
      { k: "nabl", label: "NABL accreditation", type: "select", options: ["Accredited", "In progress", "No"], req: true },
      { k: "nablCert", label: "NABL certificate", type: "file" },
      { k: "pcpndt", label: "PCPNDT (mandatory for USG / imaging)", type: "select", options: ["Registered", "N/A", "No"], flag: true },
      { k: "pcpndtCert", label: "PCPNDT certificate", type: "file" },
      { k: "aerb", label: "AERB licence (mandatory for CT / X-ray)", type: "select", options: ["Licensed", "N/A", "No"], flag: true },
      { k: "bmw", label: "Biomedical waste authorisation", type: "select", options: ["Valid", "Expired", "No"], req: true },
      { k: "clinicalEstab", label: "Clinical Establishment Act reg.", type: "text" },
      { k: "indemnity", label: "Professional indemnity insurance", type: "text", tiers: ["F"] },
      { k: "signatories", label: "Signatory clinicians (name · role · NMC reg no.)", type: "repeat", cols: ["Name", "Role", "NMC reg no."], req: true }
    ]
  },
  {
    key: "facility", n: 5, title: "Facility & capacity", desc: "What you can do — and how much sits idle.", tiers: ["M", "B", "F"],
    fields: [
      { k: "premises", label: "Premises", type: "select", options: ["Owned", "Leased"] },
      { k: "area", label: "Carpet area (sq ft)", type: "number" },
      { k: "rent", label: "Monthly rent", type: "currency", tiers: ["B", "F"] },
      { k: "equipment", label: "Equipment (modality · make/model · year · owned/financed)", type: "repeat", cols: ["Modality", "Make / model", "Year", "Owned / financed"], req: true },
      { k: "lisRis", label: "LIS / RIS / PACS in use", type: "text" },
      { k: "openHour", label: "Opens (hour, 0–23)", type: "number" },
      { k: "closeHour", label: "Closes (hour, 0–23)", type: "number" },
      { k: "capacityPerDay", label: "Installed capacity (scans/tests per day)", type: "number", req: true },
      { k: "currentPerDay", label: "Current volume per day", type: "number", req: true }
    ]
  },
  {
    key: "people", n: 6, title: "People & staffing", desc: "Who runs it — matters most when we operate it.", tiers: ["B", "F"],
    fields: [
      { k: "radiologists", label: "Radiologists", type: "number" },
      { k: "pathologists", label: "Pathologists", type: "number" },
      { k: "technicians", label: "Technicians", type: "number" },
      { k: "phlebotomists", label: "Phlebotomists", type: "number" },
      { k: "frontDesk", label: "Front desk", type: "number" },
      { k: "onRollPct", label: "% staff on-roll (vs contract)", type: "percent", tiers: ["F"] },
      { k: "attrition", label: "Attrition, last 12 months (%)", type: "percent", tiers: ["F"] }
    ]
  },
  {
    key: "catalogue", n: 7, title: "Services & pricing", desc: "The listing — how demand finds you.", tiers: ["M", "B", "F"],
    fields: [
      { k: "modalities", label: "Modalities offered", type: "multiselect", options: ["MRI", "CT", "Ultrasound", "X-ray", "Pathology", "ECG", "Home collection"], req: true },
      { k: "tests", label: "Key tests / packages (name · MRP · TAT)", type: "repeat", cols: ["Test / package", "MRP ₹", "TAT"], req: true },
      { k: "homeCollection", label: "Home collection radius (km)", type: "number" },
      { k: "yelloDiscount", label: "Yello-hours discount offered (%)", type: "percent", help: "Your deepest off-peak discount — powers the demand engine.", req: true },
      { k: "hourlyCapacity", label: "Bookings you can take per hour", type: "number" }
    ]
  },
  {
    key: "demand", n: 8, title: "Demand & payer mix", desc: "Where your business comes from today.", tiers: ["B", "F"],
    fields: [
      { k: "footfall", label: "Monthly footfall", type: "number" },
      { k: "mixWalkin", label: "Revenue % — walk-in / self-pay", type: "percent" },
      { k: "mixReferred", label: "Revenue % — doctor-referred", type: "percent" },
      { k: "mixCorporate", label: "Revenue % — corporate", type: "percent" },
      { k: "mixTpa", label: "Revenue % — TPA / insurance", type: "percent" },
      { k: "corporates", label: "Corporate contracts (client · ₹/mo · renewal)", type: "repeat", cols: ["Client", "₹/mo", "Renewal"], tiers: ["F"] },
      { k: "referrerNote", label: "Referral arrangements (context only — no per-referral pay)", type: "textarea", flag: true, tiers: ["F"] }
    ]
  },
  {
    key: "financials", n: 9, title: "Financial diligence", desc: "For Fully Managed this is the deal. Marketplace skips it.", tiers: ["B", "F"], special: "financials",
    fields: [
      { k: "revenueMonths", label: "Monthly revenue — trailing 12 months", type: "months", req: true },
      { k: "expenses", label: "Monthly expense lines", type: "expenses" },
      { k: "ownerTakeHome", label: "Owner take-home — family 12-mo avg (salary + drawings + rent-to-self + perks)", type: "currency", tiers: ["F"], flag: true },
      { k: "currentRunRate", label: "Current monthly run-rate (₹/mo)", type: "currency" },
      { k: "targetRunRate", label: "Target with Yello demand (₹/mo)", type: "currency" },
      { k: "docs", label: "Documents — P&L, 12-mo bank statements, ITRs, GST returns", type: "file", multi: true, tiers: ["F"] }
    ]
  },
  {
    key: "banking", n: 10, title: "Assets & banking", desc: "Balance-sheet snapshot + where settlements are paid.", tiers: ["M", "B", "F"],
    fields: [
      { k: "equipmentValue", label: "Equipment book value", type: "currency", tiers: ["F"] },
      { k: "loans", label: "Loans & charges (lender · outstanding)", type: "repeat", cols: ["Lender", "Outstanding ₹"], tiers: ["F"] },
      { k: "accountName", label: "Settlement account name", type: "text", req: true },
      { k: "bank", label: "Bank", type: "text", req: true },
      { k: "ifsc", label: "IFSC", type: "text", req: true },
      { k: "accountNo", label: "Account number", type: "text", req: true },
      { k: "cheque", label: "Cancelled cheque / bank proof", type: "file", req: true }
    ]
  },
  {
    key: "agreement", n: 11, title: "Agreement", desc: "The terms your tier implies, and your signature.", tiers: ["M", "B", "F"],
    fields: [
      { k: "term", label: "Term", type: "select", options: ["Non-exclusive, short rolling (recommended)", "12 months", "24 months"] },
      { k: "poa", label: "I grant Yello limited O&M authority (operate, invoice, collect — excludes borrowing / asset sale)", type: "checkbox", tiers: ["F"] },
      { k: "signatory", label: "Authorised signatory name", type: "text", req: true },
      { k: "designation", label: "Designation", type: "text" },
      { k: "esign", label: "I agree to the Yello partner agreement and e-sign", type: "checkbox", req: true }
    ]
  },
  { key: "review", n: 12, title: "Review & submit", desc: "Check the deal, then send it to us for verification.", tiers: ["M", "B", "F"], special: "review" }
];

function visibleSections() {
  const code = tierCode();
  return SECTIONS.filter((s) => !code || s.tiers.includes(code));
}

/* ---------- routing ---------- */

function render() {
  if (state.view === "console" && state.centre) return renderConsole();
  if (state.view === "wizard" && state.centre) return renderWizard();
  return renderLanding();
}

function isLive(centre) {
  return Boolean(centre && centre.live && centre.live.labId);
}

async function enterPortal(centre) {
  state.centre = centre;
  if (isLive(centre)) {
    state.console = await api.get(`/api/centre/centres/${centre.id}/console`);
    state.view = "console";
  } else {
    state.view = "wizard";
    state.step = 0;
  }
  render();
}

/* ---------- landing: login + apply ---------- */

function renderLanding() {
  const auth = state.auth;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/centre"><img src="/assets/yello.png" alt="Yello"><span>for Centres</span></a>
        <nav class="nav">
          <a class="link" href="/" style="margin-right:10px">Patient site →</a>
          <button class="secondary" id="loginTop">Log in to onboard</button>
        </nav>
      </header>
      <main class="main">
        <section class="promo-banner" style="margin-top:16px">
          <p class="eyebrow light">Yello Partner Network · Hyderabad pilot</p>
          <h1>Revenue exists.<br>Profit doesn't.</h1>
          <p class="lead light">You got into diagnostics to catch illness early and give families answers — not to fight price wars, chase procurement, and firefight rotas. Yello takes the business off your hands, so your centre thrives and your patients are cared for. You keep ownership.</p>
          <div class="inline" style="margin-top:24px">
            <button class="primary" id="toApply">Apply to the pilot →</button>
            <button class="ghost light" id="toModels">See the partnership models</button>
          </div>
          <div class="hero-trust">
            <span>You keep 100% ownership</span>
            <span>₹0 to join the pilot</span>
            <span>Live in ~2 weeks</span>
          </div>
        </section>

        <section class="section">
          <div class="deal-tiles">
            <div class="deal-tile hero"><span class="dt-l">Exit multiple</span><strong>12–20×</strong><span class="dt-s">vs ~4–6× on your own</span></div>
            <div class="deal-tile"><span class="dt-l">Procurement savings</span><strong>20–40%</strong><span class="dt-s">central buying power</span></div>
            <div class="deal-tile"><span class="dt-l">Central lab</span><strong>10,000+</strong><span class="dt-s">samples / day</span></div>
            <div class="deal-tile"><span class="dt-l">Go-live</span><strong>~2 wks</strong><span class="dt-s">brand, tech, demand</span></div>
          </div>
        </section>

        <section class="section">
          <div class="section-head"><div><p class="eyebrow">The problem</p><h2>Capable centres, worn down by the business</h2></div></div>
          <div class="cards">
            <div class="panel"><span class="prob-tag">Bleeding EBITDA</span><p class="muted">Equipment at 30–40% utilisation, fixed costs that don't move with revenue, and price wars with aggregators and hospital labs.</p></div>
            <div class="panel"><span class="prob-tag">Can't scale</span><p class="muted">Zero brand recall, no standardised SOPs, no tech backbone. Every new branch is built from scratch.</p></div>
            <div class="panel"><span class="prob-tag">Ops chaos</span><p class="muted">Ad-hoc procurement with no leverage, high staff attrition, reactive compliance, and patient experience an afterthought.</p></div>
          </div>
        </section>

        <section class="section band" id="models">
          <div class="section-head"><div><p class="eyebrow">The fix</p><h2>What changes when Yello runs it</h2></div></div>
          <div class="cards">
            ${valueCard("A national brand", "From local and forgettable to a name patients recognise and trust — signage, digital presence, the lot.")}
            ${valueCard("Full software stack", "Booking, LIS, RIS/PACS, CRM & billing — plus the Yello patient app with Smart Reports & Health Score.")}
            ${valueCard("Pricing & packages", "Standardised pricing and ready-made test & scan packages that convert — set by people who run centres.")}
            ${valueCard("Marketing & demand", "Digital campaigns, doctor engagement and corporate tie-ups that fill your slots — demand you can't generate alone.")}
            ${valueCard("20–40% procurement savings", "Centralised buying power on reagents and consumables you could never negotiate alone.")}
            ${valueCard("You own it, we run it", "From firefighting daily to a monthly review. You keep ownership and capex; Yello delivers the performance.")}
          </div>
        </section>

        <section class="section">
          <div class="section-head"><div><p class="eyebrow">Three ways to partner</p><h2>Pick the depth that fits — you always keep ownership</h2></div></div>
          <div class="tier-grid">
            <div class="tier-card"><span class="tier-badge">Fully Managed</span><strong>We run it, you own it</strong><p class="muted">Hand us the whole operation and step back to ownership. Built for turnarounds.</p><p class="tier-econ">You keep 5% of revenue (or a managed fee) + a share of the upside — and 100% ownership.</p></div>
            <div class="tier-card"><span class="tier-badge">Branded · Phase 2</span><strong>Our brand, your operations</strong><p class="muted">You run the floor and your team; we bring the brand, systems and patients.</p><p class="tier-econ">A brand licence + platform fee, or 5% of revenue + upside. You keep the bulk of revenue.</p></div>
            <div class="tier-card"><span class="tier-badge">Marketplace</span><strong>List &amp; get demand</strong><p class="muted">Stay completely independent and receive the patients we send your way.</p><p class="tier-econ">10–15% on Yello-sourced bookings only — nothing on your own demand.</p></div>
          </div>
        </section>

        <section class="section two-col band">
          <div>
            <p class="eyebrow">Idle capacity</p>
            <h2>Your quiet hours, full of patients</h2>
            <p class="lead">A scanner sitting idle from 2–4 PM is fixed cost with nothing to show for it. Yello Hours turns that quiet time into affordable scans — without touching your busy windows. You lose nothing on a slot you'd have run empty; the patient pays 30–50% less and gets seen sooner.</p>
          </div>
          <div class="panel hours-card">
            <p class="muted small">Your centre · today</p>
            <h3>MRI scan</h3>
            <div class="price"><span class="strike">₹7,500</span><strong>₹3,999</strong><span class="pill off-pill">Yello Hours</span></div>
            <p class="muted">Overflow reporting routes to pooled radiologists (~30-min TAT), so no one waits when you're at capacity.</p>
          </div>
        </section>

        <section class="section">
          <div class="section-head"><div><p class="eyebrow">Your exit, when you want it</p><h2>A standalone lab has no buyer. A network does.</h2></div></div>
          <div class="deal-tiles">
            <div class="deal-tile"><span class="dt-l">Standalone</span><strong>~4–6×</strong><span class="dt-s">EBITDA, hard to sell</span></div>
            <div class="deal-tile hero"><span class="dt-l">On the Yello standard</span><strong>12–20×</strong><span class="dt-s">same centre, in-network</span></div>
            <div class="deal-tile"><span class="dt-l">The exit</span><strong>Planned</strong><span class="dt-s">pre-agreed, not a fire sale</span></div>
          </div>
        </section>

        <section class="section" id="apply">
          <div class="section-head"><div><p class="eyebrow">Apply to the Hyderabad pilot</p><h2>Only ~12 centres in cohort 1</h2></div></div>
        </section>

        <section class="section" style="padding-top:0">
          <div class="panel apply-panel">
            <p class="muted">No cost to apply · a 20–30 min on-site visit, no obligation · we reply within 48 hours.</p>
            <div class="field"><label>Centre name</label><input id="a_centre" placeholder="e.g. Banjara Imaging & Labs"></div>
            <div class="form-grid">
              <div class="field"><label>Owner / contact</label><input id="a_owner" placeholder="Dr. / Mr. / Ms."></div>
              <div class="field"><label>Phone (WhatsApp)</label><input id="a_phone" placeholder="+91"></div>
            </div>
            <div class="form-grid">
              <div class="field"><label>City</label><input id="a_city" value="Hyderabad"></div>
              <div class="field"><label>Locality</label><input id="a_locality" placeholder="e.g. Kukatpally"></div>
            </div>
            <div class="field"><label>Modalities</label>
              <div class="chips" id="a_modalities">${["MRI", "CT", "Ultrasound", "X-ray", "Pathology", "Collection"].map((m) => `<label class="chip choice"><input type="checkbox" value="${m}"> ${m}</label>`).join("")}</div>
            </div>
            <div class="form-grid">
              <div class="field"><label>Monthly volume</label><select id="a_volume"><option value="">Select…</option><option>Under 200</option><option>200–500</option><option>500–1,500</option><option>1,500+</option></select></div>
              <div class="field"><label>Idle capacity</label><select id="a_idle"><option value="">Select…</option><option>Under 20%</option><option>20–40%</option><option>40–60%</option><option>Over 60%</option></select></div>
            </div>
            <button class="secondary full" id="applyBtn">Apply to the pilot →</button>
          </div>
        </section>
      </main>
    </div>
  `;
  bindLanding();
}

function bindLanding() {
  document.querySelector("#toApply")?.addEventListener("click", () => document.querySelector("#apply")?.scrollIntoView({ behavior: "smooth" }));
  document.querySelector("#toModels")?.addEventListener("click", () => document.querySelector("#models")?.scrollIntoView({ behavior: "smooth" }));
  document.querySelector("#loginTop")?.addEventListener("click", openLoginModal);
  document.querySelector("#applyBtn")?.addEventListener("click", async () => {
    const v = (id) => document.querySelector(id)?.value.trim() || "";
    const modalities = [...document.querySelectorAll("#a_modalities input:checked")].map((i) => i.value);
    if (!v("#a_centre") || !v("#a_owner") || !v("#a_phone")) return toast("Centre name, owner and phone are required.");
    try {
      await api.post("/api/centre/apply", {
        centre: v("#a_centre"), owner: v("#a_owner"), phone: v("#a_phone"),
        city: v("#a_city"), locality: v("#a_locality"), modalities,
        volume: v("#a_volume"), idle: v("#a_idle")
      });
      toast("Application received. Our team will review and invite you to onboard.");
      ["#a_centre", "#a_owner", "#a_phone", "#a_locality"].forEach((id) => { const el = document.querySelector(id); if (el) el.value = ""; });
    } catch (e) { toast(e.message); }
  });
  document.querySelectorAll(".chip.choice input").forEach((cb) => cb.addEventListener("change", (e) => e.target.closest(".chip").classList.toggle("selected", e.target.checked)));
}

/* ---------- wizard ---------- */

function renderWizard() {
  const sections = visibleSections();
  state.step = Math.min(state.step, sections.length - 1);
  const section = sections[state.step];
  const c = state.centre;
  const submitted = c.status === "Under review" || c.status === "Verified · Live" || c.status === "Verified";
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/centre"><img src="/assets/yello.png" alt="Yello"><span>for Centres</span></a>
        <nav class="nav">
          <span class="pill ${statusClass(c.status)}">${esc(c.status)}</span>
          <button id="logout">Log out</button>
        </nav>
      </header>
      <main class="main">
        <div class="section-head">
          <div><p class="eyebrow">Onboarding${c.tier ? ` · ${esc(c.tier)}` : ""}</p><h2>${esc(c.name || "Your centre")}</h2></div>
          <span class="muted small tnum">Step ${state.step + 1} of ${sections.length}</span>
        </div>
        <div class="wiz">
          <aside class="wiz-rail panel">
            ${sections.map((s, i) => `
              <button class="wiz-step ${i === state.step ? "active" : ""} ${sectionDone(s) ? "done" : ""}" data-goto="${i}">
                <span class="wiz-num">${sectionDone(s) ? "✓" : s.n}</span>
                <span>${esc(s.title)}</span>
              </button>
            `).join("")}
          </aside>
          <div class="wiz-main">
            ${submitted ? renderSubmitted() : `
              <div class="panel">
                <div class="section-head" style="margin-bottom:8px"><div><h3>${esc(section.title)}</h3><p class="muted">${esc(section.desc)}</p></div></div>
                <div class="wiz-body">${renderSection(section)}</div>
              </div>
              <div class="wiz-foot">
                <button class="ghost" id="backBtn" ${state.step === 0 ? "disabled" : ""}>← Back</button>
                ${state.step === sections.length - 1
                  ? `<button class="primary big" id="submitBtn">Submit for verification</button>`
                  : `<button class="primary" id="saveBtn">Save &amp; continue →</button>`}
              </div>
            `}
          </div>
        </div>
      </main>
    </div>
  `;
  bindWizard(sections, section);
}

function statusClass(status) {
  if (/Live|Verified/.test(status)) return "off-pill";
  if (/hold|Rejected/.test(status)) return "warn-pill";
  return "brand-pill";
}

function sectionDone(s) {
  if (s.special === "tier") return Boolean(state.centre.tier);
  if (s.special === "review") return false;
  return Boolean(state.centre.sections[s.key] && Object.keys(state.centre.sections[s.key]).length);
}

function renderSection(section) {
  if (section.special === "tier") return renderTier();
  if (section.special === "review") return renderReview();
  const data = state.centre.sections[section.key] || {};
  const code = tierCode();
  const fields = section.fields.filter((f) => !f.tiers || !code || f.tiers.includes(code));
  return `<div class="form-grid">${fields.map((f) => renderField(f, data)).join("")}</div>`;
}

function renderTier() {
  return `<div class="tier-grid">${TIERS.map((t) => `
    <button class="tier-card ${state.centre.tier === t.v ? "sel" : ""}" data-tier="${t.v}">
      <span class="tier-badge">${t.v}</span>
      <p class="muted">${t.d}</p>
    </button>
  `).join("")}</div>`;
}

function renderField(f, data) {
  const v = data[f.k];
  const full = ["textarea", "repeat", "months", "expenses", "multiselect", "file"].includes(f.type) ? "full" : "";
  const req = f.req ? ` <span class="req-star">*</span>` : "";
  const flag = f.flag ? ` <span class="flagdot" title="Compliance / diligence critical">●</span>` : "";
  const help = f.help ? `<span class="fhelp">${esc(f.help)}</span>` : "";
  let control = "";
  if (f.type === "select") {
    control = `<select data-k="${f.k}"><option value="">Select…</option>${f.options.map((o) => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") {
    control = `<textarea data-k="${f.k}">${esc(v || "")}</textarea>`;
  } else if (f.type === "checkbox") {
    control = `<label class="chk"><input type="checkbox" data-k="${f.k}" ${v ? "checked" : ""}> <span>${esc(f.label)}</span></label>`;
    return `<div class="field ${full}">${help}${control}</div>`;
  } else if (f.type === "multiselect") {
    control = `<div class="chips" data-multi="${f.k}">${f.options.map((o) => `<label class="chip choice ${(v || []).includes(o) ? "selected" : ""}"><input type="checkbox" value="${o}" ${(v || []).includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div>`;
  } else if (f.type === "file") {
    const files = Array.isArray(v) ? v : (v ? [{ name: v, type: "", dataUrl: "" }] : []);
    const previews = files.map(filePreview).join("");
    control = `<div class="file-field">${previews ? `<div class="file-previews">${previews}</div>` : ""}<div class="file-drop"><input type="file" data-file="${f.k}" ${f.multi ? "multiple" : ""} accept=".pdf,.png,.jpg,.jpeg,.webp"></div></div>`;
  } else if (f.type === "repeat") {
    control = renderRepeat(f, v);
  } else if (f.type === "months") {
    control = renderMonths(v);
  } else if (f.type === "expenses") {
    control = renderExpenses(v);
  } else {
    const type = f.type === "number" || f.type === "currency" || f.type === "percent" ? "number" : (f.type === "email" ? "email" : "text");
    const prefix = f.type === "currency" ? `<span class="in-prefix">₹</span>` : "";
    const suffix = f.type === "percent" ? `<span class="in-suffix">%</span>` : "";
    control = `<div class="in-wrap">${prefix}<input type="${type}" data-k="${f.k}" data-kind="${f.type}" value="${esc(v ?? "")}">${suffix}</div>`;
  }
  return `<div class="field ${full}"><label>${esc(f.label)}${req}${flag}</label>${help}${control}</div>`;
}

const EXPENSE_LINES = [
  ["rent", "Rent"], ["salaries", "Salaries & wages"], ["reagents", "Reagents & consumables"],
  ["reads", "Radiologist / teleradiology reads"], ["amc", "Equipment AMC & maintenance"],
  ["power", "Power & utilities"], ["marketing", "Marketing"], ["admin", "Admin & overheads"],
  ["finance", "Finance cost / EMIs"], ["other", "Other"]
];
function renderExpenses(v = {}) {
  return `<div class="exp-grid">${EXPENSE_LINES.map(([k, label]) => `
    <div class="exp-row"><span>${label}</span><div class="in-wrap"><span class="in-prefix">₹</span><input type="number" data-exp="${k}" value="${esc(v[k] ?? "")}"></div></div>
  `).join("")}</div>`;
}

function renderMonths(v = []) {
  const labels = ["M-12", "M-11", "M-10", "M-9", "M-8", "M-7", "M-6", "M-5", "M-4", "M-3", "M-2", "M-1"];
  return `<div class="months-grid">${labels.map((lab, i) => `
    <div class="month-cell"><span>${lab}</span><input type="number" data-month="${i}" value="${esc(v[i] ?? "")}"></div>
  `).join("")}</div>`;
}

function renderRepeat(f, rows) {
  const list = Array.isArray(rows) && rows.length ? rows : [{}];
  return `<div class="repeat" data-repeat="${f.k}" data-cols='${esc(JSON.stringify(f.cols))}'>
    ${list.map((row, ri) => `<div class="repeat-row">${f.cols.map((col, ci) => `<input placeholder="${esc(col)}" data-row="${ri}" data-col="${ci}" value="${esc(row[ci] ?? "")}">`).join("")}<button class="rep-del" data-del="${ri}" title="Remove">✕</button></div>`).join("")}
    <button class="link add-row" type="button">+ Add row</button>
  </div>`;
}

function renderReview() {
  const c = state.centre; const d = c.deal;
  const dealBlock = tierCode() !== "M" ? `
    <div class="deal-panel">
      <h3>The deal, computed from your numbers</h3>
      <div class="deal-tiles">
        ${dealTile("Monthly revenue", money(d.monthlyRevenue))}
        ${dealTile("Monthly EBITDA", money(d.ebitda), `${d.ebitdaMargin}% margin`)}
        ${dealTile("Owner guarantee", money(d.guarantee), "max(take-home, 5% rev)")}
        ${dealTile("₹50L→₹75L uplift", money(d.uplift), `${money(d.baselineRunRate)} → ${money(d.targetRunRate)}`, true)}
      </div>
    </div>` : `<div class="callout-c">Marketplace listing — no financial diligence required. We list you and route Yello-sourced demand for a commission.</div>`;
  const rows = visibleSections().filter((s) => !s.special).map((s) => {
    const filled = state.centre.sections[s.key] ? Object.keys(state.centre.sections[s.key]).length : 0;
    return `<div class="rev-row"><span>${esc(s.title)}</span><span class="${filled ? "ok" : "todo"}">${filled ? "✓ captured" : "— not filled"}</span></div>`;
  }).join("");
  const docs = state.centre.documents || [];
  const docBlock = `
    <div class="doc-list">
      <h3>Documents you've uploaded</h3>
      ${docs.length ? docs.map((doc) => `<div class="doc-row">${docThumb(doc)}<span class="muted small">${esc(doc.label)}</span></div>`).join("") : `<p class="muted">No documents uploaded yet — attach them in the relevant steps.</p>`}
    </div>`;
  return `${dealBlock}<div class="rev-list">${rows}</div>${docBlock}
    <p class="muted small">Submitting sends everything to the Yello team. You can be called for missing documents. Nothing is listed until we verify and approve.</p>`;
}
function dealTile(label, value, sub, hero) {
  return `<div class="deal-tile ${hero ? "hero" : ""}"><span class="dt-l">${label}</span><strong class="tnum">${value}</strong>${sub ? `<span class="dt-s">${esc(sub)}</span>` : ""}</div>`;
}

function renderSubmitted() {
  const c = state.centre; const d = c.deal;
  return `<div class="panel center-col">
    <div class="big-check">✓</div>
    <h2>Onboarding submitted</h2>
    <p class="muted">Thanks — <strong>${esc(c.name)}</strong> is now <strong>${esc(c.status)}</strong>. Our team verifies your documents${tierCode() !== "M" ? " and financials" : ""} and confirms go-live.</p>
    ${tierCode() !== "M" ? `<div class="deal-tiles" style="margin-top:8px">
      ${dealTile("Monthly EBITDA", money(d.ebitda), `${d.ebitdaMargin}% margin`)}
      ${dealTile("Owner guarantee", money(d.guarantee))}
      ${dealTile("Target uplift", money(d.uplift), "on Yello demand", true)}
    </div>` : ""}
    <button class="ghost" id="logout2" style="margin-top:18px">Log out</button>
  </div>`;
}

/* ---------- centre console (post go-live) ---------- */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(iso) {
  const [y, m] = String(iso).split("-");
  return `${MONTH_NAMES[Number(m) - 1] || m} ${y}`;
}

function renderConsole() {
  const c = state.centre;
  const d = state.console;
  if (!d) return renderLanding();
  const tabs = [["overview", "Overview"], ["bookings", `Bookings (${d.bookings.length})`], ["settlement", "Settlement"]];
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/centre"><img src="/assets/yello.png" alt="Yello"><span>for Centres</span></a>
        <nav class="nav">
          <span class="pill off-pill">Live since ${esc(d.goLiveDate)}</span>
          <a class="link" href="/" target="_blank" rel="noreferrer">View your listing →</a>
          <button id="logout">Log out</button>
        </nav>
      </header>
      <main class="main">
        <div class="section-head">
          <div><p class="eyebrow">Centre console · ${esc(c.tier)}</p><h2>${esc(c.name)}</h2></div>
        </div>
        <div class="tabs">${tabs.map(([k, label]) => `<button class="tab ${state.consoleTab === k ? "active" : ""}" data-tab="${k}">${label}</button>`).join("")}</div>
        ${state.consoleTab === "bookings" ? consoleBookings(d) : state.consoleTab === "settlement" ? consoleSettlement(d) : consoleOverview(d)}
      </main>
    </div>
  `;
  bindConsole();
}

function consoleOverview(d) {
  const cur = d.months[d.months.length - 1];
  return `
    <section class="panel">
      <div class="deal-tiles">
        ${dealTile("This month gross", money(cur.gross), `${esc(monthLabel(cur.month))} · in progress`)}
        ${dealTile("Yello-sourced", money(cur.yello), `${cur.mix}% direct-demand mix`, true)}
        ${dealTile("Progress to target", `${d.progressPct}%`, `${money(d.deal.baselineRunRate)} → ${money(d.deal.targetRunRate)}`)}
        ${dealTile("Utilisation", d.utilizationPct === null ? "—" : `${d.utilizationPct}%`, "of installed capacity")}
      </div>
      <div style="margin-top:18px">
        <div class="mis-bar"><span style="width:${d.progressPct}%"></span></div>
        <div class="mis-scale"><span>Baseline ${money(d.deal.baselineRunRate)}</span><span>The proof: +50% on Yello demand</span><span>Target ${money(d.deal.targetRunRate)}</span></div>
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h3>Monthly MIS — own book vs Yello-sourced</h3>
      <p class="muted">Every rupee Yello routes is tagged. Your own book is the baseline; the direct-demand mix is the number we grow.</p>
      <div class="tblwrap"><table>
        <thead><tr><th>Month</th><th>Own book</th><th>Yello-sourced</th><th>Gross</th><th>Direct-demand mix</th></tr></thead>
        <tbody>${d.months.map((m) => `
          <tr>
            <td>${esc(monthLabel(m.month))}${m.current ? ` <span class="pill brand-pill">now</span>` : ""}</td>
            <td class="tnum">${money(m.ownBook)}</td>
            <td class="tnum" style="color:var(--teal-deep);font-weight:600">${money(m.yello)}</td>
            <td class="tnum"><strong>${money(m.gross)}</strong></td>
            <td class="tnum">${m.mix}%</td>
          </tr>`).join("")}</tbody>
      </table></div>
    </section>
  `;
}

function consoleBookings(d) {
  if (!d.bookings.length) return `<div class="empty"><strong>No bookings yet</strong><span class="muted">Yello demand routes here the moment patients book.</span></div>`;
  return `
    <section class="panel">
      <h3>Yello-sourced bookings</h3>
      <p class="muted">Work the queue: mark the sample/scan done, then attach the report — the patient is notified at every step.</p>
      <div class="tblwrap"><table>
        <thead><tr><th>Test</th><th>Patient</th><th>Appointment</th><th>Paid</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${d.bookings.map((b) => `
          <tr>
            <td><strong>${esc(b.testName)}</strong><br><span class="muted small">${esc(b.visitType)}</span></td>
            <td>${esc(b.patient.name)}<br><span class="muted small">${esc(b.consumerName)}</span></td>
            <td class="tnum">${esc(b.appointmentDate)}<br><span class="muted small">${esc(b.slotLabel)}</span></td>
            <td class="tnum"><strong>${money(b.finalPrice)}</strong><br><span class="muted small">${b.discountPercent}% off</span></td>
            <td><span class="pill ${b.status === "completed" ? "off-pill" : b.paymentStatus !== "paid" ? "warn-pill" : ""}">${esc(b.status.replaceAll("_", " "))}</span></td>
            <td>${bookingAction(b)}</td>
          </tr>`).join("")}</tbody>
      </table></div>
    </section>
  `;
}

function bookingAction(b) {
  if (b.paymentStatus !== "paid") return `<span class="muted small">awaiting payment</span>`;
  if (b.status === "completed") return `<span class="muted small">📄 ${esc(b.reportName || "report sent")}</span>`;
  if (b.status === "sample_collected") {
    return `<span class="inline" style="flex-wrap:nowrap"><input type="file" class="chat-file" data-rfile="${b.id}"><button class="secondary" data-report="${b.id}">Send report</button></span>`;
  }
  return `<button class="secondary" data-collect="${b.id}">Mark collected</button>`;
}

function consoleSettlement(d) {
  return `
    <section class="panel">
      <h3>Monthly settlement — the per-centre P&amp;L</h3>
      <p class="muted">${state.centre.tier === "Marketplace"
        ? "Marketplace: Yello takes ~12% on Yello-sourced bookings only. You keep everything else — including 100% of your own demand."
        : state.centre.tier === "Branded"
          ? "Branded: a brand licence + platform fee (~10% of gross). You keep the operating profit net of the fee."
          : `Fully Managed: owner payout = max(guarantee ${money(d.deal.guarantee)}, 5% of gross). Yello contribution is what remains after centre operating costs and your payout.`}</p>
      <div class="tblwrap"><table>
        <thead><tr><th>Month</th><th>Gross revenue</th><th>Centre O&amp;M</th><th>EBITDA</th><th>Owner payout</th><th>Yello contribution</th></tr></thead>
        <tbody>${d.months.map((m) => `
          <tr>
            <td>${esc(monthLabel(m.month))}${m.current ? ` <span class="pill brand-pill">now</span>` : ""}</td>
            <td class="tnum"><strong>${money(m.gross)}</strong></td>
            <td class="tnum">(${money(m.om)})</td>
            <td class="tnum">${money(m.ebitda)}</td>
            <td class="tnum" style="color:var(--brand-deep);font-weight:600">${money(m.ownerPayout)}</td>
            <td class="tnum" style="color:var(--teal-deep);font-weight:600">${money(m.yelloNet)}</td>
          </tr>`).join("")}</tbody>
      </table></div>
      <p class="muted small" style="margin-top:10px">Prototype figures — production settlement runs off the signed O&amp;M waterfall and the collections account.</p>
    </section>
  `;
}

function bindConsole() {
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    state.consoleTab = b.dataset.tab;
    renderConsole();
  }));
  document.querySelectorAll("[data-collect]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api.patch(`/api/centre/bookings/${b.dataset.collect}/fulfil`, { centreId: state.centre.id, action: "collected" });
      state.console = await api.get(`/api/centre/centres/${state.centre.id}/console`);
      toast("Marked collected — patient notified.");
      renderConsole();
    } catch (e) { toast(e.message); }
  }));
  document.querySelectorAll("[data-report]").forEach((b) => b.addEventListener("click", async () => {
    const fileInput = document.querySelector(`[data-rfile="${b.dataset.report}"]`);
    const reportName = fileInput?.files[0]?.name;
    if (!reportName) return toast("Attach the report file first.");
    try {
      await api.patch(`/api/centre/bookings/${b.dataset.report}/fulfil`, { centreId: state.centre.id, action: "report", reportName });
      state.console = await api.get(`/api/centre/centres/${state.centre.id}/console`);
      toast("Report sent to the patient.");
      renderConsole();
    } catch (e) { toast(e.message); }
  }));
}

/* ---------- wizard binding ---------- */

function bindWizard(sections, section) {
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelector("#logout2")?.addEventListener("click", logout);
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", async () => {
    await saveCurrent(section);
    state.step = Number(b.dataset.goto);
    renderWizard();
  }));
  document.querySelector("#backBtn")?.addEventListener("click", () => { state.step = Math.max(0, state.step - 1); renderWizard(); });
  document.querySelector("#saveBtn")?.addEventListener("click", async () => {
    if (!(await saveCurrent(section, true))) return;
    state.step += 1;
    renderWizard();
  });
  document.querySelector("#submitBtn")?.addEventListener("click", async () => {
    await saveCurrent(section);
    try {
      state.centre = await api.post(`/api/centre/centres/${state.centre.id}/submit`, {});
      renderWizard();
    } catch (e) { toast(e.message); }
  });
  // tier cards
  document.querySelectorAll("[data-tier]").forEach((b) => b.addEventListener("click", async () => {
    try {
      state.centre = await api.patch(`/api/centre/centres/${state.centre.id}`, { tier: b.dataset.tier });
      renderWizard();
    } catch (e) { toast(e.message); }
  }));
  // multiselect chips
  document.querySelectorAll("[data-multi] input").forEach((cb) => cb.addEventListener("change", (e) => e.target.closest(".chip").classList.toggle("selected", e.target.checked)));
  // file uploads — read the actual file, keep other in-progress edits, save + preview
  document.querySelectorAll("[data-file]").forEach((inp) => inp.addEventListener("change", async () => {
    if (!inp.files.length) return;
    const key = inp.dataset.file;
    const added = await Promise.all([...inp.files].map(readFileAsData));
    const existing = (state.centre.sections[section.key] && state.centre.sections[section.key][key]) || [];
    const data = collectSection(section) || {};
    data[key] = [...existing, ...added];
    try {
      state.centre = await api.patch(`/api/centre/centres/${state.centre.id}`, { sections: { [section.key]: data } });
      renderWizard();
    } catch (e) { toast(e.message); }
  }));
  // repeat add/remove — capture the WHOLE section first so other in-progress
  // edits (and other repeats) aren't discarded on re-render.
  const commitSection = (mutate) => {
    const data = collectSection(section) || {};
    mutate(data);
    state.centre.sections[section.key] = { ...(state.centre.sections[section.key] || {}), ...data };
    renderWizard();
  };
  document.querySelectorAll(".repeat").forEach((rep) => {
    const key = rep.dataset.repeat;
    rep.querySelector(".add-row")?.addEventListener("click", () => {
      commitSection((data) => { data[key] = [...(data[key] || []), {}]; });
    });
    rep.querySelectorAll(".rep-del").forEach((btn) => btn.addEventListener("click", () => {
      commitSection((data) => {
        const rows = [...(data[key] || [])];
        rows.splice(Number(btn.dataset.del), 1);
        data[key] = rows.length ? rows : [{}];
      });
    }));
  });
}

function logout() { state.centre = null; state.console = null; state.view = "landing"; state.auth = { mobile: "", otpRequested: false }; render(); }

/* ---------- login modal (top of landing) ---------- */

function openLoginModal() {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  document.body.append(backdrop);
  const paint = () => {
    const auth = state.auth;
    backdrop.innerHTML = `
      <div class="modal panel">
        <div class="section-head" style="margin-bottom:6px">
          <div><h3>Continue onboarding</h3><p class="muted">Log in with the mobile on your invite.</p></div>
          <button class="rep-del" id="loginClose" title="Close">✕</button>
        </div>
        ${!auth.otpRequested ? `
          <div class="field"><label>Mobile number</label><input id="mob" value="${esc(auth.mobile || "9000000001")}" placeholder="10-digit mobile"></div>
          <button class="primary full" id="sendOtp">Send OTP</button>
          <p class="muted small">Prototype · OTP 123456 · 9000000002 = onboarding wizard · 9000000001 = live console</p>
        ` : `
          <p class="muted">OTP sent to <strong>${esc(auth.mobile)}</strong>. <button class="link" id="editMob">Change</button></p>
          <div class="field"><label>One-time password</label><input id="otp" value="123456"></div>
          <button class="primary full" id="verifyOtp">Verify &amp; continue</button>
        `}
      </div>`;
    backdrop.querySelector("#loginClose").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#sendOtp")?.addEventListener("click", async () => {
      const mobile = backdrop.querySelector("#mob").value.trim();
      if (!mobile) return toast("Enter your mobile number.");
      try {
        await api.post("/api/centre/auth/request-otp", { mobile });
        state.auth.mobile = mobile;
        state.auth.otpRequested = true;
        paint();
      } catch (e) { toast(e.message); }
    });
    backdrop.querySelector("#editMob")?.addEventListener("click", () => { state.auth.otpRequested = false; paint(); });
    backdrop.querySelector("#verifyOtp")?.addEventListener("click", async () => {
      try {
        const otp = backdrop.querySelector("#otp").value.trim();
        const centre = await api.post("/api/centre/auth/verify-otp", { mobile: state.auth.mobile, otp });
        backdrop.remove();
        await enterPortal(centre);
      } catch (e) { toast(e.message); }
    });
  };
  paint();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
}

function collectRepeat(rep) {
  const cols = JSON.parse(rep.dataset.cols);
  const rowsMap = {};
  rep.querySelectorAll("input[data-row]").forEach((inp) => {
    const r = inp.dataset.row;
    rowsMap[r] = rowsMap[r] || {};
    rowsMap[r][inp.dataset.col] = inp.value.trim();
  });
  return Object.keys(rowsMap).sort((a, b) => a - b).map((r) => rowsMap[r]).filter((row) => cols.some((_, i) => row[i]));
}

function collectSection(section) {
  if (section.special === "tier" || section.special === "review") return null;
  const data = {};
  document.querySelectorAll("[data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (el.type === "checkbox") { data[k] = el.checked; return; }
    if (el.type === "file") { data[k] = el.files && el.files.length ? [...el.files].map((f) => f.name).join(", ") : (state.centre.sections[section.key]?.[k] || ""); return; }
    const kind = el.dataset.kind;
    let val = el.value.trim();
    if ((kind === "number" || kind === "currency" || kind === "percent") && val !== "") val = Number(val);
    data[k] = val;
  });
  document.querySelectorAll("[data-multi]").forEach((wrap) => {
    data[wrap.dataset.multi] = [...wrap.querySelectorAll("input:checked")].map((i) => i.value);
  });
  const months = document.querySelectorAll("[data-month]");
  if (months.length) data.revenueMonths = [...months].map((m) => m.value === "" ? 0 : Number(m.value));
  const exps = document.querySelectorAll("[data-exp]");
  if (exps.length) { const e = {}; exps.forEach((x) => e[x.dataset.exp] = x.value === "" ? 0 : Number(x.value)); data.expenses = e; }
  document.querySelectorAll(".repeat").forEach((rep) => { data[rep.dataset.repeat] = collectRepeat(rep); });
  // File fields render with data-file and are saved on upload — carry their
  // stored values through so required-file validation and saves don't drop them.
  (section.fields || []).filter((f) => f.type === "file").forEach((f) => {
    const cur = state.centre.sections[section.key] && state.centre.sections[section.key][f.k];
    if (cur !== undefined) data[f.k] = cur;
  });
  return data;
}

async function saveCurrent(section, validate = false) {
  const data = collectSection(section);
  if (data === null) return true;
  if (validate) {
    const code = tierCode();
    const missing = section.fields.filter((f) => f.req && (!f.tiers || !code || f.tiers.includes(code))).filter((f) => {
      const val = data[f.k];
      if (Array.isArray(val)) return val.length === 0;
      return val === undefined || val === "" || val === false;
    });
    if (missing.length) { toast(`Please complete: ${missing.map((m) => m.label).join(", ")}`); return false; }
  }
  try {
    state.centre = await api.patch(`/api/centre/centres/${state.centre.id}`, { sections: { [section.key]: data } });
    return true;
  } catch (e) { toast(e.message); return false; }
}

render();
