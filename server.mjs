import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createSeedData } from "./server/data.mjs";
import { loadState, bindPersistence, schedulePersist } from "./server/persist.mjs";
import { buildReport } from "./server/markers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

export function createApp(initialState = createSeedData()) {
  const state = initialState;

  return async function app(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        const result = await handleApi(req, url, state);
        if (req.method !== "GET") schedulePersist();
        return sendJson(res, result.status ?? 200, result.body);
      }
      return serveStatic(url.pathname, res);
    } catch (error) {
      return sendJson(res, error.status ?? 500, {
        error: error.expose ? error.message : "Unexpected server error"
      });
    }
  };
}

export function listen(port = process.env.PORT || 4173, state) {
  const server = http.createServer(createApp(state));
  server.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Yello prototype running at http://localhost:${actualPort}`);
  });
  return server;
}

export const ADMIN_TOKEN = "proto-admin-token";

export async function handleApi(req, url, state) {
  const method = req.method || "GET";
  const body = await readJson(req);
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    return { body: { ok: true, app: "Yello prototype" } };
  }

  // Admin routes carry the sensitive firehose (every centre's financials,
  // bank details, documents). Require the admin token on all of them.
  if (parts[0] === "api" && parts[1] === "admin" && url.pathname !== "/api/admin/login") {
    if ((req.headers["x-admin-token"] || "") !== ADMIN_TOKEN) {
      throw httpError(401, "Admin authentication required");
    }
  }

  if (method === "GET" && url.pathname === "/api/labs") {
    const search = lower(url.searchParams.get("search") || "");
    const location = url.searchParams.get("location") || "";
    const visitType = url.searchParams.get("visitType") || "";
    const minRating = Number(url.searchParams.get("minRating") || "0");
    const sort = url.searchParams.get("sort") || "price_asc";
    const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
    const pageSize = 10;
    let labs = state.labs.map((lab) => labSummary(lab, state));

    if (search) {
      labs = labs.filter((lab) => {
        const haystack = [
          lab.name,
          lab.location,
          lab.packageNames.join(" "),
          lab.offerText,
          lab.services.join(" ")
        ].map(lower).join(" ");
        return haystack.includes(search);
      });
    }
    if (location && location !== "All locations") {
      labs = labs.filter((lab) => lab.location === location);
    }
    if (visitType === "Home collection") labs = labs.filter((lab) => lab.services.includes("Home collection"));
    if (visitType === "Lab visit") labs = labs.filter((lab) => lab.services.includes("Lab visit"));
    if (minRating) labs = labs.filter((lab) => lab.rating >= minRating);

    labs.sort(sortLabs(sort));
    return {
      body: {
        page,
        pageSize,
        total: labs.length,
        results: labs.slice((page - 1) * pageSize, page * pageSize)
      }
    };
  }

  if (method === "GET" && url.pathname === "/api/locations") {
    return { body: ["All locations", ...new Set(state.labs.map((lab) => lab.location))] };
  }

  if (method === "GET" && url.pathname === "/api/suggest") {
    const q = lower(url.searchParams.get("q") || "").trim();
    if (q.length < 2) return { body: [] };
    const suggestions = [];
    for (const lab of state.labs) {
      if (lower(lab.name).includes(q)) {
        suggestions.push({ type: "Lab", label: lab.name, sub: lab.location, labId: lab.id });
      }
      for (const test of lab.tests) {
        if (lower(test.name).includes(q) || lower(test.description).includes(q)) {
          suggestions.push({
            type: test.category,
            label: test.name,
            sub: `${lab.name} | from Rs. ${bestPrice(test.mrp, lab)}`,
            labId: lab.id,
            testId: test.id
          });
        }
      }
    }
    for (const location of new Set(state.labs.map((lab) => lab.location))) {
      if (lower(location).includes(q)) {
        suggestions.push({ type: "Location", label: location, sub: "View labs in this location", search: location });
      }
    }
    return { body: suggestions.slice(0, 8) };
  }

  if (method === "GET" && url.pathname === "/api/testimonials") {
    return { body: state.testimonials };
  }

  if (method === "POST" && url.pathname === "/api/newsletter") {
    requireFields(body, ["email"]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw httpError(400, "Valid email is required");
    if (!state.subscribers.includes(body.email)) state.subscribers.push(body.email);
    notify(state, "email", body.email, "Welcome to Healthy Updates", "You are subscribed to the Yello newsletter.");
    return { status: 201, body: { subscribed: true, email: body.email } };
  }

  if (method === "POST" && url.pathname === "/api/prescriptions") {
    requireFields(body, ["mobile", "fileName"]);
    const prescription = {
      id: createId("rx"),
      mobile: body.mobile,
      fileName: body.fileName,
      note: body.note || "",
      createdAt: new Date().toISOString()
    };
    state.prescriptions.unshift(prescription);
    notify(state, "admin", "admin@yello.test", "Prescription booking request", `Prescription ${prescription.fileName} uploaded from ${body.mobile}. Call back to complete the booking.`);
    return { status: 201, body: prescription };
  }

  if (method === "GET" && parts[1] === "labs" && parts[2]) {
    const lab = findLab(state, parts[2]);
    return { body: labDetail(lab, state) };
  }

  if (method === "GET" && url.pathname === "/api/packages") {
    return {
      body: state.labs.flatMap((lab) =>
        lab.tests
          .filter((test) => test.category === "Package")
          .map((test) => {
            const others = lab.tests.filter((item) => item.id !== test.id);
            return {
              ...test,
              labId: lab.id,
              labName: lab.name,
              location: lab.location,
              branded: lab.branded,
              rating: lab.rating,
              reviewCount: lab.reviewCount,
              maxDiscountPercent: maxDiscount(lab),
              bestPrice: bestPrice(test.mrp, lab),
              upsell: others.length
                ? { count: others.length, price: Math.round(others.reduce((sum, item) => sum + bestPrice(item.mrp, lab), 0) / 10) * 10 }
                : null
            };
          })
      )
    };
  }

  if (method === "POST" && url.pathname === "/api/auth/request-otp") {
    requireFields(body, ["mobile"]);
    const otp = body.mobile === "9876543210" ? "123456" : String(Math.floor(100000 + Math.random() * 900000));
    state.otpCodes.set(body.mobile, otp);
    return {
      status: 201,
      body: {
        mobile: body.mobile,
        delivery: "sms",
        prototypeOtp: otp
      }
    };
  }

  if (method === "POST" && url.pathname === "/api/auth/verify-otp") {
    requireFields(body, ["mobile", "otp"]);
    if (state.otpCodes.get(body.mobile) !== body.otp) {
      throw httpError(401, "Invalid OTP");
    }
    let consumer = state.consumers.find((item) => item.mobile === body.mobile);
    if (!consumer) {
      requireFields(body, ["name", "email"]);
      validateConsumer(body);
      consumer = {
        id: createId("c"),
        mobile: body.mobile,
        name: body.name.trim(),
        email: body.email.trim(),
        patients: [],
        addresses: []
      };
      state.consumers.push(consumer);
      notify(state, "email", consumer.email, "Welcome to Yello", `Welcome ${consumer.name}. Your Yello account is ready.`);
    } else if ((!consumer.name || !consumer.email) && body.name && body.email) {
      validateConsumer(body);
      consumer.name = body.name.trim();
      consumer.email = body.email.trim();
    }
    return { body: { consumer, token: `proto-token-${consumer.id}` } };
  }

  if (method === "POST" && url.pathname === "/api/admin/login") {
    requireFields(body, ["email", "password"]);
    if (body.email !== state.adminUser.email || body.password !== state.adminUser.password) {
      throw httpError(401, "Invalid admin credentials");
    }
    return { body: { name: state.adminUser.name, email: state.adminUser.email, token: ADMIN_TOKEN } };
  }

  if (method === "POST" && url.pathname === "/api/doctor/login") {
    requireFields(body, ["email", "password"]);
    const doctor = state.doctors.find((item) => item.email === body.email);
    if (!doctor || doctor.password !== body.password) throw httpError(401, "Invalid email or password");
    return { body: { doctor: doctorPublic(doctor), mustChangePassword: doctor.mustChangePassword, token: `proto-doctor-${doctor.id}` } };
  }

  if (method === "POST" && url.pathname === "/api/doctor/password") {
    requireFields(body, ["doctorId", "currentPassword", "newPassword"]);
    const doctor = findDoctor(state, body.doctorId);
    if (doctor.password !== body.currentPassword) throw httpError(401, "Current password is incorrect");
    if (String(body.newPassword).length < 6) throw httpError(400, "New password must be at least 6 characters");
    doctor.password = body.newPassword;
    doctor.mustChangePassword = false;
    return { body: { changed: true } };
  }

  if (method === "PATCH" && url.pathname === "/api/doctor/profile") {
    requireFields(body, ["doctorId"]);
    const doctor = findDoctor(state, body.doctorId);
    if (body.consultationMinutes !== undefined) {
      const minutes = Number(body.consultationMinutes);
      if (![5, 10, 15, 20].includes(minutes)) throw httpError(400, "Consultation minutes must be 5, 10, 15, or 20");
      doctor.consultationMinutes = minutes;
    }
    if (body.availability) {
      doctor.availability = {
        days: body.availability.days || doctor.availability.days,
        startHour: Number(body.availability.startHour ?? doctor.availability.startHour),
        endHour: Number(body.availability.endHour ?? doctor.availability.endHour)
      };
    }
    if (body.zoomConnected !== undefined) doctor.zoomConnected = Boolean(body.zoomConnected);
    return { body: doctorPublic(doctor) };
  }

  if (method === "GET" && url.pathname === "/api/doctor/notifications") {
    const doctorId = url.searchParams.get("doctorId");
    return { body: state.notifications.filter((item) => item.channel === "web" && item.to === doctorId) };
  }

  if (method === "GET" && parts[1] === "consumers" && parts[2] && !parts[3]) {
    return { body: findConsumer(state, parts[2]) };
  }

  if (method === "GET" && parts[1] === "consumers" && parts[3] === "bookings") {
    const consumer = findConsumer(state, parts[2]);
    return { body: state.bookings.filter((booking) => booking.consumerId === consumer.id) };
  }

  if (method === "GET" && parts[1] === "consumers" && parts[3] === "consultations") {
    const consumer = findConsumer(state, parts[2]);
    return { body: state.consultations.filter((item) => item.consumerId === consumer.id) };
  }

  if (method === "POST" && parts[1] === "consumers" && parts[3] === "addresses") {
    requireFields(body, ["label", "line"]);
    const consumer = findConsumer(state, parts[2]);
    const address = { id: createId("a"), label: body.label.trim(), line: body.line.trim() };
    consumer.addresses.push(address);
    return { status: 201, body: address };
  }

  if (method === "POST" && url.pathname === "/api/patients") {
    requireFields(body, ["consumerId", "name", "age", "gender"]);
    const consumer = findConsumer(state, body.consumerId);
    const patient = { id: createId("p"), name: body.name.trim(), age: Number(body.age), gender: body.gender };
    consumer.patients.push(patient);
    return { status: 201, body: patient };
  }

  if (method === "POST" && url.pathname === "/api/bookings") {
    requireFields(body, ["consumerId", "labId", "testId", "visitType", "appointmentDate", "hour", "patient"]);
    const consumer = findConsumer(state, body.consumerId);
    if (!consumer.email) throw httpError(400, "Email is required before booking");
    const lab = findLab(state, body.labId);
    const test = findTest(lab, body.testId);
    validateVisitType(lab, body.visitType);
    const slot = findComputedSlot(state, lab, body.appointmentDate, body.hour);
    let address = lab.address;
    if (body.visitType === "Home collection") {
      requireFields(body, ["address"]);
      address = String(body.address).trim();
      if (body.saveAddress && !consumer.addresses.some((item) => item.line === address)) {
        consumer.addresses.push({ id: createId("a"), label: body.addressLabel || "Home", line: address });
      }
    }
    const patient = normalizePatient(consumer, body.patient);
    const question = body.question && body.question.text
      ? {
          text: String(body.question.text).trim(),
          prescriptionName: body.question.prescriptionName || null,
          response: null,
          askedAt: new Date().toISOString()
        }
      : null;
    const booking = {
      id: createId("b"),
      consumerId: consumer.id,
      patient,
      labId: lab.id,
      labName: lab.name,
      testId: test.id,
      testName: test.name,
      visitType: body.visitType,
      address,
      appointmentDate: body.appointmentDate,
      hour: Number(body.hour),
      slotLabel: slot.label,
      originalPrice: test.mrp,
      discountPercent: slot.discountPercent,
      finalPrice: calculatePrice(test.mrp, slot.discountPercent),
      question,
      paymentStatus: "pending",
      paymentReference: null,
      status: "awaiting_payment",
      createdAt: new Date().toISOString()
    };
    state.bookings.unshift(booking);
    return { status: 201, body: booking };
  }

  if (method === "POST" && url.pathname === "/api/payments") {
    requireFields(body, ["bookingId", "outcome"]);
    const booking = findBooking(state, body.bookingId);
    const consumer = findConsumer(state, booking.consumerId);
    if (booking.paymentStatus === "paid") throw httpError(400, "Booking is already paid");
    if (body.outcome === "failure") {
      booking.paymentStatus = "failed";
      notify(state, "email", consumer.email, "Payment failed", `Payment for ${booking.testName} could not be processed. Please retry to confirm your slot.`);
      notify(state, "sms", consumer.mobile, "Payment failed", `Yello: payment for booking ${booking.id} failed. Retry to confirm.`);
      return { body: booking };
    }
    booking.paymentStatus = "paid";
    booking.status = "upcoming";
    booking.paymentReference = `rzp_proto_${Date.now()}`;
    const invoiceId = `INV-${booking.id.slice(2).toUpperCase()}`;
    notify(state, "email", consumer.email, "Booking confirmed", `${booking.testName} at ${booking.labName} is confirmed for ${booking.appointmentDate} ${booking.slotLabel}. Show this email at the lab as reference: ${booking.id}.`);
    notify(state, "sms", consumer.mobile, "Booking confirmed", `Yello booking ${booking.id}: ${booking.appointmentDate} ${booking.slotLabel}. Show this SMS as reference.`);
    notify(state, "email", consumer.email, `Invoice ${invoiceId}`, `Invoice ${invoiceId} for ${booking.testName}: Rs. ${booking.finalPrice} (MRP Rs. ${booking.originalPrice}, ${booking.discountPercent}% off).`);
    notify(state, "admin", "admin@yello.test", "New booking", `${consumer.name} booked ${booking.testName} at ${booking.labName}.`);
    if (booking.question) {
      notify(state, "admin", "admin@yello.test", "New consumer question", `${consumer.name} asked: ${booking.question.text}`);
    }
    return { body: booking };
  }

  if (method === "PATCH" && parts[1] === "bookings" && parts[2] && parts[3] === "reschedule") {
    requireFields(body, ["appointmentDate", "hour"]);
    const booking = findBooking(state, parts[2]);
    const lab = findLab(state, booking.labId);
    const consumer = findConsumer(state, booking.consumerId);
    const slot = findComputedSlot(state, lab, body.appointmentDate, body.hour);
    booking.appointmentDate = body.appointmentDate;
    booking.hour = Number(body.hour);
    booking.slotLabel = slot.label;
    // A paid booking's amount is locked — moving the slot must not silently
    // rewrite what was collected (that would corrupt revenue and MIS totals).
    // Only re-price bookings that haven't been paid yet.
    if (booking.paymentStatus !== "paid") {
      booking.discountPercent = slot.discountPercent;
      booking.finalPrice = calculatePrice(booking.originalPrice, slot.discountPercent);
    }
    booking.status = "rescheduled";
    notify(state, "sms", consumer.mobile, "Booking rescheduled", `Booking ${booking.id} moved to ${body.appointmentDate} ${slot.label}.`);
    return { body: booking };
  }

  if (method === "GET" && url.pathname === "/api/doctors") {
    return { body: state.doctors.map(doctorPublic) };
  }

  if (method === "POST" && url.pathname === "/api/consultations") {
    requireFields(body, ["consumerId", "bookingId", "doctorId", "type", "slot"]);
    const booking = findBooking(state, body.bookingId);
    const doctor = state.doctors.find((item) => item.id === body.doctorId);
    if (!doctor) throw httpError(404, "Doctor not found");
    if (body.type === "Tele" && !doctor.zoomConnected) throw httpError(400, "Selected doctor has not connected Zoom");
    const consultation = {
      id: createId("consult"),
      bookingId: booking.id,
      consumerId: body.consumerId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      patientName: booking.patient.name,
      patientGender: booking.patient.gender,
      testName: booking.testName,
      labName: booking.labName,
      type: body.type,
      slot: body.slot,
      durationMinutes: doctor.consultationMinutes,
      zoomLink: body.type === "Tele" ? `https://zoom.us/j/proto-${createId("zm").slice(3)}` : null,
      startedAt: null,
      status: "upcoming",
      messages: []
    };
    notify(state, "web", doctor.id, "New consultation appointment", `${booking.patient.name} booked a ${body.type} consultation for ${body.slot}.`);
    state.consultations.unshift(consultation);
    notify(state, "email", findConsumer(state, body.consumerId).email, "Doctor consultation confirmed", `${doctor.name} is confirmed for ${body.slot}.`);
    return { status: 201, body: consultation };
  }

  if (method === "GET" && parts[1] === "consultations" && parts[2] && !parts[3]) {
    return { body: findConsultation(state, parts[2]) };
  }

  if (method === "POST" && parts[1] === "consultations" && parts[2] && parts[3] === "messages") {
    requireFields(body, ["from", "text"]);
    const consultation = findConsultation(state, parts[2]);
    if (consultation.type !== "Chat") throw httpError(400, "Messaging is available for chat consultations only");
    // Spec 3.3.2.4: the timer starts with the doctor's first message and
    // messaging is blocked once the consultation time has ended.
    if (consultation.startedAt) {
      const endsAt = new Date(consultation.startedAt).getTime() + consultation.durationMinutes * 60000;
      if (Date.now() > endsAt) {
        consultation.status = "completed";
        throw httpError(400, "Consultation time has ended");
      }
    }
    if (!consultation.startedAt && body.from === "doctor") {
      consultation.startedAt = new Date().toISOString();
    }
    consultation.messages.push({
      from: body.from,
      text: body.text,
      fileName: body.fileName || null,
      sentAt: new Date().toISOString()
    });
    if (body.from === "consumer") {
      notify(state, "web", consultation.doctorId, "New chat message", body.text);
    }
    return { status: 201, body: consultation };
  }

  if (method === "GET" && url.pathname === "/api/doctor/dashboard") {
    const doctorId = url.searchParams.get("doctorId") || state.doctors[0].id;
    const search = lower(url.searchParams.get("search") || "");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    let rows = state.consultations.filter((item) => item.doctorId === doctorId);
    if (search) {
      rows = rows.filter((item) => lower(Object.values(item).join(" ")).includes(search));
    }
    if (from) rows = rows.filter((item) => item.slot.slice(0, 10) >= from);
    if (to) rows = rows.filter((item) => item.slot.slice(0, 10) <= to);
    return {
      body: {
        quickNumbers: {
          total: rows.length,
          upcoming: rows.filter((item) => item.status !== "completed").length,
          completed: rows.filter((item) => item.status === "completed").length
        },
        appointments: rows
      }
    };
  }

  if (method === "GET" && url.pathname === "/api/admin/overview") {
    return {
      body: {
        labs: state.labs.length,
        featuredLabs: state.labs.filter((lab) => lab.featured).length,
        bookings: state.bookings.length,
        consultations: state.consultations.length,
        revenue: state.bookings.filter((item) => item.paymentStatus === "paid").reduce((sum, item) => sum + item.finalPrice, 0),
        openQuestions: state.bookings.filter((item) => item.question && !item.question.response).length,
        subscribers: state.subscribers.length,
        prescriptions: state.prescriptions.length,
        notifications: state.notifications.length
      }
    };
  }

  if (method === "GET" && url.pathname === "/api/admin/labs") {
    return { body: state.labs };
  }

  if (method === "GET" && url.pathname === "/api/admin/bookings") {
    return {
      body: state.bookings.map((booking) => ({
        ...booking,
        consumerName: state.consumers.find((item) => item.id === booking.consumerId)?.name || "Consumer",
        consumerMobile: state.consumers.find((item) => item.id === booking.consumerId)?.mobile || ""
      }))
    };
  }

  if (method === "PATCH" && parts[1] === "admin" && parts[2] === "bookings" && parts[3] && parts[4] === "status") {
    requireFields(body, ["status"]);
    if (!["upcoming", "completed", "cancelled"].includes(body.status)) throw httpError(400, "Unknown status");
    const booking = findBooking(state, parts[3]);
    booking.status = body.status;
    return { body: booking };
  }

  if (method === "GET" && url.pathname === "/api/admin/prescriptions") {
    return { body: state.prescriptions };
  }

  // Spec 3.2.4 item 9: admin closes hours that were booked offline at the lab.
  if (method === "POST" && parts[1] === "admin" && parts[2] === "labs" && parts[3] && parts[4] === "closures") {
    requireFields(body, ["date", "hour"]);
    const lab = findLab(state, parts[3]);
    const hour = Number(body.hour);
    const existing = lab.closures.findIndex((item) => item.date === body.date && item.hour === hour);
    if (existing >= 0) {
      lab.closures.splice(existing, 1);
    } else {
      lab.closures.push({ date: body.date, hour });
    }
    return { body: { closures: lab.closures } };
  }

  if (method === "GET" && url.pathname === "/api/admin/questions") {
    return {
      body: state.bookings
        .filter((booking) => booking.question)
        .map((booking) => ({
          bookingId: booking.id,
          consumerId: booking.consumerId,
          consumerName: state.consumers.find((item) => item.id === booking.consumerId)?.name || "Consumer",
          testName: booking.testName,
          labName: booking.labName,
          question: booking.question
        }))
    };
  }

  if (method === "PATCH" && parts[1] === "admin" && parts[2] === "bookings" && parts[3] && parts[4] === "question") {
    requireFields(body, ["response"]);
    const booking = findBooking(state, parts[3]);
    if (!booking.question) throw httpError(400, "Booking has no question");
    const consumer = findConsumer(state, booking.consumerId);
    booking.question.response = String(body.response).trim();
    booking.question.respondedAt = new Date().toISOString();
    notify(state, "email", consumer.email, "Yello answered your question", booking.question.response);
    return { body: booking };
  }

  if (method === "POST" && url.pathname === "/api/admin/labs") {
    requireFields(body, ["name", "location"]);
    const lab = {
      id: createId("lab"),
      name: body.name.trim(),
      location: body.location.trim(),
      distanceKm: Number(body.distanceKm || 8),
      rating: Number(body.rating || 4),
      reviewCount: Number(body.reviewCount || 0),
      featured: Boolean(body.featured),
      branded: Boolean(body.branded),
      homeCollection: Boolean(body.homeCollection),
      labVisit: true,
      accreditation: body.accreditation || "ISO",
      address: body.address || "",
      description: body.description || "New diagnostic partner added from the admin portal.",
      openHour: 7,
      closeHour: 19,
      standardDiscountPercent: 10,
      defaultCapacity: 4,
      closures: [],
      reviews: [],
      tests: [],
      slots: [{ id: createId("slot"), startHour: 15, endHour: 17, discountPercent: Number(body.discountPercent || 10), capacity: 4 }]
    };
    state.labs.unshift(lab);
    return { status: 201, body: lab };
  }

  if (method === "PATCH" && parts[1] === "admin" && parts[2] === "labs" && parts[3] && !parts[4]) {
    const lab = findLab(state, parts[3]);
    Object.assign(lab, pick(body, ["name", "location", "featured", "branded", "homeCollection", "labVisit", "description", "address", "openHour", "closeHour", "standardDiscountPercent"]));
    return { body: lab };
  }

  if (method === "PATCH" && parts[1] === "admin" && parts[2] === "labs" && parts[3] && parts[4] === "slots" && parts[5]) {
    const lab = findLab(state, parts[3]);
    const slot = lab.slots.find((item) => item.id === parts[5]);
    if (!slot) throw httpError(404, "Slot not found");
    if (body.startHour !== undefined) slot.startHour = Number(body.startHour);
    if (body.endHour !== undefined) slot.endHour = Number(body.endHour);
    if (body.discountPercent !== undefined) {
      const discount = Number(body.discountPercent);
      if (discount < 0 || discount > 90) throw httpError(400, "Discount must be between 0 and 90");
      slot.discountPercent = discount;
    }
    if (body.capacity !== undefined) slot.capacity = Number(body.capacity);
    return { body: slot };
  }

  if (method === "GET" && url.pathname === "/api/notifications") {
    return { body: state.notifications };
  }

  /* ---------- centre onboarding (supply side) ---------- */

  if (method === "POST" && url.pathname === "/api/centre/apply") {
    requireFields(body, ["centre", "owner", "phone"]);
    const lead = {
      id: createId("lead"),
      centre: String(body.centre).trim(),
      owner: String(body.owner).trim(),
      phone: String(body.phone).trim(),
      email: body.email || "",
      city: body.city || "",
      locality: body.locality || "",
      modalities: Array.isArray(body.modalities) ? body.modalities : [],
      nabl: body.nabl || "",
      pcpndt: body.pcpndt || "",
      volume: body.volume || "",
      idle: body.idle || "",
      notes: body.notes || "",
      source: "partner-site",
      status: "Applied",
      createdAt: new Date().toISOString()
    };
    state.centreLeads.unshift(lead);
    notify(state, "admin", "admin@yello.test", "New centre application", `${lead.centre} (${lead.owner}, ${lead.phone}) applied to the pilot.`);
    return { status: 201, body: lead };
  }

  if (method === "POST" && url.pathname === "/api/centre/auth/request-otp") {
    requireFields(body, ["mobile"]);
    const otp = "123456";
    state.centreOtps.set(String(body.mobile), otp);
    return { status: 201, body: { mobile: body.mobile, delivery: "sms", prototypeOtp: otp } };
  }

  if (method === "POST" && url.pathname === "/api/centre/auth/verify-otp") {
    requireFields(body, ["mobile", "otp"]);
    if (state.centreOtps.get(String(body.mobile)) !== body.otp) throw httpError(401, "Invalid OTP");
    let centre = state.centres.find((item) => item.mobile === String(body.mobile));
    if (!centre) {
      centre = {
        id: createId("ct"),
        mobile: String(body.mobile),
        name: body.name ? String(body.name).trim() : "",
        owner: "",
        status: "In onboarding",
        tier: "",
        sections: {},
        review: {},
        leadId: null,
        createdAt: new Date().toISOString(),
        submittedAt: null
      };
      state.centres.unshift(centre);
    } else if (centre.status === "Invited") {
      centre.status = "In onboarding";
    }
    return { body: centrePublic(centre) };
  }

  if (method === "GET" && parts[1] === "centre" && parts[2] === "centres" && parts[3] && !parts[4]) {
    return { body: centrePublic(findCentre(state, parts[3])) };
  }

  if (method === "PATCH" && parts[1] === "centre" && parts[2] === "centres" && parts[3] && !parts[4]) {
    const centre = findCentre(state, parts[3]);
    if (body.tier !== undefined) centre.tier = body.tier;
    if (body.name) centre.name = String(body.name).trim();
    if (body.sections && typeof body.sections === "object") {
      for (const [key, val] of Object.entries(body.sections)) {
        centre.sections[key] = { ...(centre.sections[key] || {}), ...val };
      }
    }
    return { body: centrePublic(centre) };
  }

  if (method === "POST" && parts[1] === "centre" && parts[2] === "centres" && parts[3] && parts[4] === "submit") {
    const centre = findCentre(state, parts[3]);
    centre.status = "Under review";
    centre.submittedAt = new Date().toISOString();
    notify(state, "admin", "admin@yello.test", "Centre onboarding submitted", `${centre.name || centre.mobile} submitted onboarding for verification.`);
    return { body: centrePublic(centre) };
  }

  if (method === "GET" && url.pathname === "/api/admin/centre-leads") {
    return { body: state.centreLeads };
  }

  if (method === "GET" && url.pathname === "/api/admin/centres") {
    return { body: state.centres.map(centrePublic) };
  }

  if (method === "POST" && parts[1] === "admin" && parts[2] === "centre-leads" && parts[3] && parts[4] === "invite") {
    const lead = state.centreLeads.find((item) => item.id === parts[3]);
    if (!lead) throw httpError(404, "Lead not found");
    let centre = state.centres.find((item) => item.mobile === lead.phone);
    if (!centre) {
      centre = {
        id: createId("ct"),
        mobile: lead.phone,
        name: lead.centre,
        owner: lead.owner,
        status: "Invited",
        tier: body.tier || "",
        sections: {
          identity: { legalName: lead.centre, city: lead.city, locality: lead.locality },
          catalogue: { modalities: lead.modalities }
        },
        review: {},
        leadId: lead.id,
        createdAt: new Date().toISOString(),
        submittedAt: null
      };
      state.centres.unshift(centre);
    }
    lead.status = "Invited";
    notify(state, "sms", lead.phone, "You're invited to Yello", `Complete your centre onboarding at /centre — log in with ${lead.phone}.`);
    return { status: 201, body: centrePublic(centre) };
  }

  if (method === "PATCH" && parts[1] === "admin" && parts[2] === "centres" && parts[3] && parts[4] === "review") {
    const centre = findCentre(state, parts[3]);
    centre.review = { ...(centre.review || {}), ...(body.review || {}) };
    if (body.status) {
      centre.status = body.status;
      // Go-live is tech, not ops: approval creates the marketplace listing
      // straight from the onboarding data. The centre is instantly bookable.
      if (/Verified/.test(body.status) && !(centre.live && centre.live.labId)) {
        const lab = createLabFromCentre(state, centre);
        centre.live = { labId: lab.id, goLiveDate: new Date().toISOString().slice(0, 10) };
        notify(state, "sms", centre.mobile, "You are live on Yello", `${centre.name || "Your centre"} is now listed — Yello demand starts routing to you.`);
      } else if (/hold|Rejected/i.test(body.status) && centre.live && centre.live.labId) {
        // Suspending or rejecting a live centre must pull its listing off the
        // marketplace — otherwise patients keep booking a rejected centre.
        state.labs = state.labs.filter((lab) => lab.id !== centre.live.labId);
        centre.live = null;
        notify(state, "sms", centre.mobile, "Listing paused", `${centre.name || "Your centre"} has been ${/Rejected/i.test(body.status) ? "removed from" : "paused on"} the Yello network.`);
      }
    }
    return { body: centrePublic(centre) };
  }

  // Centre console: bookings for its listing + the MIS with Yello-sourced
  // attribution + the per-month settlement (the per-centre P&L, live).
  if (method === "GET" && parts[1] === "centre" && parts[2] === "centres" && parts[3] && parts[4] === "console") {
    const centre = findCentre(state, parts[3]);
    if (!centre.live || !centre.live.labId) throw httpError(400, "Centre is not live yet");
    const labId = centre.live.labId;
    const bookings = state.bookings
      .filter((booking) => booking.labId === labId)
      .map((booking) => ({
        ...booking,
        consumerName: state.consumers.find((item) => item.id === booking.consumerId)?.name || "Consumer"
      }));
    const financials = (centre.sections && centre.sections.financials) || {};
    const deal = computeCentreDeal(centre);
    const omTotal = Object.values(financials.expenses || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const liveYello = bookings
      .filter((booking) => booking.paymentStatus === "paid")
      .reduce((sum, booking) => sum + booking.finalPrice, 0);
    const monthNow = new Date().toISOString().slice(0, 7);
    const history = [...(centre.mis || [])];
    const ownNow = Number(financials.currentRunRate) || (history.length ? history[history.length - 1].ownBook : 0);
    history.push({ month: monthNow, ownBook: ownNow, yello: (centre.misCurrentBase || 0) + liveYello, current: true });
    const months = history.map((m) => {
      const gross = m.ownBook + m.yello;
      const ebitda = gross - omTotal;
      let ownerPayout, yelloNet;
      if (centre.tier === "Marketplace") {
        // 10–15% take on Yello-sourced bookings only; owner keeps everything else.
        yelloNet = Math.round(0.12 * m.yello);
        ownerPayout = gross - yelloNet;
      } else if (centre.tier === "Branded") {
        // Brand licence + platform fee (~10% of gross); owner keeps operating profit net of the fee.
        yelloNet = Math.round(0.10 * gross);
        ownerPayout = Math.max(0, ebitda - yelloNet);
      } else {
        // Fully Managed: owner keeps a guaranteed floor; Yello captures the operating economics.
        ownerPayout = Math.max(deal.guarantee, Math.round(0.05 * gross));
        yelloNet = ebitda - ownerPayout;
      }
      return { ...m, gross, mix: gross ? Math.round((m.yello / gross) * 100) : 0, om: omTotal, ebitda, ownerPayout, yelloNet };
    });
    const bestGross = Math.max(...months.slice(-2).map((m) => m.gross));
    const span = Math.max(deal.targetRunRate - deal.baselineRunRate, 1);
    const facility = (centre.sections && centre.sections.facility) || {};
    return {
      body: {
        months,
        deal,
        bookings,
        progressPct: Math.max(0, Math.min(100, Math.round(((bestGross - deal.baselineRunRate) / span) * 100))),
        utilizationPct: facility.capacityPerDay ? Math.round(((facility.currentPerDay || 0) / facility.capacityPerDay) * 100) : null,
        goLiveDate: centre.live.goLiveDate
      }
    };
  }

  // Centre fulfils a booking: sample collected → report uploaded.
  if (method === "PATCH" && parts[1] === "centre" && parts[2] === "bookings" && parts[3] && parts[4] === "fulfil") {
    requireFields(body, ["centreId", "action"]);
    const centre = findCentre(state, body.centreId);
    const booking = findBooking(state, parts[3]);
    if (!centre.live || booking.labId !== centre.live.labId) throw httpError(403, "Booking does not belong to this centre");
    const consumer = findConsumer(state, booking.consumerId);
    if (body.action === "collected") {
      booking.status = "sample_collected";
      notify(state, "sms", consumer.mobile, "Sample collected", `Yello: ${booking.testName} — sample/scan completed. Report on its way.`);
    } else if (body.action === "report") {
      requireFields(body, ["reportName"]);
      booking.status = "completed";
      booking.reportName = String(body.reportName);
      const generated = buildReport(booking.testName, booking.appointmentDate);
      if (generated) booking.report = generated;
      notify(state, "email", consumer.email, "Your report is ready", `${booking.testName} report (${booking.reportName}) is ready in your Yello account — explained in plain language, with your twin updated.`);
    } else {
      throw httpError(400, "Unknown action");
    }
    return { body: booking };
  }

  throw httpError(404, "Route not found");
}

const portalRoutes = {
  "/": "/index.html",
  "/admin": "/admin.html",
  "/doctor": "/doctor.html",
  "/centre": "/centre.html",
  "/about": "/about.html"
};

async function serveStatic(pathname, res) {
  const safePath = normalize(portalRoutes[pathname] || pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(file);
  } catch {
    const file = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": mimeTypes[".html"], "Cache-Control": "no-cache" });
    res.end(file);
  }
}

// Spec 3.2.4: hourly slots for today + next 2 days, starting at least 1 hour
// from "now", priced by the lab's Yello-hour windows and blocked by capacity.
export function computeSlotDays(lab, state, now = new Date()) {
  const days = [];
  for (let offset = 0; offset < 3; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const date = isoDate(day);
    const dayLabel = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : day.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const minHour = offset === 0 ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 60) / 60) : lab.openHour;
    const slots = [];
    for (let hour = Math.max(lab.openHour, minHour); hour < lab.closeHour; hour++) {
      const window = lab.slots.find((item) => hour >= item.startHour && hour < item.endHour);
      const discountPercent = window ? window.discountPercent : lab.standardDiscountPercent;
      const capacity = window ? window.capacity : lab.defaultCapacity;
      const booked = state.bookings.filter((booking) =>
        booking.labId === lab.id &&
        booking.appointmentDate === date &&
        booking.hour === hour &&
        booking.paymentStatus === "paid" &&
        booking.status !== "cancelled"
      ).length;
      const closed = (lab.closures || []).some((item) => item.date === date && item.hour === hour);
      slots.push({
        hour,
        label: `${formatHour(hour)} - ${formatHour(hour + 1)}`,
        discountPercent,
        yelloHour: Boolean(window),
        capacity,
        closed,
        remaining: closed ? 0 : Math.max(capacity - booked, 0),
        available: !closed && booked < capacity
      });
    }
    days.push({ date, dayLabel, slots });
  }
  return days;
}

function findComputedSlot(state, lab, date, hour) {
  const day = computeSlotDays(lab, state).find((item) => item.date === date);
  const slot = day?.slots.find((item) => item.hour === Number(hour));
  if (!slot) throw httpError(400, "Selected time slot is not open for booking");
  if (!slot.available) throw httpError(409, "Selected time slot is fully booked");
  return slot;
}

function formatHour(hour) {
  const display = ((hour + 11) % 12) + 1;
  return `${display}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function maxDiscount(lab) {
  return Math.max(lab.standardDiscountPercent, ...lab.slots.map((slot) => slot.discountPercent));
}

function labSummary(lab, state) {
  const cheapest = lab.tests.length
    ? lab.tests.reduce((min, test) => Math.min(min, bestPrice(test.mrp, lab)), Infinity)
    : 0;
  return {
    id: lab.id,
    name: lab.name,
    location: lab.location,
    distanceKm: lab.distanceKm,
    rating: lab.rating,
    reviewCount: lab.reviewCount,
    featured: lab.featured,
    branded: lab.branded,
    accreditation: lab.accreditation,
    services: [lab.homeCollection ? "Home collection" : null, lab.labVisit ? "Lab visit" : null].filter(Boolean),
    packageNames: lab.tests.map((test) => test.name),
    offerText: `Up to ${maxDiscount(lab)}% off`,
    startingPrice: cheapest,
    slotDays: computeSlotDays(lab, state)
  };
}

function labDetail(lab, state) {
  return {
    ...lab,
    tests: lab.tests.map((test) => ({
      ...test,
      bestPrice: bestPrice(test.mrp, lab)
    })),
    slotDays: computeSlotDays(lab, state)
  };
}

function sortLabs(sort) {
  return (a, b) => {
    if (sort === "price_desc") return b.startingPrice - a.startingPrice;
    if (sort === "distance") return a.distanceKm - b.distanceKm;
    if (sort === "reviews") return b.rating - a.rating || b.reviewCount - a.reviewCount;
    return a.startingPrice - b.startingPrice;
  };
}

function bestPrice(mrp, lab) {
  return calculatePrice(mrp, maxDiscount(lab));
}

function calculatePrice(mrp, discountPercent) {
  return Math.round(mrp * (1 - discountPercent / 100));
}

function normalizePatient(consumer, patientInput) {
  if (patientInput.id) {
    const patient = consumer.patients.find((item) => item.id === patientInput.id);
    if (!patient) throw httpError(404, "Patient not found");
    return patient;
  }
  requireFields(patientInput, ["name", "age", "gender"]);
  const patient = {
    id: createId("p"),
    name: patientInput.name.trim(),
    age: Number(patientInput.age),
    gender: patientInput.gender
  };
  consumer.patients.push(patient);
  return patient;
}

function validateVisitType(lab, visitType) {
  if (visitType === "Home collection" && !lab.homeCollection) throw httpError(400, "Home collection is not offered by this lab");
  if (visitType === "Lab visit" && !lab.labVisit) throw httpError(400, "Lab visit is not offered by this lab");
}

function validateConsumer(body) {
  if (!/^[a-zA-Z ]+$/.test(body.name || "")) throw httpError(400, "Name can contain only letters and spaces");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || "")) throw httpError(400, "Valid email is required");
}

function findLab(state, id) {
  const lab = state.labs.find((item) => item.id === id);
  if (!lab) throw httpError(404, "Lab not found");
  return lab;
}

function findTest(lab, id) {
  const test = lab.tests.find((item) => item.id === id);
  if (!test) throw httpError(404, "Test not found");
  return test;
}

function doctorPublic(doctor) {
  const { password, ...publicFields } = doctor;
  return publicFields;
}

function findDoctor(state, id) {
  const doctor = state.doctors.find((item) => item.id === id);
  if (!doctor) throw httpError(404, "Doctor not found");
  return doctor;
}

function findConsumer(state, id) {
  const consumer = state.consumers.find((item) => item.id === id);
  if (!consumer) throw httpError(404, "Consumer not found");
  return consumer;
}

function findBooking(state, id) {
  const booking = state.bookings.find((item) => item.id === id);
  if (!booking) throw httpError(404, "Booking not found");
  return booking;
}

function findConsultation(state, id) {
  const consultation = state.consultations.find((item) => item.id === id);
  if (!consultation) throw httpError(404, "Consultation not found");
  return consultation;
}

function findCentre(state, id) {
  const centre = state.centres.find((item) => item.id === id);
  if (!centre) throw httpError(404, "Centre not found");
  return centre;
}

// Build a bookable marketplace listing from a verified centre's onboarding data.
function createLabFromCentre(state, centre) {
  const s = centre.sections || {};
  const identity = s.identity || {};
  const catalogue = s.catalogue || {};
  const facility = s.facility || {};
  const compliance = s.compliance || {};
  const rows = Array.isArray(catalogue.tests) ? catalogue.tests : [];
  const tests = rows
    .filter((row) => row[0])
    .map((row) => ({
      id: createId("test"),
      name: String(row[0]),
      category: /package|checkup/i.test(String(row[0])) ? "Package" : "Test",
      description: `Offered by ${centre.name || identity.legalName || "the centre"}.`,
      mrp: Number(row[1]) || 999,
      preTestPrep: "See booking confirmation",
      sampleType: String(row[2] || "Sample"),
      audience: "Male, Female",
      visitRequired: false
    }));
  const openHour = Number(facility.openHour) || 8;
  const closeHour = Number(facility.closeHour) || 20;
  const lab = {
    id: createId("lab"),
    name: centre.name || identity.legalName || "New Yello centre",
    location: identity.city || "Hyderabad",
    distanceKm: 6,
    rating: 4.3,
    reviewCount: 0,
    featured: false,
    branded: centre.tier === "Fully Managed",
    homeCollection: (catalogue.modalities || []).includes("Home collection") || (catalogue.modalities || []).includes("Pathology"),
    labVisit: true,
    accreditation: compliance.nabl === "Accredited" ? "NABL" : "—",
    address: [identity.locality, identity.city].filter(Boolean).join(", ") || identity.address || "",
    description: `${centre.tier || "Partner"} centre onboarded through the Yello partner flow.`,
    openHour,
    closeHour,
    standardDiscountPercent: 10,
    defaultCapacity: Number(catalogue.hourlyCapacity) || 4,
    closures: [],
    reviews: [],
    tests: tests.length ? tests : [{
      id: createId("test"),
      name: "General diagnostic visit",
      category: "Test",
      description: "Placeholder listing until the catalogue is mapped.",
      mrp: 999,
      preTestPrep: "Not required",
      sampleType: "Sample",
      audience: "Male, Female",
      visitRequired: true
    }],
    slots: [{
      id: createId("slot"),
      startHour: Math.min(14, closeHour - 2),
      endHour: Math.min(17, closeHour),
      discountPercent: Number(catalogue.yelloDiscount) || 20,
      capacity: Number(catalogue.hourlyCapacity) || 4
    }]
  };
  state.labs.unshift(lab);
  return lab;
}

// The financial-diligence numbers compute the deal automatically:
// baseline EBITDA, the owner guarantee, and the ₹50L→₹75L uplift.
function computeCentreDeal(centre) {
  const f = (centre.sections && centre.sections.financials) || {};
  const months = Array.isArray(f.revenueMonths)
    ? f.revenueMonths.map(Number).filter((n) => !Number.isNaN(n))
    : [];
  const ttm = months.reduce((sum, n) => sum + n, 0);
  const monthlyRev = months.length ? ttm / 12 : Number(f.currentRunRate) || 0;
  const exp = f.expenses || {};
  const expTotal = Object.values(exp).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const ebitda = monthlyRev - expTotal;
  const takeHome = Number(f.ownerTakeHome) || 0;
  const guarantee = Math.max(takeHome, 0.05 * monthlyRev);
  const baseline = Number(f.currentRunRate) || Math.round(monthlyRev);
  const target = Number(f.targetRunRate) || Math.round(baseline * 1.5);
  return {
    ttmRevenue: Math.round(ttm),
    monthlyRevenue: Math.round(monthlyRev),
    monthlyExpense: Math.round(expTotal),
    ebitda: Math.round(ebitda),
    ebitdaMargin: monthlyRev ? Math.round((ebitda / monthlyRev) * 100) : 0,
    ownerTakeHome: Math.round(takeHome),
    guarantee: Math.round(guarantee),
    baselineRunRate: Math.round(baseline),
    targetRunRate: Math.round(target),
    uplift: Math.round(target - baseline)
  };
}

// Document fields captured across the onboarding sections, surfaced as one
// list so the centre and the ops team can both see what's been uploaded.
const DOC_FIELDS = [
  ["compliance", "nablCert", "NABL certificate"],
  ["compliance", "pcpndtCert", "PCPNDT certificate"],
  ["financials", "docs", "Financials — P&L, 12-mo bank statements, ITRs, GST"],
  ["banking", "cheque", "Cancelled cheque / bank proof"]
];
function centreDocuments(centre) {
  const out = [];
  for (const [section, key, label] of DOC_FIELDS) {
    const val = centre.sections && centre.sections[section] && centre.sections[section][key];
    if (!val) continue;
    if (Array.isArray(val)) {
      val.forEach((f) => out.push({ section, key, label, file: f.name, type: f.type || "", dataUrl: f.dataUrl || "" }));
    } else {
      out.push({ section, key, label, file: String(val), type: "", dataUrl: "" });
    }
  }
  return out;
}

function centrePublic(centre) {
  return { ...centre, deal: computeCentreDeal(centre), documents: centreDocuments(centre) };
}

function notify(state, channel, to, subject, body) {
  state.notifications.unshift({
    id: createId("n"),
    channel,
    to,
    subject,
    body,
    createdAt: new Date().toISOString()
  });
}

async function readJson(req) {
  if (!["POST", "PATCH", "PUT"].includes(req.method || "")) return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Invalid JSON");
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw httpError(400, `${field} is required`);
    }
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function lower(value) {
  return String(value).toLowerCase();
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const state = loadState(createSeedData);
  bindPersistence(state);
  listen(undefined, state);
}
