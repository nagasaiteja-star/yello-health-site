/* Yello patient requests — endpoint for bookings, prescriptions, contact and subscribe.
   Paste the apps-script/patient-requests /exec URL into LEADS_API after deploying it.
   Empty = the site asks people to call or WhatsApp instead. On localhost the mock is used. */
(function () {
  var LEADS_API = ''; // ← paste the patient-requests /exec URL here
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  window.YELLO_PUBLIC = true;
  window.YELLO_LEADS_API = local ? 'http://localhost:4181/api' : LEADS_API;
})();
