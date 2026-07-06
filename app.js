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

const HOME_TESTS = ["COVID RT-PCR", "CBC", "Vitamin D (25-OH)", "Thyroid Profile", "Diabetes Screening", "Liver Function Test"];
const LAB_TESTS = ["USG Whole Abdomen", "ECG", "X-Ray Chest PA View", "MRI Brain", "HRCT Chest", "CECT Whole Abdomen"];

const app = document.querySelector("#app");

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
          ${cartButton()}
          ${navButton("account", state.consumer ? `Hi ${escapeHtml(state.consumer.name.split(" ")[0])}` : "My Account")}
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
            <a href="/admin">Admin portal</a><br>
            <a href="/doctor">Doctor portal</a>
          </p>
        </div>
        <div>
          <strong>Search Links</strong>
          <p class="muted">${["COVID test in Hyderabad", "Full Body checkup in Hyderabad", "Thyroid test in Kurnool"].map((item) => `<a href="#browse" data-search="${escapeAttr(item)}">${escapeHtml(item)}</a>`).join("<br>")}</p>
        </div>
      </div>
      <p class="muted copyright">© ${new Date().getFullYear()} Yello Diagnostic Labs Pvt. Ltd. (prototype)</p>
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
      <p class="muted">Share your prescription and mobile number. The Yello team will match the tests and call you back with discounted options.</p>
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
    await api.post("/api/prescriptions", { mobile, fileName: file.name, note: backdrop.querySelector("#rxNote").value.trim() });
    backdrop.remove();
    showToast("Prescription received. Our team will call you back.");
  });
}

/* ---------- routing ---------- */

function render() {
  if (state.route === "browse") return renderBrowse();
  if (state.route === "packages") return renderPackages();
  if (state.route === "lab") return renderLab();
  if (state.route === "checkout") return renderCheckout();
  if (state.route === "payment") return renderPayment();
  if (state.route === "success") return renderSuccess();
  if (state.route === "login") return renderLogin();
  if (state.route === "account") return renderAccount();
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
        <p class="lead light">Yello is a curated network of accredited centres where every check does three things: gives you an answer in plain language, a doctor to talk it through — and sharpens your <strong>health twin</strong>, the living picture of your body we keep for life.</p>
        <div class="inline">
          <button class="primary" data-route="browse">Book a health check</button>
          <button class="ghost light" id="promoUpload">Upload Prescription</button>
        </div>
        <div class="hero-trust">
          <span>NABL-accredited network</span>
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
          <p>A phlebotomist at your door, or an accredited centre nearby. Paid online, no counters, no queues.</p>
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
            <rect x="0" y="30" width="320" height="105" rx="8" fill="rgba(45,212,191,0.07)"/>
            <text x="10" y="24" class="drift-label">— upper limit of "normal"</text>
            <line x1="0" y1="30" x2="320" y2="30" stroke="rgba(242,238,228,0.28)" stroke-dasharray="5 5" stroke-width="1"/>
            <polyline points="30,118 120,102 210,74 300,42" fill="none" stroke="url(#driftGrad)" stroke-width="2.5" stroke-linecap="round"/>
            <defs>
              <linearGradient id="driftGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#ffc40c"/>
              </linearGradient>
            </defs>
            <circle cx="30" cy="118" r="5" fill="#2dd4bf"/>
            <circle cx="120" cy="102" r="5" fill="#2dd4bf"/>
            <circle cx="210" cy="74" r="5" fill="#5ecfb8"/>
            <circle cx="300" cy="42" r="6.5" fill="#ffc40c"/>
            <circle cx="300" cy="42" r="12" fill="none" stroke="rgba(255,196,12,0.4)" stroke-width="2"/>
            <text x="22" y="140" class="drift-year">2023</text>
            <text x="112" y="140" class="drift-year">2024</text>
            <text x="202" y="140" class="drift-year">2025</text>
            <text x="285" y="140" class="drift-year">2026</text>
            <text x="22" y="168" class="drift-tick">✓ in range</text>
            <text x="112" y="168" class="drift-tick">✓ in range</text>
            <text x="202" y="168" class="drift-tick">✓ in range</text>
            <text x="318" y="168" text-anchor="end" class="drift-tick warn">⚠ caught early</text>
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
        <div class="panel">
          <h3>We come to you</h3>
          <div class="chips">${HOME_TESTS.map(testChip).join("")}</div>
        </div>
        <div class="panel">
          <h3>Visit a centre nearby</h3>
          <div class="chips">${LAB_TESTS.map(testChip).join("")}</div>
        </div>
      </div>
    </section>

    <section class="section band">
      <div class="section-head">
        <div>
          <p class="eyebrow">A network you don't have to second-guess</p>
          <h2>Every centre, held to the same bar</h2>
        </div>
        <button class="ghost" data-route="browse">Explore the network</button>
      </div>
      <div class="slider">${partners.map(partnerTile).join("")}</div>
    </section>

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
        ${step(3, "Home or centre", "A phlebotomist at your door, or a calm visit nearby. Pay online, no counters.")}
        ${step(4, "An answer, not a PDF", "Reports explained in plain language, tracked over time — with a free doctor consult.")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Families on Yello</p>
          <h2>Cared for, not processed</h2>
        </div>
      </div>
      <div class="slider">${state.testimonials.map(testimonialCard).join("")}</div>
    </section>

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
      const result = await api.post("/api/newsletter", { email: document.querySelector("#subscribeEmail").value.trim() });
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
        <span class="lab-rating">★ ${pkg.rating}</span>
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
        <div class="field">
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
            <h2>${meta.total} lab${meta.total === 1 ? "" : "s"} found</h2>
          </div>
          <div class="field">
            <label>Sort by</label>
            <select id="sortSelect">
              <option value="price_asc" ${state.filters.sort === "price_asc" ? "selected" : ""}>Price low to high</option>
              <option value="price_desc" ${state.filters.sort === "price_desc" ? "selected" : ""}>Price high to low</option>
              <option value="distance" ${state.filters.sort === "distance" ? "selected" : ""}>Distance</option>
              <option value="reviews" ${state.filters.sort === "reviews" ? "selected" : ""}>Reviews</option>
            </select>
          </div>
        </div>
        <div class="lab-list">
          ${state.labs.length ? state.labs.map(listingCard).join("") : `<div class="empty">No labs matched the current search and filters.</div>`}
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
          <span class="pill">${lab.rating} ★ (${lab.reviewCount})</span>
        </div>
        <h3>${escapeHtml(lab.name)}</h3>
        <p class="muted">Accreditation: ${escapeHtml(lab.accreditation || "—")} · ${escapeHtml(lab.location)} · ${lab.distanceKm} km</p>
        <p class="muted">${lab.packageNames.map(escapeHtml).join(", ")}</p>
        <div class="meta">
          <span class="pill off-pill">${escapeHtml(lab.offerText)}</span>
          <span class="pill">${lab.services.join(" + ")}</span>
        </div>
        ${slotGrid(lab.slotDays, lab.id, null)}
      </div>
      <div class="lab-card-actions">
        <strong>From ${money(lab.startingPrice)}</strong>
        <button class="primary" data-open-lab="${lab.id}">Select Lab</button>
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
                  <span>${slot.available ? `${slot.discountPercent}% OFF` : "Full"}</span>
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
          <span class="pill">${lab.rating} ★ (${lab.reviewCount})</span>
          <span class="pill">Accreditation: ${escapeHtml(lab.accreditation || "—")}</span>
        </div>
        <h2>${escapeHtml(lab.name)}</h2>
        <p class="lead">${escapeHtml(lab.description)}</p>
        <p class="muted">${escapeHtml(lab.address)} · <a href="https://www.google.com/maps/search/${encodeURIComponent(`${lab.name} ${lab.address}`)}" target="_blank" rel="noreferrer">Get directions</a></p>
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
        <div class="panel">
          <h3>Reviews</h3>
          ${lab.reviews.map((review) => `<p><strong>${escapeHtml(review.author)}</strong> ${"★".repeat(review.rating)}<br><span class="muted">${escapeHtml(review.text)}</span></p>`).join("") || `<p class="muted">No reviews yet.</p>`}
        </div>
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
        <button class="primary full" id="bookAppointment" ${selectedSlot ? "" : "disabled"}>Book appointment</button>
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
    if (!state.consumer) {
      state.auth.next = "checkout";
      navigate("login");
      return;
    }
    navigate("checkout");
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

function twinPanel(paidBookings) {
  const events = paidBookings
    .slice()
    .sort((a, b) => (a.appointmentDate < b.appointmentDate ? -1 : 1));
  const byPatient = {};
  events.forEach((booking) => {
    const name = booking.patient?.name || "You";
    byPatient[name] = (byPatient[name] || 0) + 1;
  });
  const resolution = Math.min(12 + events.length * 14, 88);
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
      ${events.length ? `
        <div class="twin-timeline">
          ${events.map((booking) => `
            <div class="twin-event" title="${escapeAttr(booking.testName)} · ${escapeAttr(booking.appointmentDate)}">
              <span class="twin-dot-ui"></span>
              <span class="twin-event-name">${escapeHtml(booking.testName)}</span>
              <span class="twin-event-meta">${escapeHtml(booking.patient?.name || "")} · ${escapeHtml(booking.appointmentDate)}</span>
            </div>
          `).join("")}
          <div class="twin-event next">
            <span class="twin-dot-ui"></span>
            <span class="twin-event-name">Next calibration</span>
            <span class="twin-event-meta">Book a follow-up to keep the twin sharp</span>
          </div>
        </div>
        <div class="twin-members">
          ${Object.entries(byPatient).map(([name, count]) => `<span class="twin-member">${escapeHtml(name)} · ${count}</span>`).join("")}
        </div>
      ` : `
        <p class="twin-empty">Your first booking becomes your baseline — the first outline of a picture you'll keep for life.</p>
      `}
    </div>
  `;
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
      ${booking.reportName ? `<p class="report-ready">📄 Report ready: ${escapeHtml(booking.reportName)}</p>` : ""}
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
          <p class="muted">A phlebotomist at your door for bloods, or a calm visit to an accredited centre for scans. Paid online, no counters, no queues either way.</p>
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
        <a class="channel" href="tel:+914041410000">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>
          <div>
            <strong>Call us</strong>
            <span>040 4141 0000 · 6 AM – 10 PM, every day</span>
          </div>
        </a>
        <a class="channel" href="https://wa.me/914041410000" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.8 9.2c.3 2.7 3.3 5.7 6 6l1.4-1.4-2-1.3-1 .7c-.8-.4-1.9-1.5-2.3-2.3l.7-1-1.3-2-1.5 1.3Z"/></svg>
          <div>
            <strong>WhatsApp</strong>
            <span>Fastest for reschedules & report questions</span>
          </div>
        </a>
        <a class="channel" href="mailto:hello@yello.health">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          <div>
            <strong>hello@yello.health</strong>
            <span>For anything longer — replies within the day</span>
          </div>
        </a>
        <div class="channel still">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <div>
            <strong>Hyderabad, Telangana</strong>
            <span>Home collection across the city · centres in every zone</span>
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

function renderStatic(page) {
  const content = STATIC_PAGES[page];
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
