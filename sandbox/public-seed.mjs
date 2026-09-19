// Public seed for yello.health: the app's real booking logic with honest data.
// No invented centres, ratings, reviews, testimonials, demo accounts or bookings.
// Two service lines instead of named labs; the exact partner centre is confirmed
// on the call. Prices are indicative (the request flow says so) until the rate card is set.
import { createSeedData } from "/server/data.mjs";

const HOURS = [
  { id: "slot-h1", startHour: 7, endHour: 9, discountPercent: 10, capacity: 6 },
  { id: "slot-h2", startHour: 11, endHour: 13, discountPercent: 20, capacity: 6 },
  { id: "slot-h3", startHour: 14, endHour: 17, discountPercent: 30, capacity: 6 },
  { id: "slot-h4", startHour: 18, endHour: 20, discountPercent: 15, capacity: 6 }
];

export function createPublicSeed() {
  const seed = createSeedData();
  const all = seed.labs.flatMap((lab) => lab.tests);
  const pick = (names) => names.map((name) => ({ ...all.find((t) => t.name === name) })).filter((t) => t.id);

  const base = {
    location: "Hyderabad", distanceKm: null, rating: null, reviewCount: 0, reviews: [],
    featured: true, branded: true, standardDiscountPercent: 0, defaultCapacity: 6, closures: [], slots: HOURS
  };
  seed.labs = [
    {
      ...base, id: "yl-home", name: "Yello Home Collection · Hyderabad",
      homeCollection: true, labVisit: false, accreditation: "NABL-accredited partner labs",
      address: "At your home, anywhere in Hyderabad",
      description: "A trained phlebotomist at your door. Samples sealed and tracked to an accredited partner lab; results explained in plain language.",
      openHour: 7, closeHour: 20,
      tests: pick(["Full Body Health Checkup", "Diabetes Care Package", "Women's Wellness Package", "Thyroid Profile", "CBC", "Liver Function Test"])
        .map((t) => ({ ...t, visitRequired: false }))
    },
    {
      ...base, id: "yl-imaging", name: "Yello Imaging · Hyderabad",
      homeCollection: false, labVisit: true, accreditation: "Accredited partner centres",
      address: "A partner centre near you — confirmed on your call",
      description: "Scans at an accredited Yello partner centre, read by a consultant radiologist. Quieter Yello hours carry a gentler price.",
      openHour: 8, closeHour: 20,
      tests: pick(["MRI Brain (Plain)", "USG Whole Abdomen"])
    }
  ];
  // Stable ids per service line (the server keys tests by id).
  seed.labs.forEach((lab) => lab.tests.forEach((t, i) => { t.id = `${lab.id}-t${i + 1}`; }));

  seed.testimonials = [];
  seed.consumers = [];
  seed.bookings = [];
  seed.consultations = [];
  seed.notifications = [];
  seed.centreLeads = [];
  seed.centres = [];
  seed.subscribers = [];
  seed.prescriptions = [];
  seed.doctors = (seed.doctors || []).map((d) => ({ ...d, email: "", password: "" }));
  seed.adminUser = { email: "", password: crypto.randomUUID(), name: "" };
  for (const key of Object.keys(seed)) if (/report/i.test(key) && Array.isArray(seed[key])) seed[key] = [];
  return seed;
}
