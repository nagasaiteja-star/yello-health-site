/* Yello Investor Room — API endpoint (Apps Script web app /exec URL).
   Set ROOM_API after deploying apps-script/investor-room (see README-Deploy.md).
   On localhost the mock API (tools/mock-room-api.mjs, port 4181) is used instead. */
(function(){
  var ROOM_API = 'https://script.google.com/macros/s/AKfycbyYcWAsssm0RG1w3phOZatBsmqL6AVKlfle9O-TI4JbH6YmLguCgc6NM9TvTtP8npMg/exec';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  window.YELLO_ROOM_API = local ? 'http://localhost:4181/api' : ROOM_API;
  // Apps Script's echo step intermittently answers 404 ("unable to open the file"); read-only calls retry with backoff.
  var RETRY = { open: 1, verify: 1, docs: 1, page: 1, html: 1 };
  window.yelloRoomCall = function(payload){
    if(!window.YELLO_ROOM_API) return Promise.reject(new Error('offline'));
    var tries = RETRY[payload && payload.action] ? 4 : 1;
    var once = function(){
      return fetch(window.YELLO_ROOM_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)})
        .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); });
    };
    var attempt = function(n){
      return once().catch(function(e){
        if(n <= 1) throw e;
        return new Promise(function(res){ setTimeout(res, (5 - n) * 800); }).then(function(){ return attempt(n - 1); });
      });
    };
    return attempt(tries);
  };
})();
