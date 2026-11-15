/* Stocker's reminders. This file only shows a reminder and passes on the answer.
   It does not cache anything and does not sit between the app and the network. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(String(d.title || 'Stocker').slice(0, 120), {
    body: String(d.body || '').slice(0, 300),
    icon: '/icon-192.png',
    badge: '/badge.png',
    tag: 'stocker-daily',
    renotify: true,
    data: { url: d.url === '/?n=1' ? '/?n=1' : '/', ids: Array.isArray(d.ids) ? d.ids.slice(0, 12) : [] },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : []
  }));
});

function openApp(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].postMessage({ stocker: 'nudges' }); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  });
}

function today() {
  var now = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n };
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}
function answer(body) {
  return fetch('/api/remind', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-today': today() },
    body: JSON.stringify(body)
  });
}

self.addEventListener('notificationclick', function (e) {
  var d = e.notification.data || {}, ids = d.ids || [];
  e.notification.close();
  // Undo on the "done" notice: put back what the tap changed, quietly
  if (e.action === 'undo' && d.undo) {
    e.waitUntil(answer({ answer: 'undo', of: d.undo.of, before: d.undo.before }).then(function (r) { if (!r.ok) return openApp('/?n=1'); }, function () { return openApp('/?n=1'); }));
    return;
  }
  if ((e.action === 'add' || e.action === 'still') && ids.length) {
    // answered straight from the reminder, then say what changed with an Undo; if the sign-in has lapsed, open the app instead so nothing is lost silently
    e.waitUntil(answer({ ids: ids, answer: e.action, hour: new Date().getHours() }).then(function (r) {
      if (!r.ok) return openApp('/?n=1');
      return r.json().then(function (j) {
        if (!j || !j.say || !j.say.title) return;
        return self.registration.showNotification(String(j.say.title).slice(0, 120), {
          body: 'Tap Undo if that was wrong.', icon: '/icon-192.png', badge: '/badge.png', tag: 'stocker-daily', silent: true, renotify: false,
          data: { url: '/', ids: [], undo: { of: e.action, before: Array.isArray(j.before) ? j.before.slice(0, 12) : [] } },
          actions: [{ action: 'undo', title: 'Undo' }]
        });
      }, function () {});
    }, function () { return openApp('/?n=1'); }));
    return;
  }
  e.waitUntil(openApp(d.url || '/'));
});
