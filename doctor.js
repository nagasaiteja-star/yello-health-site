const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const state = {
  doctor: JSON.parse(sessionStorage.getItem("yelloDoctor") || "null"),
  mustChangePassword: sessionStorage.getItem("yelloDoctorMustChange") === "true",
  view: "appointments",
  dashboard: null,
  webNotifications: [],
  search: "",
  from: "",
  to: "",
  sort: { column: "slot", direction: 1 },
  chat: null,
  chatTimer: null
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
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function loadDashboard() {
  const query = new URLSearchParams({ doctorId: state.doctor.id, search: state.search });
  if (state.from) query.set("from", state.from);
  if (state.to) query.set("to", state.to);
  state.dashboard = await api.get(`/api/doctor/dashboard?${query}`);
  state.webNotifications = await api.get(`/api/doctor/notifications?doctorId=${state.doctor.id}`);
}

function render() {
  window.clearInterval(state.chatTimer);
  if (!state.doctor) return renderLogin();
  if (state.mustChangePassword) return renderChangePassword();
  if (state.chat) return renderChat();
  renderPortal();
}

/* ---------- login + first-run (spec 3.3.2.1 / 3.3.2.2) ---------- */

function renderLogin() {
  app.innerHTML = `
    <div class="portal-login">
      <div class="hero-panel login-card">
        <img class="login-logo" src="/assets/yello.png" alt="Yello">
        <h2>Consultation Portal</h2>
        <p class="muted">Doctors are onboarded by the Yello admin and receive a welcome email with a temporary password.</p>
        <div class="field"><label>Email ID</label><input id="docEmail" value="nisha@yello.test"></div>
        <div class="field"><label>Password</label><input id="docPassword" type="password" value="yello123"></div>
        <button class="primary full" id="docLogin">Sign in</button>
        <p class="muted small center">Prototype doctors: nisha@yello.test, arvind@yello.test / yello123</p>
      </div>
    </div>
  `;
  document.querySelector("#docLogin").addEventListener("click", async () => {
    try {
      const data = await api.post("/api/doctor/login", { email: value("#docEmail"), password: value("#docPassword") });
      state.doctor = data.doctor;
      state.mustChangePassword = data.mustChangePassword;
      sessionStorage.setItem("yelloDoctor", JSON.stringify(data.doctor));
      sessionStorage.setItem("yelloDoctorMustChange", String(data.mustChangePassword));
      if (!data.mustChangePassword) await loadDashboard();
      render();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderChangePassword() {
  app.innerHTML = `
    <div class="portal-login">
      <div class="hero-panel login-card">
        <img class="login-logo" src="/assets/yello.png" alt="Yello">
        <h2>Set a new password</h2>
        <p class="muted">This is your first login, ${escapeHtml(state.doctor.name)}. Change your temporary password to continue.</p>
        <div class="field"><label>Temporary password</label><input id="currentPassword" type="password" value="yello123"></div>
        <div class="field"><label>New password</label><input id="newPassword" type="password" placeholder="At least 6 characters"></div>
        <button class="primary full" id="changePassword">Save and continue</button>
      </div>
    </div>
  `;
  document.querySelector("#changePassword").addEventListener("click", async () => {
    try {
      await api.post("/api/doctor/password", {
        doctorId: state.doctor.id,
        currentPassword: value("#currentPassword"),
        newPassword: value("#newPassword")
      });
      state.mustChangePassword = false;
      state.view = "profile";
      sessionStorage.setItem("yelloDoctorMustChange", "false");
      await loadDashboard();
      showToast("Password updated. Finish your profile setup.");
      render();
    } catch (error) {
      showToast(error.message);
    }
  });
}

/* ---------- portal shell ---------- */

function renderPortal() {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/doctor">
          <img src="/assets/yello.png" alt="Yello">
          <span>Consultation</span>
        </a>
        <nav class="nav">
          <button class="${state.view === "appointments" ? "active" : ""}" data-view="appointments">Appointments</button>
          <button class="${state.view === "profile" ? "active" : ""}" data-view="profile">Profile</button>
          <button class="${state.view === "notifications" ? "active" : ""}" data-view="notifications">Notifications${state.webNotifications.length ? ` (${state.webNotifications.length})` : ""}</button>
          <button id="docLogout">Logout</button>
        </nav>
      </header>
      <main class="main">${state.view === "profile" ? profileView() : state.view === "notifications" ? notificationsView() : appointmentsView()}</main>
    </div>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      await loadDashboard();
      render();
    });
  });
  document.querySelector("#docLogout").addEventListener("click", () => {
    state.doctor = null;
    sessionStorage.removeItem("yelloDoctor");
    sessionStorage.removeItem("yelloDoctorMustChange");
    render();
  });
  if (state.view === "profile") bindProfile();
  if (state.view === "appointments") bindAppointments();
}

/* ---------- appointments (spec 3.3.2.3) ---------- */

function appointmentsView() {
  const numbers = state.dashboard?.quickNumbers || { total: 0, upcoming: 0, completed: 0 };
  const rows = sortedAppointments();
  return `
    <section class="section">
      <div class="section-head">
        <div><p class="eyebrow">Dr. ${escapeHtml(state.doctor.name.replace(/^Dr\.\s*/, ""))}</p><h2>Appointments</h2></div>
      </div>
      <div class="stats three">
        ${stat("Total appointments", numbers.total)}
        ${stat("Upcoming", numbers.upcoming)}
        ${stat("Completed", numbers.completed)}
      </div>
      <div class="panel">
        <div class="inline filter-bar">
          <input id="docSearch" placeholder="Search patient, test, lab" value="${escapeAttr(state.search)}">
          <label class="muted">From <input type="date" id="docFrom" value="${state.from}"></label>
          <label class="muted">To <input type="date" id="docTo" value="${state.to}"></label>
          <button class="secondary" id="docFilter">Filter</button>
        </div>
        <table>
          <thead>
            <tr>
              ${sortableHeader("patientName", "Patient")}
              ${sortableHeader("gender", "Gender")}
              ${sortableHeader("testName", "Test/Package")}
              ${sortableHeader("labName", "Lab")}
              ${sortableHeader("slot", "Appointment")}
              ${sortableHeader("status", "Status")}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.patientName)}</td>
                <td>${escapeHtml(row.gender || "—")}</td>
                <td>${escapeHtml(row.testName)}</td>
                <td>${escapeHtml(row.labName)}</td>
                <td>${escapeHtml(row.slot)}<br><span class="muted">${escapeHtml(row.type)} · ${row.durationMinutes} min</span></td>
                <td><span class="pill">${escapeHtml(row.status)}</span></td>
                <td>
                  ${row.type === "Tele"
                    ? `<a class="primary button-link" href="${escapeAttr(row.zoomLink || "#")}" target="_blank" rel="noreferrer">Start Zoom</a>`
                    : `<button class="primary" data-chat="${row.id}">Start Consultation</button>`}
                </td>
              </tr>
            `).join("") || `<tr><td colspan="7" class="muted">No appointments found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function sortableHeader(column, label) {
  const active = state.sort.column === column;
  return `<th><button class="sort-button ${active ? "active" : ""}" data-sort="${column}">${label} ${active ? (state.sort.direction === 1 ? "↑" : "↓") : ""}</button></th>`;
}

function sortedAppointments() {
  const rows = [...(state.dashboard?.appointments || [])].map((row) => ({
    ...row,
    gender: row.gender || row.patientGender || ""
  }));
  const { column, direction } = state.sort;
  rows.sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? "")) * direction);
  return rows;
}

function bindAppointments() {
  document.querySelector("#docFilter")?.addEventListener("click", async () => {
    state.search = value("#docSearch");
    state.from = document.querySelector("#docFrom").value;
    state.to = document.querySelector("#docTo").value;
    await loadDashboard();
    render();
  });
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const column = button.dataset.sort;
      if (state.sort.column === column) {
        state.sort.direction *= -1;
      } else {
        state.sort = { column, direction: 1 };
      }
      render();
    });
  });
  document.querySelectorAll("[data-chat]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.chat = await api.get(`/api/consultations/${button.dataset.chat}`);
      render();
    });
  });
}

/* ---------- consultation chat (spec 3.3.2.4) ---------- */

function renderChat() {
  const chat = state.chat;
  const remaining = chatRemaining(chat);
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/doctor"><img src="/assets/yello.png" alt="Yello"><span>Consultation</span></a>
        <nav class="nav"><button id="chatBack">← Back to appointments</button></nav>
      </header>
      <main class="main">
        <section class="section chat-layout">
          <div class="panel chat-window">
            <div class="section-head">
              <div>
                <p class="eyebrow">Chat consultation · ${chat.durationMinutes} min</p>
                <h2>${escapeHtml(chat.patientName)}</h2>
                <p class="muted">${escapeHtml(chat.testName)} · ${escapeHtml(chat.labName)} · ${escapeHtml(chat.slot)}</p>
              </div>
              <div class="chat-timer ${remaining !== null && remaining < 120 ? "danger" : ""}" id="chatTimer">
                ${remaining === null ? "Timer starts with your first message" : remaining <= 0 ? "Time ended" : formatRemaining(remaining)}
              </div>
            </div>
            <div class="chat-messages" id="chatMessages">
              ${chat.messages.map((message) => `
                <div class="chat-bubble ${message.from === "doctor" ? "mine" : ""}">
                  <p>${escapeHtml(message.text)}${message.fileName ? `<br>📎 ${escapeHtml(message.fileName)}` : ""}</p>
                  <span class="muted small">${escapeHtml(message.from)} · ${new Date(message.sentAt).toLocaleTimeString()}</span>
                </div>
              `).join("") || `<p class="muted">No messages yet. Your first message starts the timer.</p>`}
            </div>
            <div class="inline chat-input">
              <input id="chatText" placeholder="Type a message">
              <input type="file" id="chatFile" class="chat-file">
              <button class="primary" id="chatSend">Send</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
  document.querySelector("#chatBack").addEventListener("click", async () => {
    state.chat = null;
    await loadDashboard();
    render();
  });
  document.querySelector("#chatSend").addEventListener("click", sendChat);
  document.querySelector("#chatText").addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChat();
  });
  const messages = document.querySelector("#chatMessages");
  messages.scrollTop = messages.scrollHeight;
  state.chatTimer = window.setInterval(() => {
    const target = document.querySelector("#chatTimer");
    if (!target) return;
    const left = chatRemaining(state.chat);
    if (left === null) return;
    target.textContent = left <= 0 ? "Time ended" : formatRemaining(left);
    if (left < 120) target.classList.add("danger");
  }, 1000);
}

function chatRemaining(chat) {
  if (!chat.startedAt) return null;
  const endsAt = new Date(chat.startedAt).getTime() + chat.durationMinutes * 60000;
  return Math.round((endsAt - Date.now()) / 1000);
}

function formatRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} left`;
}

async function sendChat() {
  const text = value("#chatText");
  const file = document.querySelector("#chatFile").files[0];
  if (!text && !file) return;
  try {
    state.chat = await api.post(`/api/consultations/${state.chat.id}/messages`, {
      from: "doctor",
      text: text || "Shared a file.",
      fileName: file?.name || null
    });
    render();
  } catch (error) {
    showToast(error.message);
    state.chat = await api.get(`/api/consultations/${state.chat.id}`);
    render();
  }
}

/* ---------- profile (spec 3.3.2.2 / 3.3.2.5) ---------- */

function profileView() {
  const doctor = state.doctor;
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Profile</p><h2>${escapeHtml(doctor.name)}</h2></div></div>
      <div class="two-col">
        <div class="panel">
          <h3>Availability</h3>
          <p class="muted">Pick the weekdays and hours you accept consultations.</p>
          <div class="chips">
            ${WEEKDAYS.map((day) => `
              <label class="chip choice ${doctor.availability.days.includes(day) ? "selected" : ""}">
                <input type="checkbox" value="${day}" ${doctor.availability.days.includes(day) ? "checked" : ""} data-day> ${day}
              </label>
            `).join("")}
          </div>
          <div class="form-grid">
            <div class="field"><label>From hour</label><input id="availStart" type="number" min="0" max="23" value="${doctor.availability.startHour}"></div>
            <div class="field"><label>To hour</label><input id="availEnd" type="number" min="1" max="24" value="${doctor.availability.endHour}"></div>
          </div>
          <div class="field">
            <label>Consultation time period</label>
            <select id="consultMinutes">
              ${[5, 10, 15, 20].map((minutes) => `<option value="${minutes}" ${doctor.consultationMinutes === minutes ? "selected" : ""}>${minutes} MINS</option>`).join("")}
            </select>
          </div>
          <button class="primary" id="saveProfile">Save profile</button>
        </div>
        <div>
          <div class="panel">
            <h3>Zoom</h3>
            <p class="muted">Tele consultations are offered to consumers only when Zoom is connected (OAuth simulated).</p>
            <button class="${doctor.zoomConnected ? "ghost" : "secondary"}" id="toggleZoom">
              ${doctor.zoomConnected ? "Disconnect Zoom" : "Connect with Zoom"}
            </button>
            <p class="muted">${doctor.zoomConnected ? "Connected ✓" : "Not connected"}</p>
          </div>
          <div class="panel">
            <h3>Password</h3>
            <div class="field"><label>Current password</label><input id="pwCurrent" type="password"></div>
            <div class="field"><label>New password</label><input id="pwNew" type="password"></div>
            <button class="secondary" id="updatePassword">Update password</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function bindProfile() {
  document.querySelector("#saveProfile")?.addEventListener("click", async () => {
    try {
      const days = [...document.querySelectorAll("[data-day]:checked")].map((input) => input.value);
      state.doctor = await api.patch("/api/doctor/profile", {
        doctorId: state.doctor.id,
        consultationMinutes: Number(value("#consultMinutes")),
        availability: { days, startHour: Number(value("#availStart")), endHour: Number(value("#availEnd")) }
      });
      sessionStorage.setItem("yelloDoctor", JSON.stringify(state.doctor));
      showToast("Profile saved.");
      render();
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#toggleZoom")?.addEventListener("click", async () => {
    state.doctor = await api.patch("/api/doctor/profile", {
      doctorId: state.doctor.id,
      zoomConnected: !state.doctor.zoomConnected
    });
    sessionStorage.setItem("yelloDoctor", JSON.stringify(state.doctor));
    showToast(state.doctor.zoomConnected ? "Zoom connected." : "Zoom disconnected.");
    render();
  });
  document.querySelector("#updatePassword")?.addEventListener("click", async () => {
    try {
      await api.post("/api/doctor/password", {
        doctorId: state.doctor.id,
        currentPassword: value("#pwCurrent"),
        newPassword: value("#pwNew")
      });
      showToast("Password updated.");
    } catch (error) {
      showToast(error.message);
    }
  });
}

/* ---------- web notifications (spec 3.3.2.6) ---------- */

function notificationsView() {
  return `
    <section class="section">
      <div class="section-head"><div><p class="eyebrow">Web notifications</p><h2>Latest activity</h2></div></div>
      <div class="panel">
        ${state.webNotifications.length ? state.webNotifications.map((item) => `
          <div class="question-row">
            <p><strong>${escapeHtml(item.subject)}</strong></p>
            <p class="muted">${escapeHtml(item.body)} · ${new Date(item.createdAt).toLocaleString()}</p>
          </div>
        `).join("") : `<p class="muted">No notifications yet. New appointments, chat messages, and reschedule requests show here.</p>`}
      </div>
    </section>
  `;
}

function stat(label, statValue) {
  return `<div class="stat"><span class="muted">${label}</span><strong>${statValue ?? 0}</strong></div>`;
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

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

(async function start() {
  try {
    if (state.doctor && !state.mustChangePassword) await loadDashboard();
    render();
  } catch (error) {
    console.error(error);
    state.doctor = null;
    sessionStorage.removeItem("yelloDoctor");
    render();
  }
})();
