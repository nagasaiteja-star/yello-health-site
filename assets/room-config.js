/* Yello Investor Room — API endpoint (Apps Script web app /exec URL).
   Set ROOM_API after deploying apps-script/investor-room (see README-Deploy.md).
   On localhost the mock API (tools/mock-room-api.mjs, port 4181) is used instead. */
(function(){
  var ROOM_API = 'https://script.google.com/macros/s/AKfycbyYcWAsssm0RG1w3phOZatBsmqL6AVKlfle9O-TI4JbH6YmLguCgc6NM9TvTtP8npMg/exec';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  window.YELLO_ROOM_API = local ? 'http://localhost:4181/api' : ROOM_API;
  window.yelloRoomCall = function(payload){
    if(!window.YELLO_ROOM_API) return Promise.reject(new Error('offline'));
    return fetch(window.YELLO_ROOM_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); });
  };
})();
