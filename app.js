const state = {
  route: "home",
  labs: [],
  labsMeta: { page: 1, pageSize: 10, total: 0 },
  packages: [],
  locations: [],
  testimonials: [],
  currentLab: null,
  consumer: null,
  bookings: [],
  consultations: [],
  doctors: [],
  admin: null,
  adminQuestions: [],
  doctorDashboard: null,
  notifications: [],
  filters: { search: "", sort: "price_asc", location: "All locations", visitType: "", minRating: 0, page: 1 },
  labSelection: { testId: "", date: "", hour: null, visitType: "" },
  booking: null,
  lastBooking: null,
  selected: { doctorId: "", consultationType: "Chat" },
  auth: { mobile: "", otpRequested: false, needsProfile: false, next: "home" },
  toast: ""
};

const POPULAR_TESTS = [
  "Allergy Testing", "Amylase Test", "Anemia Test", "Anti Hcv Test", "Arthritis Test", "CA125 Test", "CBC Test",
  "Chikungunya Test", "Cholesterol Test", "Dengue Test", "Diabetes Test", "Fever Test", "Full Body Checkup",
  "HbA1c Test", "HIV Test", "Hormone Test", "Immunity Test", "Kidney Function Test", "Lipid Profile Test",
  "Liver Function Test", "Malaria Test", "PCOS Test", "Early Pregnancy Checkup", "PSA Test", "STD Test",
  "Sugar Test", "Thyroid Test", "Typhoid Test", "Uric Acid Test", "Urine Test", "Vitamin B12 Test", "Vitamin D Test"
];

const RISKS = [
  "Acidity", "Allergy", "Anaemia", "Arthritis", "Bone", "Cancer", "Diabetes", "Digestion", "Fatigue", "Fever",
  "Heart", "Hepatitis", "Hormones", "Hypertension", "Immunity", "Infections", "Jaundice", "Joints", "Kidney",
  "Liver", "Obesity", "Pregnancy", "STD", "Thyroid", "Vitamins"
];

const HOME_TESTS = window.YELLO_PUBLIC
  ? ["Full Body Health Checkup", "Thyroid Profile", "CBC", "Liver Function Test", "Diabetes Care Package", "Women's Wellness Package"]
  : ["COVID RT-PCR", "CBC", "Vitamin D (25-OH)", "Thyroid Profile", "Diabetes Screening", "Liver Function Test"];
const LAB_TESTS = window.YELLO_PUBLIC
  ? ["MRI Brain", "USG Whole Abdomen"]
  : ["USG Whole Abdomen", "ECG", "X-Ray Chest PA View", "MRI Brain", "HRCT Chest", "CECT Whole Abdomen"];

const app = document.querySelector("#app");

/* Public build (yello.health): set by the deployed index.html. Bookings become requests
   (no OTP login, no payment); portals, invented reviews and demo accounts are hidden. */
const PUBLIC = Boolean(window.YELLO_PUBLIC);
const CONTACT = { label: "+91 99599 53699", tel: "+919959953699", wa: "919959953699" };

async function sendLead(type, data) {
  const url = window.YELLO_LEADS_API;
  if (!url) throw new Error("offline");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "lead", type, ...data, page: location.hash || "#home" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "failed");
  return payload;
}

function leadFailed() {
  showToast(`That didn't go through. Call or WhatsApp us on ${CONTACT.label}.`);
}

const api = {
  async get(path) {
    return request(path);
  },
  async post(path, body) {
    return request(path, { method: "POST", body });
  },
  async patch(path, body) {
    return request(path, { method: "PATCH", body });
  }
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(value) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

function navigate(route) {
  state.route = route;
  window.location.hash = route;
  window.scrollTo({ top: 0 });
  render();
}

function showToast(message) {
  state.toast = message;
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => {
    state.toast = "";
    toast.remove();
  }, 2800);
}

async function init() {
  window.addEventListener("hashchange", () => {
    state.route = location.hash.replace("#", "") || "home";
    render();
  });
  state.route = location.hash.replace("#", "") || "home";
  await Promise.all([loadLabs(), loadPackages(), loadDoctors(), loadLocations(), loadTestimonials()]);
  render();
}

async function loadLabs() {
  const query = new URLSearchParams({
    search: state.filters.search,
    sort: state.filters.sort,
    location: state.filters.location,
    visitType: state.filters.visitType,
    minRating: String(state.filters.minRating || 0),
    page: String(state.filters.page)
  });
  const data = await api.get(`/api/labs?${query}`);
  state.labs = data.results;
  state.labsMeta = { page: data.page, pageSize: data.pageSize, total: data.total };
}

async function loadPackages() {
  state.packages = await api.get("/api/packages");
}

async function loadDoctors() {
  state.doctors = await api.get("/api/doctors");
  state.selected.doctorId ||= state.doctors[0]?.id || "";
}

async function loadLocations() {
  state.locations = await api.get("/api/locations");
}

async function loadTestimonials() {
  state.testimonials = await api.get("/api/testimonials");
}

async function loadLab(id, selection = {}) {
  state.currentLab = await api.get(`/api/labs/${id}`);
  const firstDay = state.currentLab.slotDays.find((day) => day.slots.some((slot) => slot.available));
  const firstSlot = firstDay?.slots.find((slot) => slot.available);
  state.labSelection = {
    testId: selection.testId || state.currentLab.tests[0]?.id || "",
    date: selection.date || firstDay?.date || "",
    hour: selection.hour ?? firstSlot?.hour ?? null,
    visitType: state.currentLab.homeCollection ? "Home collection" : "Lab visit"
  };
}

async function loadBookings() {
  if (!state.consumer) return;
  [state.bookings, state.consultations] = await Promise.all([
    api.get(`/api/consumers/${state.consumer.id}/bookings`),
    api.get(`/api/consumers/${state.consumer.id}/consultations`)
  ]);
}

async function refreshConsumer() {
  if (!state.consumer) return;
  state.consumer = await api.get(`/api/consumers/${state.consumer.id}`);
  await loadBookings();
}

/* ---------- layout ---------- */

function layout(content) {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="#home" data-route="home">
          <img src="/assets/yello.png" alt="Yello">
          <span>Diagnostics</span>
        </a>
        <div class="header-tools">
          <select id="locationSelect" title="Location">
            ${state.locations.map((location) => `<option ${state.filters.location === location ? "selected" : ""}>${escapeHtml(location)}</option>`).join("")}
          </select>
          <div class="suggest-wrap">
            <input id="globalSearch" value="${escapeAttr(state.filters.search)}" placeholder="Search for lab, test, location, and package" autocomplete="off">
            <div class="suggest-list" id="suggestList" hidden></div>
          </div>
          <button class="secondary" id="uploadPrescription">Upload Prescription</button>
        </div>
        <nav class="nav">
          ${navButton("home", "Home")}
          ${navButton("browse", "Lab Tests")}
          ${navButton("packages", "Popular Packages")}
          ${navButton("how", "How it works")}
          ${navButton("contact", "Contact us")}
          ${PUBLIC ? "" : cartButton()}
          ${PUBLIC ? "" : navButton("account", state.consumer ? `Hi ${escapeHtml(state.consumer.name.split(" ")[0])}` : "My Account")}
        </nav>
      </header>
      <main class="main">${content}</main>
      ${footer()}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
  bindCommon();
}

function navButton(route, label) {
  return `<button class="${state.route === route ? "active" : ""}" data-route="${route}">${label}</button>`;
}

function cartButton() {
  const pending = state.bookings.filter((booking) => booking.paymentStatus !== "paid" && booking.status !== "cancelled").length;
  return `<button class="cart-button" data-route="account" title="Bookings awaiting payment">🛒${pending ? `<span class="cart-count">${pending}</span>` : ""}</button>`;
}

function footer() {
  return `
    <footer class="footer">
      <div class="footer-cloud">
        <h3>Most popular health tests</h3>
        <p class="cloud">${POPULAR_TESTS.map((item) => `<a href="#browse" data-search="${escapeAttr(item)}">${escapeHtml(item)}</a>`).join(" / ")}</p>
      </div>
      <div class="footer-cloud">
        <h3>Browse test by risks</h3>
        <p class="cloud">${RISKS.map((item) => `<a href="#browse" data-search="${escapeAttr(item)}">${escapeHtml(item)}</a>`).join(" / ")}</p>
      </div>
      <div class="footer-grid">
        <div>
          <strong>Yello</strong>
          <p class="muted">Yello is a curated preventive health network. We hold every partner centre to one quality bar, explain every report in plain language, and keep your family's health record in one trusted place — for life.</p>
        </div>
        <div>
          <strong>Policies</strong>
          <p class="muted">
            <a href="#terms" data-route="terms">Terms and conditions</a><br>
            <a href="#privacy" data-route="privacy">Privacy policy</a><br>
            <a href="#disclaimer" data-route="disclaimer">Disclaimer</a><br>
            <a href="#contact" data-route="contact">Contact us</a>
          </p>
        </div>
        <div>
          <strong>Company</strong>
          <p class="muted">
            <a href="/about">About us</a><br>
            <a href="#how" data-route="how">How it works</a><br>
            ${PUBLIC ? `<a href="/partners/">For centre owners</a><br>
            <a href="/investors/">Investors</a>` : `<a href="/admin">Admin portal</a><br>
            <a href="/doctor">Doctor portal</a>`}
          </p>
        </div>
        <div>
          <strong>Search Links</strong>
          <p class="muted">${["Full Body checkup in Hyderabad", "Thyroid test in Hyderabad", "MRI scan in Hyderabad"].map((item) => `<a href="#browse" data-search="${escapeAttr(item)}">${escapeHtml(item)}</a>`).join("<br>")}</p>
        </div>
      </div>
      <p class="muted copyright">© ${new Date().getFullYear()} NDIAN Healthcare Private Limited · CIN U86905TS2026PTC223050 · Regd. office: 3rd Floor, 8-2-231/18, Nagarjuna Hills Road, Mothi Nagar, Punjagutta, Hyderabad, Telangana 500082 · Yello is our network brand${PUBLIC ? "" : " (prototype)"}</p>
    </footer>
  `;
}

function bindCommon() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(button.dataset.route);
    });
  });
  document.querySelectorAll("[data-search]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      state.filters.search = link.dataset.search;
      state.filters.page = 1;
      await loadLabs();
      navigate("browse");
    });
  });
  document.querySelectorAll("[data-open-lab]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadLab(button.dataset.openLab, { testId: button.dataset.testId || "" });
      navigate("lab");
    });
  });
  bindHeader();
}

function bindHeader() {
  document.querySelector("#locationSelect")?.addEventListener("change", async (event) => {
    state.filters.location = event.target.value;
    state.filters.page = 1;
    await loadLabs();
    render();
  });

  const input = document.querySelector("#globalSearch");
  const list = document.querySelector("#suggestList");
  let timer = null;
  input?.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        list.hidden = true;
        return;
      }
      const suggestions = await api.get(`/api/suggest?q=${encodeURIComponent(q)}`);
      if (!suggestions.length) {
        list.hidden = true;
        return;
      }
      list.innerHTML = suggestions.map((item, index) => `
        <button class="suggest-item" data-index="${index}">
          <span class="pill">${escapeHtml(item.type)}</span>
          <span><strong>${escapeHtml(item.label)}</strong><br><span class="muted">${escapeHtml(item.sub || "")}</span></span>
        </button>
      `).join("");
      list.hidden = false;
      list.querySelectorAll(".suggest-item").forEach((button) => {
        button.addEventListener("click", async () => {
          const suggestion = suggestions[Number(button.dataset.index)];
          list.hidden = true;
          if (suggestion.labId) {
            await loadLab(suggestion.labId, { testId: suggestion.testId || "" });
            navigate("lab");
            return;
          }
          state.filters.search = suggestion.search || suggestion.label;
          state.filters.page = 1;
          await loadLabs();
          navigate("browse");
        });
      });
    }, 220);
  });
  input?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      state.filters.search = input.value.trim();
      state.filters.page = 1;
      await loadLabs();
      navigate("browse");
    }
  });
  document.addEventListener("click", (event) => {
    if (list && !event.target.closest(".suggest-wrap")) list.hidden = true;
  }, { once: true });

  document.querySelector("#uploadPrescription")?.addEventListener("click", openPrescriptionModal);
}

function openPrescriptionModal() {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal panel">
      <h3>Upload prescription to start a booking</h3>
      <p class="muted">Share your prescription and mobile number. The Yello team will match the tests and call you back with the right options and a time.</p>
      <div class="field"><label>Prescription file</label><input type="file" id="rxFile" accept=".pdf,.png,.jpg,.jpeg"></div>
      <div class="field"><label>Mobile number</label><input id="rxMobile" value="${escapeAttr(state.consumer?.mobile || "")}" placeholder="10 digit mobile"></div>
      <div class="field"><label>Note (optional)</label><textarea id="rxNote" placeholder="Anything we should know"></textarea></div>
      <div class="inline">
        <button class="primary" id="rxSubmit">Send to Yello</button>
        <button class="ghost" id="rxCancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.append(backdrop);
  backdrop.querySelector("#rxCancel").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("#rxSubmit").addEventListener("click", async () => {
    const file = backdrop.querySelector("#rxFile").files[0];
    const mobile = backdrop.querySelector("#rxMobile").value.trim();
    if (!file || !mobile) {
      showToast("Choose a file and enter your mobile number.");
      return;
    }
    const note = backdrop.querySelector("#rxNote").value.trim();
    if (PUBLIC) {
      if (!/^\+?[0-9 ]{10,14}$/.test(mobile)) { showToast("Enter a 10-digit mobile number."); return; }
      try {
        const upload = file.size <= 5 * 1024 * 1024 ? await fileToBase64(file) : "";
        await sendLead("prescription", { mobile, note, fileName: file.name, mimeType: file.type, fileData: upload });
      } catch (error) { leadFailed(); return; }
      backdrop.remove();
      showToast("Prescription received. We'll call you back.");
      return;
    }
    await api.post("/api/prescriptions", { mobile, fileName: file.name, note });
    backdrop.remove();
    showToast("Prescription received. Our team will call you back.");
  });
}

/* ---------- routing ---------- */

function render() {
  if (PUBLIC && ["login", "checkout", "payment", "success", "account", "report"].includes(state.route)) state.route = "home";
  if (state.route === "request") return renderRequest();
  if (state.route === "requested") return renderRequested();
  if (state.route === "browse") return renderBrowse();
  if (state.route === "packages") return renderPackages();
  if (state.route === "lab") return renderLab();
  if (state.route === "checkout") return renderCheckout();
  if (state.route === "payment") return renderPayment();
  if (state.route === "success") return renderSuccess();
  if (state.route === "login") return renderLogin();
  if (state.route === "account") return renderAccount();
  if (state.route === "report") return renderReport();
  if (state.route === "about") { window.location.href = "/about"; return; }
  if (state.route === "how") return renderHow();
  if (state.route === "contact") return renderContact();
  if (["terms", "privacy", "disclaimer"].includes(state.route)) return renderStatic(state.route);
  return renderHome();
}

/* ---------- home ---------- */

function renderHome() {
  const partners = pickPartners();
  layout(`
    <section class="promo-banner hero-split">
      <div>
        <p class="eyebrow light">Preventive health, for the whole family</p>
        <h1>Stay ahead<br>of illness.</h1>
        <p class="lead light">Yello works with accredited centres so that every check does three things: gives you an answer in plain language, a doctor to talk it through — and sharpens your <strong>health twin</strong>, the living picture of your body we keep for life.</p>
        <div class="inline">
          <button class="primary" data-route="browse">Book a health check</button>
          <button class="ghost light" id="promoUpload">Upload Prescription</button>
        </div>
        <div class="hero-trust">
          <span>NABL-accredited partner centres</span>
          <span>Reports explained, not just delivered</span>
          <span>Free doctor consult</span>
          <span>Home collection</span>
        </div>
      </div>
      <a class="hero-twin" href="/about#twin" title="How your health twin works">
        <p class="twin-tag">Your health twin</p>
        <p class="hero-twin-line">Every test makes it sharper.</p>
        <div class="art-cal">
          <span class="cal-dot on"></span><span class="cal-track"></span>
          <span class="cal-dot on"></span><span class="cal-track"></span>
          <span class="cal-dot on"></span><span class="cal-track dim"></span>
          <span class="cal-dot next"></span>
        </div>
        <div class="art-cal-labels"><span>Baseline</span><span>+6 mo</span><span>+1 yr</span><span>Next</span></div>
        <div class="art-spark"><i style="height:34%"></i><i style="height:46%"></i><i style="height:41%"></i><i style="height:58%"></i><i style="height:66%"></i><i class="hi" style="height:80%"></i></div>
        <span class="art-res">resolution <strong>62%</strong> · one twin per family member</span>
      </a>
    </section>

    <section class="value-band">
      <p class="eyebrow">Every Yello booking includes</p>
      <div class="value-grid">
        <div class="value-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 6h12M8 12h12M8 18h7M4 6h.01M4 12h.01M4 18h.01"/></svg>
          <strong>The answer in plain language</strong>
          <p>What changed, what it means, what to do — beside every number. The PDF is there; you won't need it.</p>
        </div>
        <div class="value-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c.8-3.5 4-5 8-5s7.2 1.5 8 5"/></svg>
          <strong>A doctor to talk it through</strong>
          <p>A free consult with every booking — chat or tele. No red number ever reaches you alone.</p>
        </div>
        <div class="value-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9M9.5 19v-4.5h5V19"/></svg>
          <strong>Home collection, or a calm centre</strong>
          <p>A phlebotomist at your door, or an accredited centre nearby. No counters, no queues.</p>
        </div>
        <div class="value-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>
          <strong>Your health twin, updated</strong>
          <p>Every test calibrates the living picture of you — one per family member, kept for life.</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Yello programs</p>
          <h2>Checks that keep you ahead</h2>
        </div>
        <button class="ghost" data-route="browse">See all programs</button>
      </div>
      <div class="slider">${state.packages.map(packageCard).join("")}</div>
    </section>

    <section class="section">
      <div class="drift-panel">
        <div class="drift-copy">
          <p class="twin-tag">Why prevention, in one picture</p>
          <h2>"Normal" every year.<br>Wrong direction the whole time.</h2>
          <p>Four annual reports, four green ticks — while the number quietly climbs toward the line. A snapshot can't see drift. A trajectory can. That's what your health twin watches, years before anything becomes a diagnosis.</p>
          <button class="primary" data-route="packages">Start your baseline</button>
        </div>
        <div class="drift-art" aria-hidden="true">
          <svg viewBox="0 0 320 190">
            <rect x="0" y="30" width="320" height="105" rx="8" fill="rgba(15,118,110,0.18)"/>
            <text x="10" y="24" class="drift-label">— upper limit of "normal"</text>
            <line x1="0" y1="30" x2="320" y2="30" stroke="rgba(255,253,247,0.28)" stroke-dasharray="5 5" stroke-width="1"/>
            <polyline points="30,118 120,102 210,74 300,42" fill="none" stroke="url(#driftGrad)" stroke-width="2.5" stroke-linecap="round"/>
            <defs>
              <linearGradient id="driftGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#ffc40c"/>
              </linearGradient>
            </defs>
            <circle cx="30" cy="118" r="5" fill="#0f766e"/>
            <circle cx="120" cy="102" r="5" fill="#0f766e"/>
            <circle cx="210" cy="74" r="5" fill="#0f766e"/>
            <circle cx="300" cy="42" r="6.5" fill="#ffc40c"/>
            <circle cx="300" cy="42" r="12" fill="none" stroke="rgba(255,196,12,0.4)" stroke-width="2"/>
            <text x="22" y="140" class="drift-year">2023</text>
            <text x="112" y="140" class="drift-year">2024</text>
            <text x="202" y="140" class="drift-year">2025</text>
            <text x="285" y="140" class="drift-year">2026</text>
            <text x="30" y="168" text-anchor="middle" class="drift-tick">✓</text>
            <text x="120" y="168" text-anchor="middle" class="drift-tick">✓</text>
            <text x="210" y="168" text-anchor="middle" class="drift-tick">✓</text>
            <text x="300" y="168" text-anchor="end" class="drift-tick warn">⚠ caught early</text>
          </svg>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">When you need a test today</p>
          <h2>Everyday tests, without the queue</h2>
        </div>
      </div>
      <div class="two-col">
        <div class="panel home-collect-panel">
          <img src="/assets/home-collection.png" alt="Yello home sample collection rider" class="home-collect-img" loading="lazy">
          <div>
            <h3>We come to you</h3>
            <p class="muted small">A trained phlebotomist at your door, early morning to evening. Sample sealed and tracked to the lab.</p>
            <div class="chips">${HOME_TESTS.map(testChip).join("")}</div>
          </div>
        </div>
        <div class="panel">
          <h3>Visit a centre nearby</h3>
          <p class="muted small">Visit an accredited Yello partner centre for scans and imaging — calm and on time.</p>
          <div class="chips">${LAB_TESTS.map(testChip).join("")}</div>
        </div>
      </div>
    </section>

    ${PUBLIC ? "" : `<section class="section band">
      <div class="section-head">
        <div>
          <p class="eyebrow">A network you don't have to second-guess</p>
          <h2>Every centre, held to the same bar</h2>
        </div>
        <button class="ghost" data-route="browse">Explore the network</button>
      </div>
      <div class="slider">${partners.map(partnerTile).join("")}</div>
    </section>`}

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">How Yello works</p>
          <h2>Considered, from booking to answer</h2>
        </div>
      </div>
      <div class="steps">
        ${step(1, "Choose a check or program", "For yourself or the family — a one-off test or a plan that stays ahead of risk.")}
        ${step(2, "Pick a time that suits", "Quieter Yello hours carry a gentler price — same machines, same doctors, no crowd.")}
        ${step(3, "Home or centre", "A phlebotomist at your door, or a calm visit nearby. No counters, no queues.")}
        ${step(4, "An answer, not a PDF", "Reports explained in plain language, tracked over time — with a free doctor consult.")}
      </div>
    </section>

    ${PUBLIC || !state.testimonials.length ? "" : `<section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Families on Yello</p>
          <h2>Cared for, not processed</h2>
        </div>
      </div>
      <div class="slider">${state.testimonials.map(testimonialCard).join("")}</div>
    </section>`}

    <section class="section subscribe">
      <h2>Stay ahead, every month</h2>
      <p class="light">One considered note on your family's health — no noise, no offers.</p>
      <form class="subscribe-form" id="subscribeForm">
        <input id="subscribeEmail" type="email" placeholder="Enter your email address" required>
        <button class="primary">Subscribe</button>
      </form>
    </section>
  `);
  document.querySelector("#promoUpload")?.addEventListener("click", openPrescriptionModal);
  document.querySelector("#subscribeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const email = document.querySelector("#subscribeEmail").value.trim();
      if (PUBLIC) {
        try { await sendLead("subscribe", { email }); } catch { leadFailed(); return; }
        showToast("Subscribed. One considered note a month, nothing else.");
        document.querySelector("#subscribeEmail").value = "";
        return;
      }
      const result = await api.post("/api/newsletter", { email });
      showToast(`Subscribed ${result.email} to Healthy Updates.`);
      document.querySelector("#subscribeEmail").value = "";
    } catch (error) {
      showToast(error.message);
    }
  });
}

function pickPartners() {
  const inLocation = state.labs.filter((lab) => lab.featured);
  if (inLocation.length) return inLocation;
  return state.labs;
}

function step(number, title, text) {
  return `
    <div class="panel step-card">
      <span class="step-number">${number}</span>
      <h3>${title}</h3>
      <p class="muted">${text}</p>
    </div>
  `;
}

function testChip(name) {
  return `<a class="chip" href="#browse" data-search="${escapeAttr(name)}">${escapeHtml(name)}</a>`;
}

function packageCard(pkg) {
  const initials = pkg.labName.split(" ").map((word) => word[0]).join("").slice(0, 3).toUpperCase();
  return `
    <article class="package-card lab-branded-card">
      <span class="yello-ribbon" aria-hidden="true">yello</span>
      <h3>${escapeHtml(pkg.name)}</h3>
      <p class="muted small pkg-covers">${escapeHtml(pkg.description)}</p>
      <div class="lab-brand-row">
        <span class="lab-line"><span class="lab-mark">${escapeHtml(initials)}</span> ${escapeHtml(pkg.labName)}</span>
        ${pkg.rating ? `<span class="lab-rating">★ ${pkg.rating}</span>` : ""}
      </div>
      <div class="price-calm">
        <strong>${money(pkg.bestPrice)}</strong>
        <span class="muted small">in Yello hours · ${money(pkg.mrp)} otherwise</span>
      </div>
      <button class="secondary full" data-open-lab="${pkg.labId}" data-test-id="${pkg.id}">Choose a time</button>
    </article>
  `;
}

function partnerTile(lab) {
  return `
    <article class="partner-tile panel">
      <div class="partner-logo">${escapeHtml(lab.name.split(" ").map((word) => word[0]).join("").slice(0, 3).toUpperCase())}</div>
      <h3>${escapeHtml(lab.name)}</h3>
      <p class="muted">${escapeHtml(lab.location)} · ${lab.rating} ★ (${lab.reviewCount})</p>
      <p class="muted">${escapeHtml(lab.accreditation || "Quality-sealed")} · Yello standard</p>
      <button class="ghost" data-open-lab="${lab.id}">View centre</button>
    </article>
  `;
}

function testimonialCard(item) {
  return `
    <article class="panel quote-card">
      <p class="quote-mark">“</p>
      <p>${escapeHtml(item.text)}</p>
      <p><strong>${escapeHtml(item.author)}</strong><br><span class="muted">${escapeHtml(item.location)}</span></p>
    </article>
  `;
}

/* ---------- browse / listing ---------- */

function renderBrowse() {
  const meta = state.labsMeta;
  const totalPages = Math.max(Math.ceil(meta.total / meta.pageSize), 1);
  const upsell = state.packages.slice(0, 3);
  layout(`
    <section class="section listing-grid">
      <aside class="panel filters">
        <h3>Filters</h3>
        <div class="field">
          <label>Location</label>
          <select id="filterLocation">${state.locations.map((location) => `<option ${state.filters.location === location ? "selected" : ""}>${escapeHtml(location)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Test type</label>
          <select id="filterVisit">
            <option value="" ${!state.filters.visitType ? "selected" : ""}>Any</option>
            <option ${state.filters.visitType === "Home collection" ? "selected" : ""}>Home collection</option>
            <option ${state.filters.visitType === "Lab visit" ? "selected" : ""}>Lab visit</option>
          </select>
        </div>
        <div class="field" ${PUBLIC ? "hidden" : ""}>
          <label>Minimum rating</label>
          <select id="filterRating">
            ${[0, 4, 4.5].map((rating) => `<option value="${rating}" ${state.filters.minRating === rating ? "selected" : ""}>${rating ? `${rating}+ stars` : "Any"}</option>`).join("")}
          </select>
        </div>
        <button class="primary full" id="applyFilters">Apply</button>
        <div class="upsell">
          <h3>Frequently booked together</h3>
          ${upsell.map((pkg) => `
            <button class="upsell-item" data-open-lab="${pkg.labId}" data-test-id="${pkg.id}">
              <strong>${escapeHtml(pkg.name)}</strong>
              <span class="muted">${money(pkg.bestPrice)} · ${escapeHtml(pkg.labName)}</span>
            </button>
          `).join("")}
        </div>
      </aside>
      <div>
        <div class="section-head">
          <div>
            <p class="eyebrow">Search results ${state.filters.search ? `for “${escapeHtml(state.filters.search)}”` : ""}</p>
            <h2>${PUBLIC ? `${meta.total} way${meta.total === 1 ? "" : "s"} to book` : `${meta.total} lab${meta.total === 1 ? "" : "s"} found`}</h2>
          </div>
          <div class="field">
            <label>Sort by</label>
            <select id="sortSelect">
              <option value="price_asc" ${state.filters.sort === "price_asc" ? "selected" : ""}>Price low to high</option>
              <option value="price_desc" ${state.filters.sort === "price_desc" ? "selected" : ""}>Price high to low</option>
              ${PUBLIC ? "" : `<option value="distance" ${state.filters.sort === "distance" ? "selected" : ""}>Distance</option>
              <option value="reviews" ${state.filters.sort === "reviews" ? "selected" : ""}>Reviews</option>`}
            </select>
          </div>
        </div>
        <div class="lab-list">
          ${state.labs.length ? state.labs.map(listingCard).join("") : PUBLIC
            ? `<div class="empty"><strong>We don't list that one online yet.</strong><br>Tell us what you need — or send the prescription — and we'll call you with the right test, a time and the price.<br><br><button class="primary" id="emptyRx">Send a prescription</button> <button class="ghost" data-route="contact">Ask us</button></div>`
            : `<div class="empty">No labs matched the current search and filters.</div>`}
        </div>
        ${meta.total > meta.pageSize ? `
          <div class="pagination">
            <button class="ghost" id="prevPage" ${meta.page <= 1 ? "disabled" : ""}>Previous</button>
            <span class="muted">Page ${meta.page} of ${totalPages}</span>
            <button class="ghost" id="nextPage" ${meta.page >= totalPages ? "disabled" : ""}>Next</button>
          </div>
        ` : ""}
      </div>
    </section>
  `);
  bindBrowse(totalPages);
}

function listingCard(lab) {
  return `
    <article class="lab-card listing-card">
      <div>
        <div class="meta">
          ${lab.featured ? `<span class="pill brand-pill">Featured</span>` : ""}
          ${lab.branded ? `<span class="pill brand-pill">Yello branded</span>` : ""}
          ${lab.rating ? `<span class="pill">${lab.rating} ★ (${lab.reviewCount})</span>` : ""}
        </div>
        <h3>${escapeHtml(lab.name)}</h3>
        <p class="muted">Accreditation: ${escapeHtml(lab.accreditation || "—")} · ${escapeHtml(lab.location)}${lab.distanceKm != null ? ` · ${lab.distanceKm} km` : ""}</p>
        <p class="muted">${lab.packageNames.map(escapeHtml).join(", ")}</p>
        <div class="meta">
          <span class="pill off-pill">${escapeHtml(lab.offerText)}</span>
          <span class="pill">${lab.services.join(" + ")}</span>
        </div>
        ${slotGrid(lab.slotDays, lab.id, null)}
      </div>
      <div class="lab-card-actions">
        <strong>From ${money(lab.startingPrice)}</strong>
        <button class="primary" data-open-lab="${lab.id}">${PUBLIC ? "Choose a time" : "Select Lab"}</button>
      </div>
    </article>
  `;
}

function slotGrid(slotDays, labId, selection, options = {}) {
  const limit = options.limit ?? 3;
  return `
    <div class="slot-grid">
      ${slotDays.map((day) => {
        const visible = options.showAll ? day.slots : day.slots.slice(0, limit);
        const hidden = day.slots.length - visible.length;
        return `
          <div class="slot-day">
            <p class="slot-day-head">${escapeHtml(day.dayLabel)}<br><span class="muted">${escapeHtml(day.date)}</span></p>
            ${visible.map((slot) => {
              const isSelected = selection && selection.date === day.date && selection.hour === slot.hour;
              const tier = slot.discountPercent >= 35 ? 3 : slot.discountPercent >= 20 ? 2 : 1;
              return `
                <button class="slot-chip ${isSelected ? "selected" : ""} ${slot.yelloHour ? "yello-hour" : ""}"
                  data-tier="${slot.available ? tier : 0}"
                  data-slot-lab="${labId}" data-slot-date="${day.date}" data-slot-hour="${slot.hour}" ${slot.available ? "" : "disabled"}>
                  <strong>${escapeHtml(slot.label.split(" - ")[0])}</strong>
                  <span>${!slot.available ? "Full" : slot.discountPercent ? `${slot.discountPercent}% OFF` : "Standard"}</span>
                </button>
              `;
            }).join("")}
            ${hidden > 0 ? `<p class="muted small">+ ${hidden} more slots</p>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function bindBrowse(totalPages) {
  document.querySelector("#applyFilters")?.addEventListener("click", async () => {
    state.filters.location = document.querySelector("#filterLocation").value;
    state.filters.visitType = document.querySelector("#filterVisit").value;
    state.filters.minRating = Number(document.querySelector("#filterRating").value);
    state.filters.page = 1;
    await loadLabs();
    render();
  });
  document.querySelector("#sortSelect")?.addEventListener("change", async (event) => {
    state.filters.sort = event.target.value;
    state.filters.page = 1;
    await loadLabs();
    render();
  });
  document.querySelector("#prevPage")?.addEventListener("click", async () => {
    state.filters.page = Math.max(state.filters.page - 1, 1);
    await loadLabs();
    render();
  });
  document.querySelector("#nextPage")?.addEventListener("click", async () => {
    state.filters.page = Math.min(state.filters.page + 1, totalPages);
    await loadLabs();
    render();
  });
  bindSlotChips();
  document.querySelector("#emptyRx")?.addEventListener("click", openPrescriptionModal);
}

function bindSlotChips() {
  document.querySelectorAll("[data-slot-lab]").forEach((chip) => {
    chip.addEventListener("click", async () => {
      const { slotLab, slotDate, slotHour } = chip.dataset;
      if (!state.currentLab || state.currentLab.id !== slotLab) {
        await loadLab(slotLab, { date: slotDate, hour: Number(slotHour) });
      } else {
        state.labSelection.date = slotDate;
        state.labSelection.hour = Number(slotHour);
      }
      if (state.route === "lab") {
        renderLab();
      } else {
        navigate("lab");
      }
    });
  });
}

/* ---------- lab detail ---------- */

function renderLab() {
  if (!state.currentLab) return renderBrowse();
  const lab = state.currentLab;
  const selection = state.labSelection;
  const selectedTest = lab.tests.find((test) => test.id === selection.testId) || lab.tests[0];
  const selectedSlot = findSelectedSlot(lab, selection);
  const finalPrice = selectedTest && selectedSlot ? Math.round(selectedTest.mrp * (1 - selectedSlot.discountPercent / 100)) : 0;
  layout(`
    <section class="section detail-grid">
      <div>
        <button class="ghost" data-route="browse">← Back to results</button>
        <div class="meta">
          ${lab.branded ? `<span class="pill brand-pill">Yello branded</span>` : ""}
          ${lab.featured ? `<span class="pill">Featured</span>` : ""}
          ${lab.rating ? `<span class="pill">${lab.rating} ★ (${lab.reviewCount})</span>` : ""}
          <span class="pill">Accreditation: ${escapeHtml(lab.accreditation || "—")}</span>
        </div>
        <h2>${escapeHtml(lab.name)}</h2>
        <p class="lead">${escapeHtml(lab.description)}</p>
        <p class="muted">${escapeHtml(lab.address)}${PUBLIC ? "" : ` · <a href="https://www.google.com/maps/search/${encodeURIComponent(`${lab.name} ${lab.address}`)}" target="_blank" rel="noreferrer">Get directions</a>`}</p>
        <div class="panel">
          <h3>Tests and packages</h3>
          ${lab.tests.map((test) => `
            <label class="test-option">
              <span class="inline">
                <input type="radio" name="testId" value="${test.id}" ${selectedTest?.id === test.id ? "checked" : ""}>
                <strong>${escapeHtml(test.name)}</strong>
                <span class="pill">${test.category}</span>
              </span>
              <span class="muted">${escapeHtml(test.description)}</span>
              <span class="muted">Pre-test: ${escapeHtml(test.preTestPrep)} · Sample: ${escapeHtml(test.sampleType)} · For: ${escapeHtml(test.audience)}</span>
              <span><span class="strike muted">${money(test.mrp)}</span> <strong>${money(test.bestPrice)}</strong> <span class="muted">at the best slot</span></span>
            </label>
          `).join("")}
        </div>
        ${PUBLIC ? "" : `<div class="panel">
          <h3>Reviews</h3>
          ${lab.reviews.map((review) => `<p><strong>${escapeHtml(review.author)}</strong> ${"★".repeat(review.rating)}<br><span class="muted">${escapeHtml(review.text)}</span></p>`).join("") || `<p class="muted">No reviews yet.</p>`}
        </div>`}
      </div>
      <aside class="panel booking-panel">
        <h3>Choose a time slot</h3>
        <p class="muted">Hourly slots for today and the next 2 days. Highlighted slots are Yello hours with the deepest discounts.</p>
        <div class="field">
          <label>Visit type</label>
          <select id="visitType">
            ${lab.homeCollection ? `<option ${selection.visitType === "Home collection" ? "selected" : ""}>Home collection</option>` : ""}
            ${lab.labVisit ? `<option ${selection.visitType === "Lab visit" ? "selected" : ""}>Lab visit</option>` : ""}
          </select>
        </div>
        ${slotGrid(lab.slotDays, lab.id, selection, { showAll: true })}
        <div class="price">
          <strong>${money(finalPrice)}</strong>
          <span class="muted strike">${money(selectedTest?.mrp || 0)}</span>
          ${selectedSlot ? `<span class="pill off-pill">${selectedSlot.discountPercent}% off</span>` : ""}
        </div>
        <p class="muted">${selectedSlot ? `${escapeHtml(selectedTest?.name || "")} · ${escapeHtml(formatDay(lab, selection))} ${escapeHtml(selectedSlot.label)}` : "Select a slot to continue."}</p>
        ${PUBLIC ? `<p class="muted small">Indicative price. Nothing is charged online — we call to confirm the time, the centre and the final price.</p>` : ""}
        <button class="primary full" id="bookAppointment" ${selectedSlot ? "" : "disabled"}>${PUBLIC ? "Request this slot" : "Book appointment"}</button>
      </aside>
    </section>
  `);
  bindLabDetail();
}

function findSelectedSlot(lab, selection) {
  const day = lab.slotDays.find((item) => item.date === selection.date);
  return day?.slots.find((slot) => slot.hour === selection.hour && slot.available) || null;
}

function formatDay(lab, selection) {
  return lab.slotDays.find((item) => item.date === selection.date)?.dayLabel || selection.date;
}

function bindLabDetail() {
  document.querySelectorAll("input[name='testId']").forEach((input) => {
    input.addEventListener("change", () => {
      state.labSelection.testId = input.value;
      renderLab();
    });
  });
  document.querySelector("#visitType")?.addEventListener("change", (event) => {
    state.labSelection.visitType = event.target.value;
  });
  bindSlotChips();
  document.querySelector("#bookAppointment")?.addEventListener("click", () => {
    const lab = state.currentLab;
    const selection = state.labSelection;
    const test = lab.tests.find((item) => item.id === selection.testId) || lab.tests[0];
    const slot = findSelectedSlot(lab, selection);
    if (!slot) return;
    state.booking = {
      labId: lab.id,
      labName: lab.name,
      labAddress: lab.address,
      homeCollection: lab.homeCollection,
      test,
      visitType: document.querySelector("#visitType")?.value || selection.visitType,
      date: selection.date,
      dayLabel: formatDay(lab, selection),
      hour: slot.hour,
      slotLabel: slot.label,
      discountPercent: slot.discountPercent,
      price: Math.round(test.mrp * (1 - slot.discountPercent / 100)),
      step: 1,
      patientId: state.consumer?.patients[0]?.id || "new",
      newPatient: { name: "", age: "", gender: "Female" },
      addressId: state.consumer?.addresses[0]?.id || "new",
      newAddress: "",
      saveAddress: true,
      questionText: "",
      prescriptionName: ""
    };
    if (PUBLIC) {
      navigate("request");
      return;
    }
    if (!state.consumer) {
      state.auth.next = "checkout";
      navigate("login");
      return;
    }
    navigate("checkout");
  });
}

/* ---------- booking request (public build: no login, no payment) ---------- */

function renderRequest() {
  const draft = state.booking;
  if (!draft) return renderBrowse();
  const test = draft.test;
  const home = draft.visitType === "Home collection";
  const f = draft.request || (draft.request = { name: "", age: "", gender: "Female", mobile: "", email: "", address: "", note: "", consent: false });
  layout(`
    <section class="section checkout">
      <div class="panel summary-card">
        <div class="section-head">
          <h2>${escapeHtml(test.name)}</h2>
          <button class="ghost" data-open-lab="${draft.labId}">Change</button>
        </div>
        <p class="lead">${escapeHtml(draft.labName)} · ${escapeHtml(draft.visitType)}</p>
        <div class="summary-grid">
          <p><span class="muted">Preferred slot</span><br><strong>${escapeHtml(draft.dayLabel)}, ${escapeHtml(draft.date)} · ${escapeHtml(draft.slotLabel)}</strong></p>
          <p><span class="muted">Pre-test preparation</span><br><strong>${escapeHtml(test.preTestPrep)}</strong></p>
          <p><span class="muted">Need to provide</span><br><strong>${escapeHtml(test.sampleType)}</strong></p>
          <p><span class="muted">Indicative price</span><br><strong>${money(draft.price)}</strong> <span class="muted strike">${money(test.mrp)}</span></p>
        </div>
        <p class="muted small">Nothing is charged online. We call you to confirm the time, the centre and the final price before anything is booked.</p>
      </div>
      <form class="panel" id="requestForm" novalidate>
        <h3>Who is this for?</h3>
        <div class="form-grid">
          <div class="field"><label for="rqName">Patient's name</label><input id="rqName" autocomplete="name" value="${escapeAttr(f.name)}" required></div>
          <div class="field"><label for="rqAge">Age</label><input id="rqAge" type="number" min="0" max="120" value="${escapeAttr(f.age)}" required></div>
          <div class="field"><label for="rqGender">Gender</label>
            <select id="rqGender">${["Female", "Male", "Other"].map((g) => `<option ${f.gender === g ? "selected" : ""}>${g}</option>`).join("")}</select>
          </div>
          <div class="field"><label for="rqMobile">Mobile number (we'll call this)</label><input id="rqMobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="10-digit mobile" value="${escapeAttr(f.mobile)}" required></div>
          <div class="field full"><label for="rqEmail">Email (optional)</label><input id="rqEmail" type="email" autocomplete="email" value="${escapeAttr(f.email)}"></div>
          ${home ? `<div class="field full"><label for="rqAddress">Collection address</label><textarea id="rqAddress" placeholder="House, street, area, pincode">${escapeHtml(f.address)}</textarea></div>` : ""}
          <div class="field full"><label for="rqNote">Anything we should know? (optional)</label><textarea id="rqNote" placeholder="A prescription, a time that suits better, who we should speak to">${escapeHtml(f.note)}</textarea></div>
        </div>
        <label class="inline consent"><input type="checkbox" id="rqConsent" ${f.consent ? "checked" : ""}> <span>Yello may call me about this request and keep these details as set out in the <a href="/privacy.html" target="_blank" rel="noopener">privacy policy</a>.</span></label>
        <button class="primary full big" id="rqSend" type="submit">Request this booking</button>
        <p class="muted small">Prefer to talk? Call or WhatsApp <a href="tel:${CONTACT.tel}">${CONTACT.label}</a>.</p>
      </form>
    </section>
  `);
  document.querySelector("#requestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    Object.assign(f, {
      name: value("#rqName"), age: value("#rqAge"), gender: value("#rqGender"), mobile: value("#rqMobile"),
      email: value("#rqEmail"), address: home ? value("#rqAddress") : "", note: value("#rqNote"),
      consent: document.querySelector("#rqConsent").checked
    });
    const digits = f.mobile.replace(/\D/g, "");
    if (!f.name || !f.age) return showToast("Add the patient's name and age.");
    if (digits.length < 10 || digits.length > 12) return showToast("Enter a 10-digit mobile number.");
    if (home && !f.address) return showToast("Add the collection address.");
    if (!f.consent) return showToast("Tick the box so we can call you about this request.");
    const button = document.querySelector("#rqSend");
    button.disabled = true; button.textContent = "Sending…";
    try {
      const result = await sendLead("booking", {
        test: test.name, option: draft.labName, visitType: draft.visitType,
        date: draft.date, slot: draft.slotLabel, indicativePrice: draft.price, mrp: test.mrp,
        name: f.name, age: f.age, gender: f.gender, mobile: f.mobile, email: f.email, address: f.address, note: f.note
      });
      state.lastRequest = { ...f, ref: result.ref || "", test: test.name, slot: `${draft.dayLabel}, ${draft.date} · ${draft.slotLabel}`, visitType: draft.visitType };
      state.booking = null;
      navigate("requested");
    } catch (error) {
      button.disabled = false; button.textContent = "Request this booking";
      leadFailed();
    }
  });
}

function renderRequested() {
  const r = state.lastRequest;
  if (!r) return renderHome();
  layout(`
    <section class="section success">
      <h1 class="center">Request received</h1>
      <div class="panel summary-card">
        <p class="lead">${escapeHtml(r.test)} · ${escapeHtml(r.visitType)}</p>
        <div class="summary-grid">
          <p><span class="muted">For</span><br><strong>${escapeHtml(r.name)} · ${escapeHtml(r.age)} · ${escapeHtml(r.gender)}</strong></p>
          <p><span class="muted">Preferred slot</span><br><strong>${escapeHtml(r.slot)}</strong></p>
          <p><span class="muted">We'll call</span><br><strong>${escapeHtml(r.mobile)}</strong></p>
          ${r.ref ? `<p><span class="muted">Reference</span><br><strong>${escapeHtml(r.ref)}</strong></p>` : ""}
        </div>
        <p class="muted">A Yello person will call you to confirm the time, the centre and the final price. Nothing is booked or charged until you say yes on that call.</p>
      </div>
      <div class="center">
        <button class="ghost" data-route="home">Back to home</button>
        <button class="primary" data-route="browse">Request another test</button>
      </div>
    </section>
  `);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* ---------- login (wireframe: Login + OTP) ---------- */

function renderLogin() {
  const auth = state.auth;
  layout(`
    <section class="section">
      <div class="hero-panel login-card">
        <img class="login-logo" src="/assets/yello.png" alt="Yello">
        ${!auth.otpRequested ? `
          <h2>Login/Sign up to Yello</h2>
          <div class="field"><label>Mobile number</label><input id="loginMobile" value="${escapeAttr(auth.mobile || "9876543210")}" placeholder="Your mobile number"></div>
          <button class="primary full" id="sendOtp">Login</button>
        ` : `
          <h2>Verify OTP</h2>
          <p class="muted">Provide OTP sent to <strong>${escapeHtml(maskMobile(auth.mobile))}</strong> <button class="link" id="editMobile">Edit</button></p>
          <div class="field"><label>One time password</label><input id="loginOtp" placeholder="6 digit OTP"></div>
          ${auth.needsProfile ? `
            <div class="form-grid">
              <div class="field"><label>Name</label><input id="loginName" placeholder="Only letters and spaces"></div>
              <div class="field"><label>Email</label><input id="loginEmail" placeholder="you@example.com"></div>
            </div>
          ` : ""}
          <button class="link" id="resendOtp">Resend OTP</button>
          <button class="primary full" id="verifyOtp">Done</button>
        `}
      </div>
    </section>
  `);
  bindLogin();
}

function maskMobile(mobile) {
  return `+91 xxxx xxx ${String(mobile).slice(-3)}`;
}

function bindLogin() {
  const sendOtp = async () => {
    state.auth.mobile = document.querySelector("#loginMobile")?.value.trim() || state.auth.mobile;
    const data = await api.post("/api/auth/request-otp", { mobile: state.auth.mobile });
    state.auth.otpRequested = true;
    renderLogin();
    showToast(`OTP sent via SMS. Prototype code: ${data.prototypeOtp}`);
    const otpInput = document.querySelector("#loginOtp");
    if (otpInput) otpInput.value = data.prototypeOtp;
  };
  document.querySelector("#sendOtp")?.addEventListener("click", sendOtp);
  document.querySelector("#resendOtp")?.addEventListener("click", sendOtp);
  document.querySelector("#editMobile")?.addEventListener("click", () => {
    state.auth.otpRequested = false;
    state.auth.needsProfile = false;
    renderLogin();
  });
  document.querySelector("#verifyOtp")?.addEventListener("click", async () => {
    try {
      const payload = {
        mobile: state.auth.mobile,
        otp: document.querySelector("#loginOtp").value.trim()
      };
      if (state.auth.needsProfile) {
        payload.name = document.querySelector("#loginName").value.trim();
        payload.email = document.querySelector("#loginEmail").value.trim();
      }
      const data = await api.post("/api/auth/verify-otp", payload);
      state.consumer = data.consumer;
      await refreshConsumer();
      if (state.booking) {
        state.booking.patientId = state.consumer.patients[0]?.id || "new";
        state.booking.addressId = state.consumer.addresses[0]?.id || "new";
      }
      state.auth.otpRequested = false;
      state.auth.needsProfile = false;
      showToast(`Signed in as ${state.consumer.name}`);
      navigate(state.auth.next || "account");
      state.auth.next = "account";
    } catch (error) {
      if (/name is required|email is required/i.test(error.message)) {
        state.auth.needsProfile = true;
        renderLogin();
        showToast("New to Yello? Add your name and email to finish signup.");
        return;
      }
      showToast(error.message);
    }
  });
}

/* ---------- checkout (wireframe: Schedule appointment) ---------- */

function renderCheckout() {
  const draft = state.booking;
  if (!draft) return renderBrowse();
  if (!state.consumer) {
    state.auth.next = "checkout";
    return renderLogin();
  }
  const test = draft.test;
  layout(`
    <section class="section checkout">
      <div class="panel summary-card">
        <div class="section-head">
          <h2>${escapeHtml(draft.labName)}</h2>
          <button class="ghost" data-open-lab="${draft.labId}">Change</button>
        </div>
        <p class="lead">${escapeHtml(test.name)}</p>
        <div class="summary-grid">
          <p><span class="muted">Pre-test preparation</span><br><strong>${escapeHtml(test.preTestPrep)}</strong></p>
          <p><span class="muted">Home collection</span><br><strong>${draft.homeCollection ? "Possible" : "Not available"}</strong></p>
          <p><span class="muted">Need to visit centre</span><br><strong>${test.visitRequired ? "Required" : "Not necessary"}</strong></p>
          <p><span class="muted">Appointment slot</span><br><strong>${escapeHtml(draft.dayLabel)}, ${escapeHtml(draft.date)} · ${escapeHtml(draft.slotLabel)}</strong></p>
          <p><span class="muted">Need to provide</span><br><strong>${escapeHtml(test.sampleType)}</strong></p>
          <p><span class="muted">This test is for</span><br><strong>${escapeHtml(test.audience)}</strong></p>
        </div>
        <div class="price right">
          <span class="muted strike">${money(test.mrp)}</span>
          <strong>${money(draft.price)}</strong>
        </div>
      </div>

      ${accordion(1, "Patient details", draft.step, patientStep(draft))}
      ${accordion(2, "Address details", draft.step, addressStep(draft))}
      ${accordion(3, "Ask for any question", draft.step, questionStep(draft), true)}

      <button class="primary full big" id="orderConfirm" ${draft.step >= 3 ? "" : "disabled"}>Order confirm</button>
    </section>
  `);
  bindCheckout();
}

function accordion(number, title, step, content, optional = false) {
  const open = step === number || (optional && step >= number);
  const done = step > number;
  return `
    <div class="panel accordion ${open ? "open" : ""}">
      <button class="accordion-head" data-step="${number}">
        <span><span class="step-number small">${number}</span> ${title} ${optional ? `<span class="muted">(optional)</span>` : ""}</span>
        <span class="check ${done ? "done" : ""}">${done ? "✓" : ""}</span>
      </button>
      ${open ? `<div class="accordion-body">${content}</div>` : ""}
    </div>
  `;
}

function patientStep(draft) {
  const patients = state.consumer.patients;
  return `
    <div class="field">
      <label>Select patient</label>
      ${patients.map((patient) => `
        <label class="patient-option">
          <span class="inline">
            <input type="radio" name="patientPick" value="${patient.id}" ${draft.patientId === patient.id ? "checked" : ""}>
            <strong>${escapeHtml(patient.name)}</strong>
            <span class="muted">${patient.age} · ${patient.gender}</span>
          </span>
        </label>
      `).join("")}
      <label class="patient-option">
        <span class="inline">
          <input type="radio" name="patientPick" value="new" ${draft.patientId === "new" ? "checked" : ""}>
          <strong>Add new patient</strong>
        </span>
      </label>
    </div>
    ${draft.patientId === "new" ? `
      <div class="form-grid">
        <div class="field"><label>Name</label><input id="newPatientName" value="${escapeAttr(draft.newPatient.name)}"></div>
        <div class="field"><label>Age</label><input id="newPatientAge" type="number" value="${escapeAttr(draft.newPatient.age)}"></div>
        <div class="field full"><label>Gender</label>
          <select id="newPatientGender">
            ${["Female", "Male", "Other"].map((gender) => `<option ${draft.newPatient.gender === gender ? "selected" : ""}>${gender}</option>`).join("")}
          </select>
        </div>
      </div>
    ` : ""}
    <button class="secondary" id="savePatient">Select Patient</button>
  `;
}

function addressStep(draft) {
  if (draft.visitType === "Lab visit") {
    return `
      <label class="patient-option">
        <span class="inline"><input type="checkbox" id="labVisitOk" checked><strong>Lab visit</strong></span>
        <span class="muted">${escapeHtml(draft.labName)} · ${escapeHtml(draft.labAddress)}</span>
      </label>
      <button class="secondary" id="saveAddress">Confirm address</button>
    `;
  }
  const addresses = state.consumer.addresses;
  return `
    <div class="field">
      <label>Deliver home collection to</label>
      ${addresses.map((address) => `
        <label class="patient-option">
          <span class="inline">
            <input type="radio" name="addressPick" value="${address.id}" ${draft.addressId === address.id ? "checked" : ""}>
            <strong>${escapeHtml(address.label)}</strong>
          </span>
          <span class="muted">${escapeHtml(address.line)}</span>
        </label>
      `).join("")}
      <label class="patient-option">
        <span class="inline">
          <input type="radio" name="addressPick" value="new" ${draft.addressId === "new" ? "checked" : ""}>
          <strong>+ Add new address</strong>
        </span>
      </label>
    </div>
    ${draft.addressId === "new" ? `
      <div class="field"><label>Full address</label><textarea id="newAddressLine" placeholder="House, street, area, city, pincode">${escapeHtml(draft.newAddress)}</textarea></div>
      <label class="inline"><input type="checkbox" id="saveAddressToggle" ${draft.saveAddress ? "checked" : ""}> Save this address to my account</label>
    ` : ""}
    <button class="secondary" id="saveAddress">Confirm address</button>
  `;
}

function questionStep(draft) {
  return `
    <div class="field">
      <label>Upload prescription</label>
      <input type="file" id="questionFile" accept=".pdf,.png,.jpg,.jpeg">
      ${draft.prescriptionName ? `<p class="muted">Attached: ${escapeHtml(draft.prescriptionName)}</p>` : ""}
    </div>
    <div class="field">
      <label>Comment</label>
      <textarea id="questionText" placeholder="Ask anything about this test — the Yello team replies by email.">${escapeHtml(draft.questionText)}</textarea>
    </div>
  `;
}

function bindCheckout() {
  const draft = state.booking;
  document.querySelectorAll(".accordion-head").forEach((button) => {
    button.addEventListener("click", () => {
      draft.step = Number(button.dataset.step);
      renderCheckout();
    });
  });
  document.querySelectorAll("input[name='patientPick']").forEach((input) => {
    input.addEventListener("change", () => {
      draft.patientId = input.value;
      renderCheckout();
    });
  });
  document.querySelector("#savePatient")?.addEventListener("click", () => {
    if (draft.patientId === "new") {
      draft.newPatient = {
        name: value("#newPatientName"),
        age: value("#newPatientAge"),
        gender: value("#newPatientGender")
      };
      if (!draft.newPatient.name || !draft.newPatient.age) {
        showToast("Add the patient name and age.");
        return;
      }
    }
    draft.step = 2;
    renderCheckout();
  });
  document.querySelectorAll("input[name='addressPick']").forEach((input) => {
    input.addEventListener("change", () => {
      draft.addressId = input.value;
      renderCheckout();
    });
  });
  document.querySelector("#saveAddress")?.addEventListener("click", () => {
    if (draft.visitType === "Home collection" && draft.addressId === "new") {
      draft.newAddress = value("#newAddressLine");
      draft.saveAddress = document.querySelector("#saveAddressToggle")?.checked ?? true;
      if (!draft.newAddress) {
        showToast("Add the collection address.");
        return;
      }
    }
    draft.step = 3;
    renderCheckout();
  });
  document.querySelector("#questionFile")?.addEventListener("change", (event) => {
    draft.prescriptionName = event.target.files[0]?.name || "";
  });
  document.querySelector("#questionText")?.addEventListener("input", (event) => {
    draft.questionText = event.target.value;
  });
  document.querySelector("#orderConfirm")?.addEventListener("click", async () => {
    try {
      const patient = draft.patientId === "new"
        ? { name: draft.newPatient.name, age: Number(draft.newPatient.age), gender: draft.newPatient.gender }
        : { id: draft.patientId };
      const payload = {
        consumerId: state.consumer.id,
        labId: draft.labId,
        testId: draft.test.id,
        visitType: draft.visitType,
        appointmentDate: draft.date,
        hour: draft.hour,
        patient
      };
      if (draft.visitType === "Home collection") {
        payload.address = draft.addressId === "new"
          ? draft.newAddress
          : state.consumer.addresses.find((item) => item.id === draft.addressId)?.line;
        payload.saveAddress = draft.addressId === "new" && draft.saveAddress;
      }
      if (draft.questionText || draft.prescriptionName) {
        payload.question = { text: draft.questionText || "Prescription attached.", prescriptionName: draft.prescriptionName || null };
      }
      state.lastBooking = await api.post("/api/bookings", payload);
      await refreshConsumer();
      navigate("payment");
    } catch (error) {
      showToast(error.message);
    }
  });
}

/* ---------- payment (wireframe: Payment gateway) ---------- */

function renderPayment() {
  const booking = state.lastBooking;
  if (!booking) return renderBrowse();
  layout(`
    <section class="section">
      <div class="hero-panel login-card payment-card">
        <p class="eyebrow">Payments · Razorpay sandbox</p>
        <h2>Pay for your booking</h2>
        <p class="muted">${escapeHtml(booking.testName)} at ${escapeHtml(booking.labName)}<br>${escapeHtml(booking.appointmentDate)} · ${escapeHtml(booking.slotLabel)}</p>
        <div class="field"><label>Email</label><input id="payEmail" value="${escapeAttr(state.consumer?.email || "")}"></div>
        <div class="field"><label>Card number</label><input value="4111 1111 1111 1111" readonly></div>
        <div class="form-grid">
          <div class="field"><label>Expiry</label><input value="08/28" readonly></div>
          <div class="field"><label>CVV</label><input value="123" readonly></div>
        </div>
        <div class="price right">
          <span class="muted strike">${money(booking.originalPrice)}</span>
          <strong>${money(booking.finalPrice)}</strong>
        </div>
        <button class="primary full big" id="payNow">Pay ${money(booking.finalPrice)}</button>
        <button class="ghost full" id="payFail">Simulate payment failure</button>
      </div>
    </section>
  `);
  document.querySelector("#payNow")?.addEventListener("click", async () => {
    state.lastBooking = await api.post("/api/payments", { bookingId: state.lastBooking.id, outcome: "success" });
    await refreshConsumer();
    navigate("success");
  });
  document.querySelector("#payFail")?.addEventListener("click", async () => {
    state.lastBooking = await api.post("/api/payments", { bookingId: state.lastBooking.id, outcome: "failure" });
    showToast("Payment failed (simulated). Retry to confirm the slot.");
  });
}

/* ---------- success (wireframe: Booking Successful) ---------- */

function renderSuccess() {
  const booking = state.lastBooking;
  if (!booking) return renderBrowse();
  const lab = state.currentLab && state.currentLab.id === booking.labId ? state.currentLab : null;
  const upsell = lab ? lab.tests.filter((test) => test.id !== booking.testId).slice(0, 2) : [];
  layout(`
    <section class="section success">
      <h1 class="center">Booking Successful</h1>
      <div class="panel summary-card">
        <h2>${escapeHtml(booking.labName)}</h2>
        <p class="lead">${escapeHtml(booking.testName)}</p>
        <p class="pill brand-pill">${booking.visitType === "Home collection" ? "For Home Sample Collection" : "Lab visit appointment"}</p>
        <div class="summary-grid">
          <p><span class="muted">Patient</span><br><strong>${escapeHtml(booking.patient.name)} · ${booking.patient.age} · ${booking.patient.gender}</strong></p>
          <p><span class="muted">${booking.visitType === "Home collection" ? "Collection address" : "Lab address"}</span><br><strong>${escapeHtml(booking.address)}</strong></p>
          <p><span class="muted">Appointment</span><br><strong>${escapeHtml(booking.appointmentDate)} · ${escapeHtml(booking.slotLabel)}</strong></p>
          <p><span class="muted">Reference</span><br><strong>${escapeHtml(booking.id)}</strong></p>
        </div>
        <div class="price right">
          <span class="muted strike">${money(booking.originalPrice)}</span>
          <strong>${money(booking.finalPrice)}</strong>
        </div>
        <p class="muted">The exact test date and time will be communicated to you via SMS and email. Show the confirmation email or SMS at the lab as your reference.</p>
      </div>
      ${booking.question ? `
        <div class="panel">
          <h3>Your question reached the Yello team</h3>
          <p class="muted">“${escapeHtml(booking.question.text)}”${booking.question.prescriptionName ? ` · Attachment: ${escapeHtml(booking.question.prescriptionName)}` : ""}</p>
          <p class="muted">You will receive the response by email.</p>
        </div>
      ` : ""}
      ${upsell.length ? `
        <div class="section-head"><div><p class="eyebrow">Frequent tests</p><h2>People also book</h2></div></div>
        <div class="two-col">
          ${upsell.map((test) => `
            <div class="panel">
              <h3>${escapeHtml(test.name)}</h3>
              <p class="muted">${escapeHtml(test.description)}</p>
              <div class="inline">
                <strong>${money(test.bestPrice)}</strong>
                <button class="secondary" data-open-lab="${booking.labId}" data-test-id="${test.id}">+ Add test</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="center">
        <button class="ghost" data-route="home">Back to home</button>
        <button class="primary" data-route="account">View my bookings</button>
      </div>
    </section>
  `);
}

/* ---------- account ---------- */

// Collect completed reports for a given patient (or all household), oldest→newest.
function reportsFor(patientId) {
  return state.bookings
    .filter((b) => b.report && b.report.markers && (!patientId || b.patient?.id === patientId))
    .sort((a, b) => (a.appointmentDate < b.appointmentDate ? -1 : 1));
}

// Build per-marker trajectories across a patient's reports.
function trajectories(patientId) {
  const reports = reportsFor(patientId);
  const byKey = {};
  reports.forEach((b) => {
    b.report.markers.forEach((m) => {
      (byKey[m.key] = byKey[m.key] || { name: m.name, unit: m.unit, higherIsWorse: m.higherIsWorse, low: m.low, high: m.high, points: [] })
        .points.push({ date: b.appointmentDate, value: m.value, status: m.status, plain: m.plain });
    });
  });
  return byKey;
}

function trendSparkline(points, low, high, higherIsWorse) {
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals, low), max = Math.max(...vals, high);
  const range = max - min || 1;
  const w = 132, h = 40, pad = 4;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const y = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
  const limitY = y(high);
  const pts = points.map((p, i) => `${pad + i * step},${y(p.value)}`).join(" ");
  const last = points[points.length - 1];
  const bad = last.status !== "optimal";
  return `
    <svg class="traj-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <line x1="0" y1="${limitY.toFixed(1)}" x2="${w}" y2="${limitY.toFixed(1)}" class="traj-limit"/>
      <polyline points="${pts}" class="traj-line ${bad ? "bad" : "ok"}"/>
      ${points.map((p, i) => `<circle cx="${(pad + i * step).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${i === points.length - 1 ? 3.4 : 2.2}" class="traj-dot ${p.status !== "optimal" ? "bad" : "ok"}"/>`).join("")}
    </svg>`;
}

// Organ map: each organ, the markers that drive its health, and — when we
// can't yet see it — the Tier-B scan that will light it up (from the blueprint).
const TWIN_ORGANS = [
  { key: "brain",    name: "Brain",              markers: [],              awaiting: "Brain MRI + volumetrics" },
  { key: "thyroid",  name: "Thyroid",            markers: ["tsh"] },
  { key: "lungs",    name: "Lungs",              markers: [],              awaiting: "Spirometry · HRCT" },
  { key: "heart",    name: "Heart & arteries",   markers: ["ldl", "apob", "crp"] },
  { key: "liver",    name: "Liver",              markers: [],              awaiting: "FibroScan elastography" },
  { key: "pancreas", name: "Metabolic · pancreas", markers: ["hba1c"] },
  { key: "kidneys",  name: "Kidneys",            markers: [],              awaiting: "Renal function panel" },
  { key: "skeleton", name: "Bone & blood",       markers: ["vitd", "hb"] }
];

const STATUS_RANK = { optimal: 0, watch: 1, low: 2, high: 2 };

function organStatus(organ, traj) {
  const present = organ.markers.map((k) => traj[k]).filter(Boolean);
  if (!present.length) return "awaiting";
  let worst = "optimal";
  present.forEach((t) => {
    const s = t.points[t.points.length - 1].status;
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  });
  return worst === "low" || worst === "high" ? "flag" : worst;
}

// Anatomical body figure. Organs coloured by status; selected organ glows.
function bodyTwinSvg(traj, selectedKey) {
  const statusOf = {};
  TWIN_ORGANS.forEach((o) => (statusOf[o.key] = organStatus(o, traj)));
  const shapes = {
    brain: `<path d="M108,26 q-8,-9 4,-13 q14,-6 24,1 q12,0 8,12 q4,9 -6,12 q-11,7 -24,1 q-11,-2 -6,-13 z"/><path class="accent" d="M120,15 v26 M112,20 q6,4 0,9 M128,20 q-6,4 0,9"/>`,
    thyroid: `<path d="M112,84 q-7,3 -5,10 q4,6 8,3 q3,-3 2,-9 z"/><path d="M128,84 q7,3 5,10 q-4,6 -8,3 q-3,-3 -2,-9 z"/><rect x="117" y="86" width="6" height="7" rx="2"/>`,
    lungs: `<path d="M104,120 q-16,4 -16,26 q0,20 8,30 q9,4 10,-8 q2,-30 -2,-48 z"/><path d="M136,120 q16,4 16,26 q0,20 -8,30 q-9,4 -10,-8 q-2,-30 2,-48 z"/>`,
    heart: `<path d="M120,132 q-10,-12 -20,-4 q-9,8 -1,20 q7,11 21,20 q14,-9 21,-20 q8,-12 -1,-20 q-10,-8 -20,4 z"/>`,
    liver: `<path d="M92,182 q34,-8 52,-2 q4,10 -6,20 q-24,10 -44,4 q-8,-12 -2,-22 z"/>`,
    pancreas: `<path d="M104,214 q22,-6 40,-2 q4,4 -2,8 q-20,-2 -38,4 q-4,-4 0,-10 z"/>`,
    kidneys: `<path d="M96,224 q-9,2 -9,14 q0,12 9,13 q7,0 6,-13 q0,-13 -6,-14 z"/><path d="M144,224 q9,2 9,14 q0,12 -9,13 q-7,0 -6,-13 q0,-13 6,-14 z"/>`,
    skeleton: `<path d="M100,280 q20,10 40,0 q3,18 -8,30 q-12,6 -24,0 q-11,-12 -8,-30 z"/><rect x="110" y="312" width="7" height="90" rx="3"/><rect x="123" y="312" width="7" height="90" rx="3"/>`
  };
  const label = { brain: [120, 40], thyroid: [155, 88], lungs: [70, 150], heart: [120, 152], liver: [66, 196], pancreas: [170, 214], kidneys: [172, 238], skeleton: [162, 320] };
  return `
    <svg class="twin-body" viewBox="0 0 240 470" role="img" aria-label="Your health twin — a body with each organ coloured by health">
      <defs>
        <clipPath id="bodyClip"><path d="M120,8 q18,0 20,20 q0,14 -6,20 q14,4 26,10 q10,6 10,20 l-4,60 q-2,10 -8,10 q0,40 -6,80 q8,60 4,120 q-2,20 -14,20 q-8,0 -10,-16 q-2,-40 -6,-70 q-4,30 -6,70 q-2,16 -10,16 q-12,0 -14,-20 q-4,-60 4,-120 q-6,-40 -6,-80 q-6,0 -8,-10 l-4,-60 q0,-14 10,-20 q12,-6 26,-10 q-6,-6 -6,-20 q2,-20 20,-20 z"/></clipPath>
      </defs>
      <path class="twin-silhouette" d="M120,8 q18,0 20,20 q0,14 -6,20 q14,4 26,10 q10,6 10,20 l-4,60 q-2,10 -8,10 q0,40 -6,80 q8,60 4,120 q-2,20 -14,20 q-8,0 -10,-16 q-2,-40 -6,-70 q-4,30 -6,70 q-2,16 -10,16 q-12,0 -14,-20 q-4,-60 4,-120 q-6,-40 -6,-80 q-6,0 -8,-10 l-4,-60 q0,-14 10,-20 q12,-6 26,-10 q-6,-6 -6,-20 q2,-20 20,-20 z"/>
      <g clip-path="url(#bodyClip)"><rect class="scan-sweep" x="0" y="0" width="240" height="34"/></g>
      ${TWIN_ORGANS.map((o) => `
        <g class="organ s-${statusOf[o.key]} ${o.key === selectedKey ? "selected" : ""}" data-organ="${o.key}">
          <title>${escapeAttr(o.name)} — ${statusOf[o.key] === "awaiting" ? "awaiting calibration" : statusOf[o.key]}</title>
          ${shapes[o.key]}
        </g>`).join("")}
      ${TWIN_ORGANS.filter((o) => o.key === selectedKey).map((o) => {
        const [lx, ly] = label[o.key];
        return `<g class="organ-flag" pointer-events="none"><circle cx="${lx}" cy="${ly}" r="3"/></g>`;
      }).join("")}
    </svg>`;
}

function organDetail(organ, traj) {
  const status = organStatus(organ, traj);
  if (status === "awaiting") {
    return `
      <div class="organ-detail">
        <div class="organ-detail-head"><h4>${escapeHtml(organ.name)}</h4><span class="organ-pill s-awaiting">not yet calibrated</span></div>
        <p class="organ-await">This organ lights up when its scan is on your record. On Yello that means <strong>${escapeHtml(organ.awaiting)}</strong> — part of the deeper twin we build as you go. For now it stays outlined, waiting for its first reading.</p>
        <button class="ghost small" data-route="browse">Explore scans</button>
      </div>`;
  }
  const present = organ.markers.map((k) => traj[k]).filter(Boolean);
  return `
    <div class="organ-detail">
      <div class="organ-detail-head"><h4>${escapeHtml(organ.name)}</h4><span class="organ-pill s-${status}">${status === "flag" ? "needs attention" : status === "watch" ? "watch" : "healthy"}</span></div>
      ${present.map((t) => {
        const last = t.points[t.points.length - 1];
        const first = t.points[0];
        const worsening = t.points.length > 1 && ((t.higherIsWorse && last.value > first.value) || (!t.higherIsWorse && last.value < first.value));
        return `
          <div class="organ-marker">
            <div class="traj-head"><span class="traj-name">${escapeHtml(t.name)}</span><span class="traj-now">${last.value}<i>${escapeHtml(t.unit)}</i></span></div>
            ${trendSparkline(t.points, t.low, t.high, t.higherIsWorse)}
            <span class="traj-status s-${last.status}">${last.status === "optimal" ? "in range" : last.status}${t.points.length > 1 ? ` · ${worsening ? "drifting" : "improving"}` : ""}</span>
            ${last.status !== "optimal" ? `<p class="organ-plain">${escapeHtml(last.plain || "")}</p>` : ""}
          </div>`;
      }).join("")}
    </div>`;
}

function twinPanel(paidBookings) {
  const events = paidBookings.slice().sort((a, b) => (a.appointmentDate < b.appointmentDate ? -1 : 1));
  const members = state.consumer?.patients || [];
  // Default to whichever member has the richest history.
  const withHistory = members.map((p) => ({ p, n: reportsFor(p.id).length })).sort((a, b) => b.n - a.n);
  const focus = (state.twinFocus && members.find((m) => m.id === state.twinFocus)) || withHistory[0]?.p || members[0];
  const traj = focus ? trajectories(focus.id) : {};
  const trajKeys = Object.keys(traj);
  const focusReports = focus ? reportsFor(focus.id) : [];
  const resolution = Math.min(12 + events.length * 13, 90);

  return `
    <div class="twin-panel">
      <div class="twin-panel-head">
        <div>
          <p class="twin-tag">Your health twin</p>
          <h3>${events.length ? `Calibrated by ${events.length} test${events.length > 1 ? "s" : ""}` : "Waiting for its first calibration"}</h3>
          <p class="twin-sub">Every test is a calibration event — it adds a point, updates your trends, and sharpens the picture. <a href="/about#twin">How your twin works</a></p>
        </div>
        <div class="twin-res">
          <span class="twin-res-num">${events.length ? `${resolution}%` : "0%"}</span>
          <span class="twin-res-label">resolution</span>
        </div>
      </div>

      ${members.length > 1 ? `
        <div class="twin-switch">
          ${members.map((m) => `<button class="twin-member ${focus && m.id === focus.id ? "active" : ""}" data-twin-focus="${m.id}">${escapeHtml(m.name.split(" ")[0])} · ${reportsFor(m.id).length}</button>`).join("")}
        </div>` : ""}

      ${trajKeys.length ? (() => {
        // Pick the most severe lit organ as the default selection.
        const ranked = TWIN_ORGANS
          .map((o) => ({ o, s: organStatus(o, traj) }))
          .filter((x) => x.s !== "awaiting");
        const sevScore = { flag: 3, watch: 2, optimal: 1 };
        ranked.sort((a, b) => (sevScore[b.s] || 0) - (sevScore[a.s] || 0));
        const selectedKey = (state.twinOrgan && TWIN_ORGANS.find((o) => o.key === state.twinOrgan)) ? state.twinOrgan : (ranked[0]?.o.key || "heart");
        const selectedOrgan = TWIN_ORGANS.find((o) => o.key === selectedKey);
        const litCount = TWIN_ORGANS.filter((o) => organStatus(o, traj) !== "awaiting").length;
        return `
        <div class="twin-body-layout">
          <div class="twin-body-stage">
            ${bodyTwinSvg(traj, selectedKey)}
            <p class="twin-body-legend">
              <span class="lg s-optimal">healthy</span>
              <span class="lg s-watch">watch</span>
              <span class="lg s-flag">attention</span>
              <span class="lg s-awaiting">awaiting scan</span>
            </p>
            <p class="twin-body-note">${litCount} of ${TWIN_ORGANS.length} systems calibrated · tap an organ</p>
          </div>
          <div class="twin-body-detail">
            ${organDetail(selectedOrgan, traj)}
            ${focusReports.length ? `<a class="twin-latest" data-open-report="${focusReports[focusReports.length - 1].id}">Read the full report in plain language →</a>` : ""}
          </div>
        </div>`;
      })() : events.length ? `
        <p class="twin-empty">Your tests are booked — the twin sharpens the moment your first report is filed. Trends appear once you have two.</p>
      ` : `
        <p class="twin-empty">Your first booking becomes your baseline — the first outline of a picture you'll keep for life.</p>
      `}
    </div>
  `;
}

function renderReport() {
  const booking = state.bookings.find((b) => b.id === state.viewReport);
  if (!booking || !booking.report) { navigate("account"); return; }
  const r = booking.report;
  const groups = {};
  r.markers.forEach((m) => { (groups[m.group] = groups[m.group] || []).push(m); });
  const flagged = r.markers.filter((m) => m.status !== "optimal");
  layout(`
    <section class="section report-view">
      <button class="ghost small" data-route="account">← Back to account</button>
      <div class="report-hero">
        <p class="twin-tag">Your report — explained</p>
        <h1>${escapeHtml(booking.testName)}</h1>
        <p class="report-meta">${escapeHtml(booking.patient?.name || "")} · ${escapeHtml(booking.appointmentDate)} · ${escapeHtml(booking.labName)}</p>
        <p class="report-summary">${escapeHtml(r.summary)}</p>
        <div class="report-actions">
          <span class="report-file">📄 ${escapeHtml(booking.reportName || "report.pdf")} — the lab PDF is here if you need it</span>
        </div>
      </div>

      ${flagged.length ? `
        <div class="report-flags">
          <p class="twin-tag">Worth your attention</p>
          ${flagged.map((m) => markerRow(m, true)).join("")}
        </div>` : ""}

      ${Object.entries(groups).map(([group, markers]) => `
        <div class="report-group">
          <h3>${escapeHtml(group)}</h3>
          ${markers.map((m) => markerRow(m, false)).join("")}
        </div>
      `).join("")}

      <div class="report-footer panel">
        <h3>Talk it through</h3>
        <p class="muted">Every booking includes a free doctor consult. Book one against this test to walk through anything above.</p>
        <button class="primary" data-route="account">Book my consult</button>
      </div>
    </section>
  `);
  bindCommon();
  document.querySelectorAll("[data-open-report]").forEach((el) => el.addEventListener("click", () => openReport(el.dataset.openReport)));
}

function markerRow(m, expanded) {
  const pct = Math.max(0, Math.min(100, ((m.value - m.low) / ((m.high - m.low) || 1)) * 100));
  return `
    <div class="marker-row ${m.status !== "optimal" ? "flag" : ""}">
      <div class="marker-top">
        <span class="marker-name">${escapeHtml(m.name)}</span>
        <span class="marker-val s-${m.status}">${m.value} <i>${escapeHtml(m.unit)}</i></span>
      </div>
      <div class="marker-bar">
        <span class="marker-range" style="left:0;right:0"></span>
        <span class="marker-here s-${m.status}" style="left:${pct.toFixed(0)}%"></span>
      </div>
      <div class="marker-scale"><span>${m.low}</span><span class="marker-status s-${m.status}">${m.status === "optimal" ? "in range" : m.status}</span><span>${m.high}</span></div>
      ${expanded || m.status !== "optimal" ? `<p class="marker-plain">${escapeHtml(m.plain)}</p>` : ""}
    </div>`;
}

function openReport(bookingId) {
  state.viewReport = bookingId;
  navigate("report");
}

function renderAccount() {
  if (!state.consumer) {
    state.auth.next = "account";
    return renderLogin();
  }
  const paid = state.bookings.filter((booking) => booking.paymentStatus === "paid");
  const moneySaved = paid.reduce((sum, booking) => sum + (booking.originalPrice - booking.finalPrice), 0);
  const upcoming = paid.filter((booking) => booking.status !== "completed");
  layout(`
    <section class="section portal-grid">
      <aside class="panel">
        <p class="eyebrow">Profile</p>
        <h2>${escapeHtml(state.consumer.name)}</h2>
        <p class="muted">${escapeHtml(state.consumer.email)}<br>${escapeHtml(state.consumer.mobile)}</p>
        <div class="stat slim"><span class="muted">Money saved with Yello</span><strong>${money(moneySaved)}</strong></div>
        <h3>Patients</h3>
        ${state.consumer.patients.map((patient) => `<p>${escapeHtml(patient.name)} <span class="muted">${patient.age}, ${patient.gender}</span></p>`).join("") || `<p class="muted">No patients yet.</p>`}
        <h3>Addresses</h3>
        ${state.consumer.addresses.map((address) => `<p><strong>${escapeHtml(address.label)}</strong><br><span class="muted">${escapeHtml(address.line)}</span></p>`).join("") || `<p class="muted">No saved addresses.</p>`}
        <button class="ghost" id="logout">Logout</button>
      </aside>
      <div>
        ${twinPanel(paid)}
        <div class="section-head">
          <div>
            <p class="eyebrow">Bookings</p>
            <h2>Upcoming and completed</h2>
          </div>
        </div>
        <div class="booking-list">${state.bookings.map(bookingCard).join("") || `<div class="empty">No bookings yet.</div>`}</div>
        <div class="panel">
          <h3>Free doctor consultation</h3>
          <p class="muted">Every paid test booking unlocks a free chat or tele consultation.</p>
          <div class="form-grid">
            <div class="field">
              <label>Booking</label>
              <select id="consultBooking">
                ${upcoming.map((booking) => `<option value="${booking.id}">${escapeHtml(booking.testName)} | ${booking.appointmentDate}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Doctor</label>
              <select id="doctorId">
                ${state.doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)} | ${escapeHtml(doctor.specialty)}${doctor.zoomConnected ? "" : " (chat only)"}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Type</label>
              <select id="consultType"><option>Chat</option><option>Tele</option></select>
            </div>
            <div class="field">
              <label>Slot</label>
              <input id="consultSlot" value="${new Date(Date.now() + 172800000).toISOString().slice(0, 10)} 18:00">
            </div>
          </div>
          <button class="secondary" id="confirmConsult" ${upcoming.length ? "" : "disabled"}>Confirm consultation</button>
        </div>
        <div class="panel">
          <h3>Your consultations</h3>
          ${state.consultations.length ? state.consultations.map((consultation) => `
            <div class="question-row">
              <p><strong>${escapeHtml(consultation.doctorName)}</strong> · ${escapeHtml(consultation.type)} · ${escapeHtml(consultation.slot)} <span class="pill">${escapeHtml(consultation.status)}</span></p>
              <p class="muted">${escapeHtml(consultation.testName)} for ${escapeHtml(consultation.patientName)} · ${consultation.durationMinutes} min</p>
              ${consultation.type === "Chat"
                ? `<button class="secondary" data-open-chat="${consultation.id}">Open chat</button>`
                : `<a class="secondary button-link" href="${escapeAttr(consultation.zoomLink || "#")}" target="_blank" rel="noreferrer">Join Zoom</a>`}
            </div>
          `).join("") : `<p class="muted">No consultations yet. Book one against a paid test above.</p>`}
        </div>
      </div>
    </section>
  `);
  bindAccount();
}

function openChatModal(consultation) {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const renderMessages = (chat) => chat.messages.map((message) => `
    <div class="chat-bubble ${message.from === "consumer" ? "mine" : ""}">
      <p>${escapeHtml(message.text)}${message.fileName ? `<br>📎 ${escapeHtml(message.fileName)}` : ""}</p>
      <span class="muted small">${escapeHtml(message.from)} · ${new Date(message.sentAt).toLocaleTimeString()}</span>
    </div>
  `).join("") || `<p class="muted">No messages yet. The timer starts when the doctor replies.</p>`;
  backdrop.innerHTML = `
    <div class="modal panel chat-window">
      <div class="section-head">
        <div>
          <h3>Chat with ${escapeHtml(consultation.doctorName)}</h3>
          <p class="muted">${consultation.durationMinutes} minute consultation</p>
        </div>
        <button class="ghost" id="chatClose">Close</button>
      </div>
      <div class="chat-messages" id="consumerChatMessages">${renderMessages(consultation)}</div>
      <div class="inline chat-input">
        <input id="consumerChatText" placeholder="Type a message">
        <input type="file" id="consumerChatFile" class="chat-file">
        <button class="primary" id="consumerChatSend">Send</button>
      </div>
    </div>
  `;
  document.body.append(backdrop);
  backdrop.querySelector("#chatClose").addEventListener("click", () => backdrop.remove());
  const send = async () => {
    const text = backdrop.querySelector("#consumerChatText").value.trim();
    const file = backdrop.querySelector("#consumerChatFile").files[0];
    if (!text && !file) return;
    try {
      const updated = await api.post(`/api/consultations/${consultation.id}/messages`, {
        from: "consumer",
        text: text || "Shared a file.",
        fileName: file?.name || null
      });
      backdrop.querySelector("#consumerChatMessages").innerHTML = renderMessages(updated);
      backdrop.querySelector("#consumerChatText").value = "";
      backdrop.querySelector("#consumerChatMessages").scrollTop = 1e6;
    } catch (error) {
      showToast(error.message);
    }
  };
  backdrop.querySelector("#consumerChatSend").addEventListener("click", send);
  backdrop.querySelector("#consumerChatText").addEventListener("keydown", (event) => {
    if (event.key === "Enter") send();
  });
}

function bookingCard(booking) {
  return `
    <article class="booking-card">
      <div class="meta">
        <span class="pill">${escapeHtml(booking.status)}</span>
        <span class="pill ${booking.paymentStatus === "paid" ? "" : "warn-pill"}">${escapeHtml(booking.paymentStatus)}</span>
        <span class="pill">${escapeHtml(booking.visitType)}</span>
      </div>
      <h3>${escapeHtml(booking.testName)}</h3>
      <p class="muted">${escapeHtml(booking.labName)} | ${escapeHtml(booking.patient.name)} | ${booking.appointmentDate} ${escapeHtml(booking.slotLabel)}</p>
      ${booking.report ? `<button class="report-ready-btn" data-open-report="${booking.id}">📄 Report ready — read it in plain language →</button>` : booking.reportName ? `<p class="report-ready">📄 Report ready: ${escapeHtml(booking.reportName)}</p>` : ""}
      ${booking.question ? `
        <p class="muted">Q: ${escapeHtml(booking.question.text)}<br>${booking.question.response ? `A: ${escapeHtml(booking.question.response)}` : "Awaiting response from the Yello team."}</p>
      ` : ""}
      <div class="inline">
        <strong>${money(booking.finalPrice)}</strong>
        ${booking.paymentStatus !== "paid" ? `<button class="primary" data-pay="${booking.id}">Pay now</button>` : `<span class="muted small">To reschedule, contact Yello support — our team moves the slot for you.</span>`}
      </div>
    </article>
  `;
}

function bindAccount() {
  document.querySelector("#logout")?.addEventListener("click", () => {
    state.consumer = null;
    state.bookings = [];
    navigate("home");
  });
  document.querySelectorAll("[data-twin-focus]").forEach((btn) => btn.addEventListener("click", () => {
    state.twinFocus = btn.dataset.twinFocus;
    renderAccount();
  }));
  document.querySelectorAll("[data-open-report]").forEach((btn) => btn.addEventListener("click", () => openReport(btn.dataset.openReport)));
  document.querySelectorAll("[data-organ]").forEach((g) => g.addEventListener("click", () => {
    state.twinOrgan = g.dataset.organ;
    renderAccount();
  }));
  document.querySelector("#confirmConsult")?.addEventListener("click", async () => {
    try {
      const consultation = await api.post("/api/consultations", {
        consumerId: state.consumer.id,
        bookingId: value("#consultBooking"),
        doctorId: value("#doctorId"),
        type: value("#consultType"),
        slot: value("#consultSlot")
      });
      await loadBookings();
      showToast(`Consultation confirmed with ${consultation.doctorName}`);
      renderAccount();
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelectorAll("[data-pay]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.lastBooking = state.bookings.find((item) => item.id === button.dataset.pay);
      navigate("payment");
    });
  });
  document.querySelectorAll("[data-open-chat]").forEach((button) => {
    button.addEventListener("click", async () => {
      const consultation = await api.get(`/api/consultations/${button.dataset.openChat}`);
      openChatModal(consultation);
    });
  });
}

/* ---------- popular packages + static pages ---------- */

function renderPackages() {
  layout(`
    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Popular Packages</p>
          <h2>Yello packages across all labs</h2>
        </div>
      </div>
      <div class="cards">${state.packages.map(packageCard).join("")}</div>
    </section>
  `);
}

function renderHow() {
  layout(`
    <section class="section journey-head">
      <p class="eyebrow">How Yello works</p>
      <h1>From "I should get checked"<br>to a picture of you that lasts.</h1>
      <p class="muted journey-lede">Five stations. The first four take about a day. The fifth keeps compounding for life.</p>
    </section>

    <section class="journey">

      <article class="station">
        <div class="station-copy">
          <p class="station-no">Station 01</p>
          <h2>Choose a check or program</h2>
          <p class="muted">A one-off test when you need one — or a program that decides <em>what</em> to check and <em>when</em>, from your age, history and family pattern. You stop deciding "which test"; the program carries you.</p>
        </div>
        <div class="station-art">
          <div class="art-program">
            <div class="art-package">
              <span class="art-ribbon"></span>
              <strong>Full Body Health Checkup</strong>
              <span class="muted-line">60 markers · annual</span>
            </div>
            <div class="art-family">
              <span class="member-chip">You</span>
              <span class="member-chip">Amma</span>
              <span class="member-chip">Ravi</span>
            </div>
          </div>
        </div>
      </article>

      <article class="station flip">
        <div class="station-copy">
          <p class="station-no">Station 02</p>
          <h2>Pick a time that suits</h2>
          <p class="muted">Quieter Yello hours carry a gentler price — same machines, same doctors, no crowd. The calendar shows it honestly; you choose the trade.</p>
        </div>
        <div class="station-art">
          <div class="art-slots">
            <span class="slot-chip t1">7:00 AM</span>
            <span class="slot-chip t2">9:00 AM</span>
            <span class="slot-chip t3">3:00 PM<i>quietest</i></span>
            <span class="slot-chip t1">6:00 PM</span>
          </div>
        </div>
      </article>

      <article class="station">
        <div class="station-copy">
          <p class="station-no">Station 03</p>
          <h2>Home or centre — your call</h2>
          <p class="muted">A phlebotomist at your door for bloods, or a calm visit to an accredited centre for scans. No counters, no queues either way.</p>
        </div>
        <div class="station-art">
          <div class="art-visit">
            <div class="visit-opt">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9"/></svg>
              <span>We come to you</span>
            </div>
            <span class="visit-or">or</span>
            <div class="visit-opt">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V6.5L12 3l8 3.5V20M4 20h16M9 20v-5h6v5M9 9h.01M15 9h.01M12 12h.01"/></svg>
              <span>A centre nearby</span>
            </div>
          </div>
        </div>
      </article>

      <article class="station flip">
        <div class="station-copy">
          <p class="station-no">Station 04</p>
          <h2>An answer, not a PDF</h2>
          <p class="muted">Every result rebuilt in plain language — what changed since last time, what it means, what to do. A free doctor consult comes with every booking to talk it through. No red number ever reaches you alone.</p>
        </div>
        <div class="station-art">
          <div class="art-report">
            <div class="report-row">
              <span>Vitamin D</span>
              <strong class="warn">19 ng/mL</strong>
            </div>
            <p class="report-plain">Low — common after monsoon months. Fixable in 8–12 weeks; here's how, and we'll re-check in your next visit.</p>
            <span class="report-consult">Dr. Meera · free consult included</span>
          </div>
        </div>
      </article>

      <article class="station twin-station">
        <div class="station-copy">
          <p class="station-no">Station 05 · Forever</p>
          <h2>Your health twin sharpens</h2>
          <p class="muted">Every test is a calibration event. Points become trends, trends become a living picture of you — one per family member, compared against your own baseline, kept for life. <a href="/about#twin">How the twin works</a></p>
        </div>
        <div class="station-art">
          <div class="art-twin">
            <p class="twin-tag">Your health twin</p>
            <div class="art-cal">
              <span class="cal-dot on"></span><span class="cal-track"></span>
              <span class="cal-dot on"></span><span class="cal-track"></span>
              <span class="cal-dot on"></span><span class="cal-track dim"></span>
              <span class="cal-dot next"></span>
            </div>
            <div class="art-cal-labels"><span>Baseline</span><span>+6 mo</span><span>+1 yr</span><span>Next</span></div>
            <div class="art-spark"><i style="height:34%"></i><i style="height:46%"></i><i style="height:41%"></i><i style="height:58%"></i><i style="height:66%"></i><i class="hi" style="height:80%"></i></div>
            <span class="art-res">resolution <strong>62%</strong> and rising</span>
          </div>
        </div>
      </article>

    </section>

    <section class="section journey-cta">
      <div class="panel center-panel">
        <h2>The whole journey starts with one booking.</h2>
        <div class="inline center">
          <button class="primary" data-route="browse">Book a health check</button>
          <button class="ghost" data-route="packages">See programs</button>
        </div>
      </div>
    </section>
  `);
}

function renderContact() {
  layout(`
    <section class="section journey-head">
      <p class="eyebrow">Contact us</p>
      <h1>A human, within the day.</h1>
      <p class="muted journey-lede">Health questions shouldn't sit in a queue. Call or write — a Yello person (not a bot) gets back to you within the day, usually much sooner.</p>
    </section>

    <section class="contact-grid">
      <div class="contact-channels">
        <a class="channel" href="tel:${CONTACT.tel}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>
          <div>
            <strong>Call us</strong>
            <span>${CONTACT.label}</span>
          </div>
        </a>
        <a class="channel" href="https://wa.me/${CONTACT.wa}" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.8 9.2c.3 2.7 3.3 5.7 6 6l1.4-1.4-2-1.3-1 .7c-.8-.4-1.9-1.5-2.3-2.3l.7-1-1.3-2-1.5 1.3Z"/></svg>
          <div>
            <strong>WhatsApp</strong>
            <span>Fastest for reschedules & report questions</span>
          </div>
        </a>
        ${PUBLIC ? "" : `<a class="channel" href="mailto:hello@yello.health">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          <div>
            <strong>hello@yello.health</strong>
            <span>For anything longer — replies within the day</span>
          </div>
        </a>`}
        <div class="channel still">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <div>
            <strong>Hyderabad, Telangana</strong>
            <span>Home collection across Hyderabad</span>
          </div>
        </div>
        <div class="contact-note">
          <strong>Need to reschedule?</strong>
          <p class="muted">Just WhatsApp or call — our team moves the slot for you. No forms, no cancellation maze.</p>
        </div>
      </div>

      <div class="panel contact-form">
        <h3>Write to us</h3>
        <div class="field"><label>What's this about?</label>
          <select id="contactTopic">
            <option>A booking or reschedule</option>
            <option>Understanding my report</option>
            <option>Programs & pricing</option>
            <option>Partnering with Yello (centres)</option>
            <option>Something else</option>
          </select>
        </div>
        <div class="field"><label>Your email or mobile</label><input id="contactEmail" placeholder="you@example.com or 98xxxxxx"></div>
        <div class="field"><label>Message</label><textarea id="contactMessage" rows="5" placeholder="Tell us what you need — a real person reads this."></textarea></div>
        <button class="primary" id="contactSend">Send message</button>
        <p class="muted contact-promise">You'll hear back within the day. Nothing you write here goes into marketing lists — DPDP 2023 applies to messages too.</p>
      </div>
    </section>
  `);
  document.querySelector("#contactSend")?.addEventListener("click", async () => {
    const email = value("#contactEmail");
    const message = value("#contactMessage");
    const topic = value("#contactTopic");
    if (!email || !message) {
      showToast("Add your email and a message.");
      return;
    }
    if (PUBLIC) {
      try { await sendLead("contact", { topic, contact: email, message }); } catch { leadFailed(); return; }
      document.querySelector("#contactMessage").value = "";
      showToast("Message sent. A Yello person will get back to you.");
      return;
    }
    await api.post("/api/prescriptions", { mobile: email, fileName: "contact-form", note: `[${topic}] ${message}` });
    showToast("Message sent. A Yello person will reply within the day.");
  });
}

const STATIC_PAGES = {
  terms: {
    title: "Terms and conditions",
    eyebrow: "Policies",
    body: `<p class="muted">Prototype terms: bookings made on this demo are not real medical appointments. Slot discounts, prices, labs, and doctors are sample data used to validate the Yello functional specification.</p>`
  },
  privacy: {
    title: "Privacy policy",
    eyebrow: "Policies",
    body: `<p class="muted">Prototype privacy note: all data lives in memory on your machine and disappears when the server restarts. The production build must comply with India's Digital Personal Data Protection Act, 2023 (DPDP) for every operation that touches personal data, and keep records ABHA/ABDM-compatible.</p>`
  },
  disclaimer: {
    title: "Disclaimer",
    eyebrow: "Policies",
    body: `<p class="muted">Yello is an aggregator and does not itself perform diagnostic tests or medical consultations. Test results and doctor advice come from the partner labs and doctors listed on the platform.</p>`
  }
};

const PUBLIC_PAGES = {
  terms: {
    title: "Terms and conditions",
    eyebrow: "Policies",
    body: `<p class="muted">Requests made on yello.health are not confirmed appointments. A Yello person calls you to confirm the time, the partner centre and the final price; nothing is booked or charged until you agree on that call. Prices shown online are indicative. Tests are performed and reported at accredited partner centres by registered professionals. The full terms are <a href="/terms.html">here</a>.</p>`
  },
  privacy: {
    title: "Privacy policy",
    eyebrow: "Policies",
    body: `<p class="muted">We use the details you share (name, age, mobile, email, address and any note or prescription) only to handle your request and look after your care, under India's Digital Personal Data Protection Act, 2023. We never sell your data. Read the full <a href="/privacy.html">privacy policy</a>.</p>`
  },
  disclaimer: {
    title: "Disclaimer",
    eyebrow: "Policies",
    body: `<p class="muted">Yello helps you prevent, detect and understand — it does not treat, and nothing on this site replaces your own doctor. Tests are performed at accredited partner centres; clinical responsibility for each report rests with the reporting doctor. In an emergency, go to the nearest hospital or call 108.</p>`
  }
};

function renderStatic(page) {
  const content = (PUBLIC ? PUBLIC_PAGES : STATIC_PAGES)[page];
  layout(`
    <section class="section static-page">
      <div class="panel">
        <p class="eyebrow">${content.eyebrow}</p>
        <h2>${content.title}</h2>
        ${content.body}
      </div>
    </section>
  `);
  document.querySelector("#contactSend")?.addEventListener("click", async () => {
    const email = value("#contactEmail");
    const message = value("#contactMessage");
    if (!email || !message) {
      showToast("Add your email and a message.");
      return;
    }
    await api.post("/api/prescriptions", { mobile: email, fileName: "contact-form", note: message });
    showToast("Message sent. The Yello team will reply by email.");
  });
}

/* ---------- utilities ---------- */

function value(selector) {
  return document.querySelector(selector)?.value.trim() || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

init().catch((error) => {
  console.error(error);
  app.innerHTML = `<main class="main"><div class="panel"><h1>Yello</h1><p>${escapeHtml(error.message)}</p></div></main>`;
});
