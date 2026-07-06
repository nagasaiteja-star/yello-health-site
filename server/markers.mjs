// Biomarker reference library + report builder.
// Ranges are illustrative for the prototype, not clinical guidance.

export const MARKERS = {
  vitd:  { name: "Vitamin D (25-OH)", unit: "ng/mL", low: 30, high: 100, group: "Nutrition",
           lowPlain: "Low — very common after the monsoon months and indoor work. Fixable in 8–12 weeks with supplementation and sun; we'll re-check next visit.",
           highPlain: "Above the usual range — worth easing off high-dose supplements. Your doctor will confirm.",
           okPlain: "In a healthy range." },
  hba1c: { name: "HbA1c", unit: "%", low: 4.0, high: 5.7, group: "Metabolic", higherIsWorse: true,
           highPlain: "Above 5.7% sits in the pre-diabetes band — your 3-month average sugar is creeping up. This is the most reversible stage; diet and movement move it fast.",
           okPlain: "Healthy average blood sugar." },
  ldl:   { name: "LDL cholesterol", unit: "mg/dL", low: 0, high: 100, group: "Heart", higherIsWorse: true,
           highPlain: "Above target. The number itself is quiet — but the trend is what your heart feels over years. Diet, movement, sometimes medication bring it down.",
           okPlain: "Within target for a healthy heart." },
  apob:  { name: "ApoB", unit: "mg/dL", low: 0, high: 90, group: "Heart", higherIsWorse: true,
           highPlain: "ApoB counts the actual particles that lodge in artery walls — a truer heart-risk signal than cholesterol alone. Above target; worth acting on early.",
           okPlain: "Healthy particle count." },
  tsh:   { name: "TSH (thyroid)", unit: "mIU/L", low: 0.4, high: 4.0, group: "Hormonal",
           lowPlain: "Below range — thyroid may be running fast. Your doctor will interpret alongside symptoms.",
           highPlain: "Above range — thyroid may be running slow, which can explain fatigue and weight change. Easily managed once confirmed.",
           okPlain: "Thyroid signalling in a healthy range." },
  hb:    { name: "Haemoglobin", unit: "g/dL", low: 12, high: 16, group: "Blood",
           lowPlain: "Low — the common cause is iron. Often behind low energy; simple to correct once the cause is clear.",
           okPlain: "Healthy oxygen-carrying capacity." },
  crp:   { name: "hs-CRP", unit: "mg/L", low: 0, high: 1.0, group: "Inflammation", higherIsWorse: true,
           highPlain: "Raised — a marker of low-grade inflammation linked to heart and metabolic risk. Sleep, movement and diet bring it down; we watch the trend.",
           okPlain: "Low inflammation — a good sign." }
};

// Which markers a test/package measures.
const TEST_MARKERS = {
  "Full Body Health Checkup": ["vitd", "hba1c", "ldl", "apob", "tsh", "hb", "crp"],
  "Diabetes Care Package": ["hba1c", "ldl", "crp"],
  "Women's Wellness Package": ["vitd", "tsh", "hb", "hba1c"],
  "Thyroid Profile": ["tsh"],
  "Lipid Profile": ["ldl", "apob"]
};

export function markersForTest(testName) {
  return TEST_MARKERS[testName] || null;
}

function classify(key, value) {
  const m = MARKERS[key];
  if (value < m.low) return "low";
  if (value > m.high) return "high";
  // "watch" band: within 8% of the worse-direction limit
  if (m.higherIsWorse && value >= m.high * 0.92) return "watch";
  if (!m.higherIsWorse && m.low > 0 && value <= m.low * 1.08) return "watch";
  return "optimal";
}

function plainFor(key, status) {
  const m = MARKERS[key];
  if (status === "low") return m.lowPlain || m.okPlain;
  if (status === "high") return m.highPlain || m.okPlain;
  if (status === "watch") return (m.higherIsWorse ? m.highPlain : m.lowPlain) || m.okPlain;
  return m.okPlain;
}

// Build one marker line.
export function markerLine(key, value) {
  const m = MARKERS[key];
  const status = classify(key, value);
  return {
    key, name: m.name, unit: m.unit, group: m.group,
    value: Number(value), low: m.low, high: m.high,
    higherIsWorse: !!m.higherIsWorse,
    status, plain: plainFor(key, status)
  };
}

// Generate a plausible report for a live-filed test.
export function buildReport(testName, filedAtIso) {
  const keys = markersForTest(testName);
  if (!keys) return null;
  const markers = keys.map((key) => {
    const m = MARKERS[key];
    // Center a value in-range with occasional drift out, deterministic-free (persisted once).
    const span = m.high - (m.low || m.high * 0.5);
    const base = (m.low || m.high * 0.5) + span * (0.35 + Math.random() * 0.5);
    const value = Math.round(base * 10) / 10;
    return markerLine(key, value);
  });
  return summarise(markers, filedAtIso);
}

export function summarise(markers, filedAtIso) {
  const flagged = markers.filter((m) => m.status !== "optimal");
  const summary = flagged.length
    ? `${flagged.length} of ${markers.length} markers need attention: ${flagged.map((m) => m.name).join(", ")}. The rest are in a healthy range.`
    : `All ${markers.length} markers are in a healthy range. Your baseline looks strong — keep the rhythm.`;
  return { filedAt: filedAtIso, markers, summary };
}
