/* ============================================================
   firebase-messaging-sw.js
   FaciliTrack – Firebase Messaging Service Worker  (FIXED v2)

   PLACEMENT: Copy this file to your WEB ROOT (same folder as index.html)
   This enables background Web Push when the browser tab is closed/hidden.

   IMPORTANT: The Firebase config below MUST match your actual project.
   Replace every "YOUR_..." placeholder with real values from:
   Firebase Console → Project Settings → General → Your apps → Firebase SDK snippet
   ============================================================ */

importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            "YOUR_API_KEY",
    authDomain:        "facilitrack2.firebaseapp.com",
    projectId:         "facilitrack2",
    storageBucket:     "facilitrack2.appspot.com",
    messagingSenderId: "1033158293419",
    appId:             "YOUR_APP_ID"
    // ↑ Get appId from Firebase Console → Project Settings → Your apps
});

const messaging = firebase.messaging();

/* ── Background FCM message (tab is closed or hidden) ─────────────────────────
   This fires when the browser receives a push while the tab is not focused.
   It will NOT fire if the tab is open and focused — onMessage() in the main
   page handles that case instead.
   ─────────────────────────────────────────────────────────────────────────── */
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background FCM received:', payload);

    const title = payload.notification?.title || 'FaciliTrack – New Request';
    const body  = payload.notification?.body  || 'A new facility request was submitted.';

    self.registration.showNotification(title, {
        body,
        icon:    '/Images/logo.png',   // adjust to your actual logo path
        badge:   '/Images/logo.png',
        tag:     'faciltrack-request',
        vibrate: [200, 100, 200],
        data:    payload.data || {},
        actions: [
            { action: 'view',    title: 'View Request' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    });
});

/* ── Notification click handler ────────────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const action    = event.action;
    const requestId = event.notification.data?.requestId || '';

    if (action === 'dismiss') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.postMessage({
                            type:      'NOTIFICATION_CLICK',
                            requestId: requestId
                        });
                        return client.focus();
                    }
                }
                const url = requestId
                    ? `/Requests/requests.html?requestId=${requestId}`
                    : '/HomeDashboard/dashboard.html';
                return clients.openWindow(url);
            })
    );
});