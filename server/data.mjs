import { markerLine, summarise } from "./markers.mjs";

// A historical report for the demo consumer, so the health twin shows a
// real trajectory (Ananya's Vitamin D falling, LDL/ApoB and HbA1c drifting
// up while each single report still reads "mostly in range").
function historyReport(dateIso, values) {
  const markers = Object.entries(values).map(([key, value]) => markerLine(key, value));
  return summarise(markers, dateIso);
}

function monthsAgoIso(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function createSeedData() {
  return {
    otpCodes: new Map(),
    centreOtps: new Map(),
    adminUser: { email: "admin@yello.test", password: "admin123", name: "Yello Admin" },
    consumers: [
      {
        id: "c-1001",
        mobile: "9876543210",
        name: "Ananya Rao",
        email: "ananya@example.com",
        patients: [
          { id: "p-1001", name: "Ananya Rao", age: 34, gender: "Female" },
          { id: "p-1002", name: "Ravi Rao", age: 38, gender: "Male" }
        ],
        addresses: [
          { id: "a-1001", label: "Home", line: "Flat 21, Lake View Residency, Banjara Hills, Hyderabad 500034" }
        ]
      }
    ],
    labs: [
      {
        id: "lab-1",
        name: "Yello Prime Diagnostics",
        location: "Hyderabad",
        distanceKm: 1.8,
        rating: 4.8,
        reviewCount: 328,
        featured: true,
        branded: true,
        homeCollection: true,
        labVisit: true,
        accreditation: "NABH, ISO, NABL",
        address: "Road 12, Banjara Hills, Hyderabad",
        description: "Yello branded diagnostic partner with same-day collection, verified reports, and priority appointment windows.",
        openHour: 7,
        closeHour: 20,
        standardDiscountPercent: 15,
        defaultCapacity: 5,
        closures: [],
        reviews: [
          { author: "Meera", rating: 5, text: "Fast home collection and clear report updates." },
          { author: "Kabir", rating: 4, text: "Good pricing for full body packages." }
        ],
        tests: [
          {
            id: "test-1",
            name: "Full Body Health Checkup",
            category: "Package",
            description: "CBC, lipid profile, liver, kidney, thyroid, glucose, vitamin D and B12 markers.",
            mrp: 3499,
            preTestPrep: "10-12 hours of fasting required",
            sampleType: "Blood sample, Urine sample",
            audience: "Male, Female",
            visitRequired: false
          },
          {
            id: "test-2",
            name: "Thyroid Profile",
            category: "Test",
            description: "T3, T4 and TSH screening with digital report.",
            mrp: 799,
            preTestPrep: "Not required",
            sampleType: "Blood sample",
            audience: "Male, Female",
            visitRequired: false
          },
          {
            id: "test-3",
            name: "COVID RT-PCR",
            category: "Test",
            description: "ICMR compatible RT-PCR report for travel and medical reference.",
            mrp: 1200,
            preTestPrep: "Not required",
            sampleType: "Nasal Swab, Throat Swab",
            audience: "Male, Female",
            visitRequired: false
          }
        ],
        slots: [
          { id: "slot-1", startHour: 8, endHour: 10, discountPercent: 25, capacity: 6 },
          { id: "slot-2", startHour: 15, endHour: 17, discountPercent: 40, capacity: 8 },
          { id: "slot-3", startHour: 18, endHour: 20, discountPercent: 20, capacity: 5 }
        ]
      },
      {
        id: "lab-4",
        name: "Nova Scans & Labs",
        location: "Hyderabad",
        distanceKm: 4.2,
        rating: 4.6,
        reviewCount: 112,
        featured: true,
        branded: true,
        homeCollection: true,
        labVisit: true,
        accreditation: "NABL",
        address: "100 Feet Road, Madhapur, Hyderabad",
        description: "Fully Managed Yello centre — imaging and pathology run to the Yello standard, with Yello-hours pricing on idle capacity.",
        openHour: 7,
        closeHour: 21,
        standardDiscountPercent: 10,
        defaultCapacity: 5,
        closures: [],
        reviews: [
          { author: "Srinivas", rating: 5, text: "MRI at the Yello-hours price, report the same evening." }
        ],
        tests: [
          {
            id: "test-8",
            name: "MRI Brain (Plain)",
            category: "Test",
            description: "1.5T MRI brain study with radiologist report.",
            mrp: 7500,
            preTestPrep: "Not required",
            sampleType: "Imaging",
            audience: "Male, Female",
            visitRequired: true
          },
          {
            id: "test-9",
            name: "USG Whole Abdomen",
            category: "Test",
            description: "Ultrasound of the whole abdomen with report.",
            mrp: 1500,
            preTestPrep: "6 hours fasting, full bladder",
            sampleType: "Imaging",
            audience: "Male, Female",
            visitRequired: true
          },
          {
            id: "test-10",
            name: "Full Body Health Checkup",
            category: "Package",
            description: "CBC, lipid, liver, kidney, thyroid, glucose, vitamin D and B12.",
            mrp: 3499,
            preTestPrep: "10-12 hours fasting",
            sampleType: "Blood sample, Urine sample",
            audience: "Male, Female",
            visitRequired: false
          }
        ],
        slots: [
          { id: "slot-8", startHour: 14, endHour: 17, discountPercent: 40, capacity: 6 },
          { id: "slot-9", startHour: 19, endHour: 21, discountPercent: 20, capacity: 5 }
        ]
      },
      {
        id: "lab-2",
        name: "CarePath Labs",
        location: "Kurnool",
        distanceKm: 5.4,
        rating: 4.5,
        reviewCount: 142,
        featured: true,
        branded: false,
        homeCollection: false,
        labVisit: true,
        accreditation: "NABL, ISO",
        address: "Nandyal Road, Kurnool",
        description: "Reliable local lab with strong review scores and discounted lab-visit appointments.",
        openHour: 8,
        closeHour: 18,
        standardDiscountPercent: 10,
        defaultCapacity: 4,
        closures: [],
        reviews: [
          { author: "Sanjay", rating: 5, text: "Clean lab and punctual appointment." }
        ],
        tests: [
          {
            id: "test-4",
            name: "Diabetes Care Package",
            category: "Package",
            description: "Fasting glucose, HbA1c, kidney markers and lipid profile.",
            mrp: 1599,
            preTestPrep: "8 hours of fasting required",
            sampleType: "Blood sample, Urine sample",
            audience: "Male, Female",
            visitRequired: true
          },
          {
            id: "test-5",
            name: "CBC",
            category: "Test",
            description: "Complete blood count with platelet and differential counts.",
            mrp: 450,
            preTestPrep: "Not required",
            sampleType: "Blood sample",
            audience: "Male, Female",
            visitRequired: true
          }
        ],
        slots: [
          { id: "slot-4", startHour: 9, endHour: 11, discountPercent: 20, capacity: 4 },
          { id: "slot-5", startHour: 14, endHour: 16, discountPercent: 30, capacity: 4 }
        ]
      },
      {
        id: "lab-3",
        name: "Metro Scan Diagnostics",
        location: "Hyderabad",
        distanceKm: 3.1,
        rating: 4.2,
        reviewCount: 88,
        featured: false,
        branded: false,
        homeCollection: true,
        labVisit: true,
        accreditation: "ISO",
        address: "Madhapur Main Road, Hyderabad",
        description: "Multi-specialty diagnostics center with flexible home collection windows.",
        openHour: 7,
        closeHour: 19,
        standardDiscountPercent: 10,
        defaultCapacity: 5,
        closures: [],
        reviews: [
          { author: "Fatima", rating: 4, text: "Flexible slots and decent turnaround time." }
        ],
        tests: [
          {
            id: "test-6",
            name: "Women's Wellness Package",
            category: "Package",
            description: "Hormone, thyroid, CBC, vitamin and metabolic markers.",
            mrp: 2899,
            preTestPrep: "Morning sample preferred",
            sampleType: "Blood sample",
            audience: "Female",
            visitRequired: false
          },
          {
            id: "test-7",
            name: "Liver Function Test",
            category: "Test",
            description: "Bilirubin, SGOT, SGPT, ALP, protein and albumin panel.",
            mrp: 899,
            preTestPrep: "8 hours of fasting required",
            sampleType: "Blood sample",
            audience: "Male, Female",
            visitRequired: false
          }
        ],
        slots: [
          { id: "slot-6", startHour: 7, endHour: 9, discountPercent: 12, capacity: 5 },
          { id: "slot-7", startHour: 16, endHour: 18, discountPercent: 35, capacity: 5 }
        ]
      }
    ],
    doctors: [
      {
        id: "doc-1",
        name: "Dr. Nisha Menon",
        email: "nisha@yello.test",
        password: "yello123",
        mustChangePassword: true,
        specialty: "General Physician",
        zoomConnected: true,
        consultationMinutes: 15,
        availability: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startHour: 9, endHour: 19 },
        availableSlots: ["10:00", "12:30", "18:00"]
      },
      {
        id: "doc-2",
        name: "Dr. Arvind Shah",
        email: "arvind@yello.test",
        password: "yello123",
        mustChangePassword: true,
        specialty: "Internal Medicine",
        zoomConnected: false,
        consultationMinutes: 10,
        availability: { days: ["Mon", "Wed", "Fri", "Sat"], startHour: 10, endHour: 17 },
        availableSlots: ["09:30", "15:00", "19:30"]
      }
    ],
    testimonials: [
      { author: "Veena Dhamija", location: "Chennai", text: "Good staff, no pain when blood was given. Very clean atmosphere in the lab." },
      { author: "Deepender Singh", location: "Uttar Pradesh", text: "Best and fastest service and provided free home collection." },
      { author: "R K Jain", location: "Chennai", text: "Thank you for your exceptional service through which you sent us a wide range of reports in a day." },
      { author: "C J Tuli", location: "Mumbai", text: "I shall always remain grateful to you, sir, for saving the life of my wife." }
    ],
    subscribers: [],
    prescriptions: [],
    bookings: [
      {
        id: "b-2001",
        consumerId: "c-1001",
        patient: { id: "p-1002", name: "Ravi Rao", age: 38, gender: "Male" },
        labId: "lab-4",
        labName: "Nova Scans & Labs",
        testId: "test-8",
        testName: "MRI Brain (Plain)",
        visitType: "Lab visit",
        address: "100 Feet Road, Madhapur, Hyderabad",
        appointmentDate: nextIsoDate(0),
        hour: 15,
        slotLabel: "3:00 PM - 4:00 PM",
        originalPrice: 7500,
        discountPercent: 40,
        finalPrice: 4500,
        question: null,
        paymentStatus: "paid",
        paymentReference: "rzp_proto_2001",
        status: "upcoming",
        createdAt: new Date().toISOString()
      },
      {
        id: "b-2002",
        consumerId: "c-1001",
        patient: { id: "p-1001", name: "Ananya Rao", age: 34, gender: "Female" },
        labId: "lab-4",
        labName: "Nova Scans & Labs",
        testId: "test-10",
        testName: "Full Body Health Checkup",
        visitType: "Home collection",
        address: "Flat 21, Lake View Residency, Banjara Hills, Hyderabad 500034",
        appointmentDate: nextIsoDate(1),
        hour: 8,
        slotLabel: "8:00 AM - 9:00 AM",
        originalPrice: 3499,
        discountPercent: 10,
        finalPrice: 3149,
        question: null,
        paymentStatus: "paid",
        paymentReference: "rzp_proto_2002",
        status: "upcoming",
        createdAt: new Date().toISOString()
      },
      {
        id: "b-1001",
        consumerId: "c-1001",
        patient: { id: "p-1001", name: "Ananya Rao", age: 34, gender: "Female" },
        labId: "lab-1",
        labName: "Yello Prime Diagnostics",
        testId: "test-1",
        testName: "Full Body Health Checkup",
        visitType: "Home collection",
        address: "Flat 21, Lake View Residency, Banjara Hills, Hyderabad 500034",
        appointmentDate: nextIsoDate(2),
        hour: 15,
        slotLabel: "3:00 PM - 4:00 PM",
        originalPrice: 3499,
        discountPercent: 40,
        finalPrice: 2099,
        question: null,
        paymentStatus: "paid",
        paymentReference: "rzp_proto_1001",
        status: "upcoming",
        createdAt: new Date().toISOString()
      },
      {
        id: "b-0900",
        consumerId: "c-1001",
        patient: { id: "p-1001", name: "Ananya Rao", age: 34, gender: "Female" },
        labId: "lab-1",
        labName: "Yello Prime Diagnostics",
        testId: "test-1",
        testName: "Full Body Health Checkup",
        visitType: "Home collection",
        address: "Flat 21, Lake View Residency, Banjara Hills, Hyderabad 500034",
        appointmentDate: monthsAgoIso(24),
        hour: 8, slotLabel: "8:00 AM - 9:00 AM",
        originalPrice: 3499, discountPercent: 40, finalPrice: 2099,
        question: null, paymentStatus: "paid", paymentReference: "rzp_proto_0900",
        status: "completed",
        reportName: "ananya-fullbody-2024.pdf",
        report: historyReport(monthsAgoIso(24), { vitd: 31, hba1c: 5.3, ldl: 108, apob: 82, tsh: 2.1, hb: 13.2, crp: 0.7 }),
        createdAt: monthsAgoIso(24)
      },
      {
        id: "b-0901",
        consumerId: "c-1001",
        patient: { id: "p-1001", name: "Ananya Rao", age: 34, gender: "Female" },
        labId: "lab-1",
        labName: "Yello Prime Diagnostics",
        testId: "test-1",
        testName: "Full Body Health Checkup",
        visitType: "Home collection",
        address: "Flat 21, Lake View Residency, Banjara Hills, Hyderabad 500034",
        appointmentDate: monthsAgoIso(12),
        hour: 8, slotLabel: "8:00 AM - 9:00 AM",
        originalPrice: 3499, discountPercent: 40, finalPrice: 2099,
        question: null, paymentStatus: "paid", paymentReference: "rzp_proto_0901",
        status: "completed",
        reportName: "ananya-fullbody-2025.pdf",
        report: historyReport(monthsAgoIso(12), { vitd: 26, hba1c: 5.5, ldl: 124, apob: 91, tsh: 2.4, hb: 12.9, crp: 0.9 }),
        createdAt: monthsAgoIso(12)
      },
      {
        id: "b-0902",
        consumerId: "c-1001",
        patient: { id: "p-1001", name: "Ananya Rao", age: 34, gender: "Female" },
        labId: "lab-1",
        labName: "Yello Prime Diagnostics",
        testId: "test-1",
        testName: "Full Body Health Checkup",
        visitType: "Home collection",
        address: "Flat 21, Lake View Residency, Banjara Hills, Hyderabad 500034",
        appointmentDate: monthsAgoIso(1),
        hour: 8, slotLabel: "8:00 AM - 9:00 AM",
        originalPrice: 3499, discountPercent: 40, finalPrice: 2099,
        question: null, paymentStatus: "paid", paymentReference: "rzp_proto_0902",
        status: "completed",
        reportName: "ananya-fullbody-2026.pdf",
        report: historyReport(monthsAgoIso(1), { vitd: 19, hba1c: 5.8, ldl: 146, apob: 103, tsh: 2.6, hb: 12.6, crp: 1.4 }),
        createdAt: monthsAgoIso(1)
      }
    ],
    consultations: [
      {
        id: "consult-1001",
        bookingId: "b-1001",
        consumerId: "c-1001",
        doctorId: "doc-1",
        doctorName: "Dr. Nisha Menon",
        patientName: "Ananya Rao",
        patientGender: "Female",
        testName: "Full Body Health Checkup",
        labName: "Yello Prime Diagnostics",
        type: "Chat",
        slot: `${nextIsoDate(3)} 18:00`,
        durationMinutes: 15,
        zoomLink: null,
        startedAt: null,
        status: "upcoming",
        messages: [
          { from: "doctor", text: "Please keep your report handy for the consultation.", sentAt: new Date().toISOString() }
        ]
      }
    ],
    notifications: [
      {
        id: "n-1001",
        channel: "email",
        to: "ananya@example.com",
        subject: "Booking confirmed",
        body: "Your Full Body Health Checkup booking is confirmed.",
        createdAt: new Date().toISOString()
      }
    ],
    centreLeads: [
      {
        id: "lead-1001",
        centre: "Sunrise Imaging & Labs",
        owner: "Dr. K. Vojjala",
        phone: "9800000001",
        email: "owner@sunrisedx.in",
        city: "Hyderabad",
        locality: "Panjagutta",
        modalities: ["MRI", "CT", "Ultrasound", "Pathology"],
        nabl: "yes",
        pcpndt: "yes",
        volume: "500–1,500",
        idle: "40–60%",
        notes: "1.5T MRI, strong corporate book, revenue exists but profit is thin. Needs demand.",
        source: "partner-site",
        status: "Applied",
        createdAt: new Date().toISOString()
      },
      {
        id: "lead-1002",
        centre: "CarePlus Diagnostic Centre",
        owner: "Mr. Rahul Bhatia",
        phone: "9800000002",
        email: "careplus@dx.in",
        city: "Hyderabad",
        locality: "Kukatpally",
        modalities: ["Ultrasound", "X-ray", "Pathology", "Collection"],
        nabl: "in-progress",
        pcpndt: "yes",
        volume: "200–500",
        idle: "20–40%",
        notes: "",
        source: "partner-site",
        status: "Applied",
        createdAt: new Date().toISOString()
      }
    ],
    centres: [
      {
        id: "ct-1001",
        mobile: "9000000001",
        name: "Nova Scans & Labs",
        owner: "Dr. Meena Rao",
        status: "Verified · Live",
        tier: "Fully Managed",
        live: { labId: "lab-4", goLiveDate: "2026-03-01" },
        misCurrentBase: 900000,
        mis: [
          { month: "2026-03", ownBook: 5000000, yello: 250000 },
          { month: "2026-04", ownBook: 4900000, yello: 800000 },
          { month: "2026-05", ownBook: 5100000, yello: 1500000 },
          { month: "2026-06", ownBook: 5000000, yello: 2100000 }
        ],
        sections: {
          identity: { legalName: "Nova Scans & Labs Pvt Ltd", city: "Hyderabad", locality: "Madhapur" },
          facility: { capacityPerDay: 120, currentPerDay: 55, openHour: 7, closeHour: 21 },
          catalogue: { modalities: ["MRI", "CT", "Ultrasound", "Pathology"], yelloDiscount: 40, hourlyCapacity: 6 },
          compliance: {
            nabl: "Accredited",
            nablCert: [sampleDoc("NABL-15189-cert.svg", "NABL 15189", "Medical laboratory accreditation")],
            pcpndt: "Registered",
            pcpndtCert: [sampleDoc("PCPNDT-registration.svg", "PCPNDT Registration", "Form F - imaging compliance")]
          },
          financials: {
            revenueMonths: [4200000, 4300000, 4100000, 4500000, 4600000, 4400000, 4700000, 4800000, 4900000, 5000000, 5100000, 5200000],
            expenses: { rent: 800000, salaries: 1500000, reagents: 900000, reads: 400000, amc: 150000, power: 120000, marketing: 80000, admin: 150000, finance: 100000, other: 50000 },
            ownerTakeHome: 800000, currentRunRate: 5200000, targetRunRate: 7500000,
            docs: [sampleDoc("P&L-FY26.svg", "Profit and Loss FY26", "Audited statement"), sampleDoc("bank-statements-12mo.svg", "Bank statements", "12 months, all accounts")]
          },
          banking: { accountName: "Nova Scans and Labs Pvt Ltd", bank: "HDFC Bank", ifsc: "HDFC0001234", accountNo: "50100012345678", cheque: [sampleDoc("cancelled-cheque.svg", "Cancelled cheque", "Settlement account proof")] }
        },
        review: {},
        leadId: null,
        createdAt: new Date().toISOString(),
        submittedAt: null
      },
      {
        id: "ct-1002",
        mobile: "9000000002",
        name: "Aster Diagnostics",
        owner: "Dr. Priya Nair",
        status: "Invited",
        tier: "",
        sections: {
          identity: { legalName: "Aster Diagnostics LLP", city: "Hyderabad", locality: "Kondapur" }
        },
        review: {},
        leadId: null,
        createdAt: new Date().toISOString(),
        submittedAt: null
      }
    ]
  };
}

export function nextIsoDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

// A real, previewable sample document (SVG data URL) so seeded centres show
// an actual document in the viewer — not just a filename.
function sampleDoc(name, title, sub) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='440' height='300'><rect width='440' height='300' fill='#fffdf7'/><rect x='8' y='8' width='424' height='284' fill='none' stroke='#0f766e' stroke-width='3'/><rect x='8' y='8' width='424' height='54' fill='#0f766e'/><text x='220' y='42' font-family='Arial' font-size='20' font-weight='bold' text-anchor='middle' fill='#ffffff'>${title}</text><text x='220' y='122' font-family='Arial' font-size='16' font-weight='bold' text-anchor='middle' fill='#1c1b18'>Nova Scans and Labs Pvt Ltd</text><text x='220' y='150' font-family='Arial' font-size='13' text-anchor='middle' fill='#6c6e72'>${sub}</text><text x='220' y='176' font-family='Arial' font-size='12' text-anchor='middle' fill='#9a9b96'>Sample document - prototype preview</text><circle cx='220' cy='234' r='30' fill='none' stroke='#ffc40c' stroke-width='4'/><text x='220' y='239' font-family='Arial' font-size='11' font-weight='bold' text-anchor='middle' fill='#7a5a00'>SEAL</text></svg>`;
  return { name, type: "image/svg+xml", dataUrl: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64") };
}
