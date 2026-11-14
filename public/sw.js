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

self.addEventListener('notificationclick', function (e) {
  var d = e.notification.data || {}, ids = d.ids || [];
  e.notification.close();
  if ((e.action === 'add' || e.action === 'still') && ids.length) {
    var now = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n };
    var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    // answered straight from the reminder; if the sign-in has lapsed, open the app instead so nothing is lost silently
    e.waitUntil(fetch('/api/remind', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-today': today },
      body: JSON.stringify({ ids: ids, answer: e.action, hour: now.getHours() })
    }).then(function (r) { if (!r.ok) return openApp('/?n=1'); }, function () { return openApp('/?n=1'); }));
    return;
  }
  e.waitUntil(openApp(d.url || '/'));
});
