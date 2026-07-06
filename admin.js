const state = {
  admin: JSON.parse(sessionStorage.getItem("yelloAdmin") || "null"),
  view: "dashboard",
  overview: null,
  labs: [],
  bookings: [],
  questions: [],
  prescriptions: [],
  notifications: [],
  centreLeads: [],
  centres: [],
  closureDrafts: {}
};

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
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (state.admin && state.admin.token) headers["x-admin-token"] = state.admin.token;
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(value) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function loadAll() {
  [state.overview, state.labs, state.bookings, state.questions, state.prescriptions, state.notifications, state.centreLeads, state.centres] = await Promise.all([
    api.get("/api/admin/overview"),
    api.get("/api/admin/labs"),
    api.get("/api/admin/bookings"),
    api.get("/api/admin/questions"),
    api.get("/api/admin/prescriptions"),
    api.get("/api/notifications"),
    api.get("/api/admin/centre-leads"),
    api.get("/api/admin/centres")
  ]);
}

function render() {
  if (!state.admin) return renderLogin();
  renderPortal();
}

function renderLogin() {
  app.innerHTML = `
    <div class="portal-login">
      <div class="hero-panel login-card">
        <img class="login-logo" src="/assets/yello.png" alt="Yello">
        <h2>Yello Admin</h2>
        <p class="muted">Operations portal — sign in with your admin credentials.</p>
        <div class="field"><label>Email</label><input id="adminEmail" value="admin@yello.test"></div>
        <div class="field"><label>Password</label><input id="adminPassword" type="password" value="admin123"></div>
        <button class="primary full" id="adminLogin">Sign in</button>
        <p class="muted small center">Prototype credentials: admin@yello.test / admin123</p>
      </div>
    </div>
  `;
  document.querySelector("#adminLogin").addEventListener("click", async () => {
    try {
      const data = await api.post("/api/admin/login", {
        email: value("#adminEmail"),
        password: value("#adminPassword")
      });
      state.admin = data;
      sessionStorage.setItem("yelloAdmin", JSON.stringify(data));
      await loadAll();
      render();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderPortal() {
  const views = [
    ["dashboard", "Dashboard"],
    ["centres", "Centre onboarding"],
    ["labs", "Labs & slots"],
    ["bookings", "Bookings"],
    ["questions", "Questions"],
    ["notifications", "Notifications"]
  ];
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/admin">
          <img src="/assets/yello.png" alt="Yello">
          <span>Admin</span>
        </a>
        <nav class="nav">
          ${views.map(([view, label]) => `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`).join("")}
          <button id="adminLogout">Logout</button>
        </nav>
      </header>
      <main class="main">${viewContent()}</main>
    </div>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      await loadAll();
      render();
    });
  });
  document.querySelector("#adminLogout").addEventListener("click", () => {
    state.admin = null;
    sessionStorage.removeItem("yelloAdmin");
    render();
  });
  bindView();
}

function viewContent() {
  if (state.view === "centres") return centresView();
  if (state.view === "labs") return labsView();
  if (state.view === "bookings") return bookingsView();
  if (state.view === "questions") return questionsView();
  if (state.view === "notifications") return notificationsView();
  return dashboardView();
}

function centresView() {
  const money = (v) => `Rs. ${Number(v || 0).toLocaleString("en-IN")}`;
  const decisions = ["In onboarding", "Under review", "Verified · Live", "On hold", "Rejected"];
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Supply</p><h2>Centre onboarding</h2></div></div>

      <div class="panel">
        <h3>New applications</h3>
        <p class="muted">From the partner site. Invite to create a centre account with its own OTP login.</p>
        <table>
          <thead><tr><th>Centre</th><th>Owner · phone</th><th>Locality</th><th>Modalities</th><th>Signals</th><th>Status</th><th></th></tr></thead>
          <tbody>${state.centreLeads.length ? state.centreLeads.map((lead) => `
            <tr>
              <td><strong>${escapeHtml(lead.centre)}</strong></td>
              <td>${escapeHtml(lead.owner)}<br><span class="muted">${escapeHtml(lead.phone)}</span></td>
              <td>${escapeHtml(lead.locality || "—")}<br><span class="muted">${escapeHtml(lead.city || "")}</span></td>
              <td class="muted">${(lead.modalities || []).map(escapeHtml).join(", ") || "—"}</td>
              <td class="muted">${escapeHtml(lead.volume || "?")}/mo · ${escapeHtml(lead.idle || "?")} idle</td>
              <td><span class="pill">${escapeHtml(lead.status)}</span></td>
              <td>${lead.status === "Applied" ? `<button class="secondary" data-invite="${lead.id}">Invite</button>` : `<span class="muted small">Invited</span>`}</td>
            </tr>
          `).join("") : `<tr><td colspan="7" class="muted">No applications yet.</td></tr>`}</tbody>
        </table>
      </div>

      <div class="panel section">
        <h3>Centres onboarding</h3>
        <p class="muted">Guarantee and EBITDA auto-computed from the centre's financial diligence.</p>
        <table>
          <thead><tr><th>Centre</th><th>Tier</th><th>Monthly EBITDA</th><th>Owner guarantee</th><th>Uplift</th><th>Documents</th><th>Status / decision</th></tr></thead>
          <tbody>${state.centres.length ? state.centres.map((c) => `
            <tr>
              <td><strong>${escapeHtml(c.name || "—")}</strong><br><span class="muted">${escapeHtml(c.mobile)}</span></td>
              <td>${c.tier ? `<span class="pill brand-pill">${escapeHtml(c.tier)}</span>` : `<span class="muted">—</span>`}</td>
              <td class="tnum">${c.tier && c.tier !== "Marketplace" ? money(c.deal.ebitda) : "—"}<br><span class="muted small">${c.tier && c.tier !== "Marketplace" ? `${c.deal.ebitdaMargin}% margin` : ""}</span></td>
              <td class="tnum">${c.tier === "Fully Managed" ? money(c.deal.guarantee) : "—"}</td>
              <td class="tnum">${c.tier && c.tier !== "Marketplace" ? money(c.deal.uplift) : "—"}</td>
              <td>${(c.documents && c.documents.length) ? `<button class="ghost" data-docs="${c.id}">${c.documents.length} file${c.documents.length === 1 ? "" : "s"} →</button>` : `<span class="muted small">none</span>`}</td>
              <td>
                <select data-review="${c.id}">
                  ${decisions.map((d) => `<option ${c.status === d ? "selected" : ""}>${d}</option>`).join("")}
                </select>
              </td>
            </tr>
          `).join("") : `<tr><td colspan="7" class="muted">No centres onboarding yet. Invite an application above.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function dashboardView() {
  const overview = state.overview || {};
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Admin</p><h2>Operations dashboard</h2></div></div>
      <div class="stats">
        ${stat("Labs", overview.labs)}
        ${stat("Bookings", overview.bookings)}
        ${stat("Consults", overview.consultations)}
        ${stat("Open questions", overview.openQuestions)}
        ${stat("Revenue", money(overview.revenue || 0))}
      </div>
      <div class="two-col section">
        <div class="panel">
          <h3>Prescription call-backs</h3>
          ${state.prescriptions.length ? state.prescriptions.map((item) => `
            <p><strong>${escapeHtml(item.fileName)}</strong><br><span class="muted">${escapeHtml(item.mobile)} · ${new Date(item.createdAt).toLocaleString()}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</span></p>
          `).join("") : `<p class="muted">No prescription uploads yet.</p>`}
        </div>
        <div class="panel">
          <h3>Newsletter</h3>
          <p class="muted">${overview.subscribers ?? 0} subscriber${(overview.subscribers ?? 0) === 1 ? "" : "s"} for Healthy Updates.</p>
        </div>
      </div>
    </section>
  `;
}

function labsView() {
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Labs</p><h2>Labs, Yello hours, and closures</h2></div></div>
      <div class="portal-grid">
        <aside class="panel">
          <h3>Add lab</h3>
          <div class="field"><label>Name</label><input id="newLabName" value="Yello Express Labs"></div>
          <div class="field"><label>Location</label><input id="newLabLocation" value="Hyderabad"></div>
          <div class="field"><label>Yello hour discount %</label><input id="newLabDiscount" type="number" value="18"></div>
          <label class="inline"><input id="newLabFeatured" type="checkbox" checked> Featured</label>
          <label class="inline"><input id="newLabBranded" type="checkbox" checked> Yello branded</label>
          <label class="inline"><input id="newLabHome" type="checkbox" checked> Home collection</label>
          <button class="primary" id="addLab">Create lab</button>
        </aside>
        <div>
          <div class="panel">
            <h3>Discount windows</h3>
            <p class="muted">Hours inside a window use its discount; other open hours use the lab's standard discount (10-50% per spec).</p>
            <table>
              <thead><tr><th>Lab</th><th>Window</th><th>Discount %</th><th>Capacity/hr</th><th></th></tr></thead>
              <tbody>${state.labs.flatMap((lab) => lab.slots.map((slot, index) => `
                <tr>
                  <td>${index === 0 ? `<strong>${escapeHtml(lab.name)}</strong><br><span class="muted">${escapeHtml(lab.location)} · standard ${lab.standardDiscountPercent}% · open ${lab.openHour}-${lab.closeHour}</span>` : ""}</td>
                  <td><span class="inline tight"><input type="number" min="0" max="23" data-field="startHour" data-key="${lab.id}:${slot.id}" value="${slot.startHour}"> to <input type="number" min="1" max="24" data-field="endHour" data-key="${lab.id}:${slot.id}" value="${slot.endHour}"></span></td>
                  <td><input type="number" data-field="discountPercent" data-key="${lab.id}:${slot.id}" value="${slot.discountPercent}"></td>
                  <td><input type="number" data-field="capacity" data-key="${lab.id}:${slot.id}" value="${slot.capacity}"></td>
                  <td><button class="secondary" data-save-slot="${lab.id}:${slot.id}">Save</button></td>
                </tr>
              `)).join("")}</tbody>
            </table>
          </div>
          <div class="panel">
            <h3>Close an hour (offline booking)</h3>
            <p class="muted">When a lab fills an hour offline, close it here so it stops taking online bookings. Toggling the same hour reopens it.</p>
            ${state.labs.map((lab) => `
              <div class="inline closure-row">
                <strong class="closure-lab">${escapeHtml(lab.name)}</strong>
                <input type="date" data-closure-date="${lab.id}" value="${new Date().toISOString().slice(0, 10)}">
                <input type="number" min="0" max="23" data-closure-hour="${lab.id}" placeholder="Hour" value="12">
                <button class="secondary" data-close-slot="${lab.id}">Toggle closure</button>
                <span class="muted">${(lab.closures || []).map((item) => `${item.date} ${item.hour}:00`).join(", ") || "No closures"}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function bookingsView() {
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Bookings</p><h2>All bookings</h2></div></div>
      <p class="muted">Per the spec (CR10), rescheduling is an admin action. Pick a new date and hour, then save.</p>
      <div class="panel">
        <table>
          <thead><tr><th>Booking</th><th>Consumer</th><th>Appointment</th><th>Payment</th><th>Status</th><th>Reschedule</th></tr></thead>
          <tbody>${state.bookings.map((booking) => `
            <tr>
              <td><strong>${escapeHtml(booking.testName)}</strong><br><span class="muted">${escapeHtml(booking.labName)} · ${escapeHtml(booking.visitType)}</span></td>
              <td>${escapeHtml(booking.consumerName)}<br><span class="muted">${escapeHtml(booking.patient.name)} (patient)</span></td>
              <td>${booking.appointmentDate}<br><span class="muted">${escapeHtml(booking.slotLabel)}</span></td>
              <td>${escapeHtml(booking.paymentStatus)}<br><strong>${money(booking.finalPrice)}</strong></td>
              <td>
                <select data-status-for="${booking.id}">
                  ${["upcoming", "completed", "cancelled", booking.status].filter((status, index, all) => all.indexOf(status) === index).map((status) => `<option ${booking.status === status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
              </td>
              <td>
                <span class="inline tight">
                  <input type="date" data-res-date="${booking.id}" value="${booking.appointmentDate}">
                  <input type="number" min="0" max="23" data-res-hour="${booking.id}" value="${booking.hour}">
                  <button class="secondary" data-reschedule="${booking.id}">Save</button>
                </span>
              </td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function questionsView() {
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Questions</p><h2>Consumer questions</h2></div></div>
      <div class="panel">
        ${state.questions.length ? state.questions.map((item) => `
          <div class="question-row">
            <p><strong>${escapeHtml(item.consumerName)}</strong> · ${escapeHtml(item.testName)} at ${escapeHtml(item.labName)}${item.question.prescriptionName ? ` · 📎 ${escapeHtml(item.question.prescriptionName)}` : ""}</p>
            <p class="muted">“${escapeHtml(item.question.text)}”</p>
            ${item.question.response
              ? `<p class="muted">Answered: ${escapeHtml(item.question.response)}</p>`
              : `
                <div class="inline">
                  <input data-response-for="${item.bookingId}" placeholder="Write the response email">
                  <button class="secondary" data-respond="${item.bookingId}">Send response</button>
                </div>
              `}
          </div>
        `).join("") : `<p class="muted">No consumer questions yet.</p>`}
      </div>
    </section>
  `;
}

function notificationsView() {
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Notifications</p><h2>Email, SMS, and web log</h2></div></div>
      <div class="panel">
        <table>
          <thead><tr><th>Channel</th><th>To</th><th>Subject</th><th>Body</th><th>Created</th></tr></thead>
          <tbody>${state.notifications.slice(0, 30).map((n) => `
            <tr>
              <td>${escapeHtml(n.channel)}</td>
              <td>${escapeHtml(n.to)}</td>
              <td>${escapeHtml(n.subject)}</td>
              <td class="muted">${escapeHtml(n.body)}</td>
              <td>${new Date(n.createdAt).toLocaleString()}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function stat(label, statValue) {
  return `<div class="stat"><span class="muted">${label}</span><strong>${statValue ?? 0}</strong></div>`;
}

function openCentreDocs(centre) {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const docs = centre.documents || [];
  backdrop.innerHTML = `
    <div class="modal panel">
      <div class="section-head" style="margin-bottom:6px">
        <div><h3>${escapeHtml(centre.name || centre.mobile)}</h3><p class="muted">${escapeHtml(centre.tier || "—")} · ${escapeHtml(centre.status)}</p></div>
        <button class="rep-del" id="docClose" title="Close">✕</button>
      </div>
      <h3>Documents uploaded</h3>
      ${docs.length ? docs.map((doc) => `
        <div class="doc-item">
          <div class="doc-item-head"><span class="doc-file">${escapeHtml(doc.file)}</span><span class="muted small">${escapeHtml(doc.label)}</span></div>
          ${doc.dataUrl ? docPreview(doc) : `<p class="muted small">Filename only — no file attached.</p>`}
        </div>`).join("") : `<p class="muted">No documents uploaded yet.</p>`}
    </div>`;
  document.body.append(backdrop);
  backdrop.querySelector("#docClose").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
}

// Only allow inline image/PDF data URLs; reject javascript:/data:text/html/etc.
function safeDocUrl(url) {
  return /^data:(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf);/i.test(String(url || "")) ? escapeHtml(url) : "";
}
function docPreview(doc) {
  const src = safeDocUrl(doc.dataUrl);
  if (!src) return `<p class="muted small">Preview unavailable for this file.</p>`;
  const isImg = /^data:image\//i.test(doc.dataUrl);
  if (isImg) return `<a href="${src}" target="_blank" rel="noreferrer"><img class="doc-img" src="${src}" alt="${escapeHtml(doc.file)}"></a>`;
  return `<iframe class="doc-frame" src="${src}" title="${escapeHtml(doc.file)}"></iframe>`;
}

function bindView() {
  document.querySelectorAll("[data-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api.post(`/api/admin/centre-leads/${button.dataset.invite}/invite`, {});
        await loadAll();
        showToast("Centre invited. They can now log in at /centre.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-review]").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api.patch(`/api/admin/centres/${select.dataset.review}/review`, { status: select.value });
        showToast("Centre status updated.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-docs]").forEach((button) => {
    button.addEventListener("click", () => {
      const centre = state.centres.find((item) => item.id === button.dataset.docs);
      if (centre) openCentreDocs(centre);
    });
  });
  document.querySelector("#addLab")?.addEventListener("click", async () => {
    await api.post("/api/admin/labs", {
      name: value("#newLabName"),
      location: value("#newLabLocation"),
      discountPercent: Number(value("#newLabDiscount")),
      featured: document.querySelector("#newLabFeatured").checked,
      branded: document.querySelector("#newLabBranded").checked,
      homeCollection: document.querySelector("#newLabHome").checked
    });
    await loadAll();
    showToast("Lab created.");
    render();
  });
  document.querySelectorAll("[data-save-slot]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const [labId, slotId] = button.dataset.saveSlot.split(":");
        const read = (field) => Number(document.querySelector(`[data-field="${field}"][data-key="${labId}:${slotId}"]`).value);
        await api.patch(`/api/admin/labs/${labId}/slots/${slotId}`, {
          startHour: read("startHour"),
          endHour: read("endHour"),
          discountPercent: read("discountPercent"),
          capacity: read("capacity")
        });
        showToast("Discount window updated.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-close-slot]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const labId = button.dataset.closeSlot;
        await api.post(`/api/admin/labs/${labId}/closures`, {
          date: document.querySelector(`[data-closure-date="${labId}"]`).value,
          hour: Number(document.querySelector(`[data-closure-hour="${labId}"]`).value)
        });
        await loadAll();
        showToast("Closure updated.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-reschedule]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const id = button.dataset.reschedule;
        await api.patch(`/api/bookings/${id}/reschedule`, {
          appointmentDate: document.querySelector(`[data-res-date="${id}"]`).value,
          hour: Number(document.querySelector(`[data-res-hour="${id}"]`).value)
        });
        await loadAll();
        showToast("Booking rescheduled. Consumer notified by SMS.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-status-for]").forEach((select) => {
    select.addEventListener("change", async () => {
      await api.patch(`/api/admin/bookings/${select.dataset.statusFor}/status`, { status: select.value });
      showToast("Status updated.");
    });
  });
  document.querySelectorAll("[data-respond]").forEach((button) => {
    button.addEventListener("click", async () => {
      const bookingId = button.dataset.respond;
      const response = document.querySelector(`[data-response-for="${bookingId}"]`).value.trim();
      if (!response) return;
      await api.patch(`/api/admin/bookings/${bookingId}/question`, { response });
      await loadAll();
      showToast("Response emailed to the consumer.");
      render();
    });
  });
}

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

(async function start() {
  try {
    if (state.admin) await loadAll();
    render();
  } catch (error) {
    console.error(error);
    state.admin = null;
    sessionStorage.removeItem("yelloAdmin");
    render();
  }
})();
