/* ============================================================
   Notification/admin-notification-manager.js
   FaciliTrack – Admin Web Notification Manager  (FIXED v4)

   KEY FIXES IN THIS VERSION:
   1. Firestore listener now starts IMMEDIATELY on page load regardless
      of notification permission — modal popup does NOT need permission.
   2. Removed orderBy("createdAt") from the query — it required a Firestore
      composite index that didn't exist, causing the listener to silently fail.
   3. Animation uses double-rAF so the modal always renders correctly.
   4. Permission is only needed for the background browser Web Push —
      the in-page modal works with zero browser permissions.
   ============================================================ */

import { db, app } from "../DatabaseConn/dbconn.js";
import {
    collection, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";
import {
    getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging.js";

/* ── CONFIG ─────────────────────────────────────────────────────────────────── */
const VAPID_KEY = "BHsFC6VWUy3k3GxG6YP19F_SQHnFukpzYw2t6Bjt1S3bCHPyJT34xuqg8J_54A7To3_FZDj-RCMBhwWc5lwT9K0";

/* ── Internal state ──────────────────────────────────────────────────────────── */
let _unsubscribe  = null;
let _processedIds = new Set();
let _messaging    = null;
let _initialised  = false;

/* ════════════════════════════════════════════════════════════════════════════
   PUBLIC API
   ════════════════════════════════════════════════════════════════════════════ */
export async function initAdminNotifications() {
    if (_initialised) return;

    const adminId = sessionStorage.getItem('ft_admin_id');
    if (!adminId) {
        console.warn("[AdminNotif] No ft_admin_id — skipping");
        return;
    }

    console.log("[AdminNotif] 🚀 Starting for admin:", adminId);

    await _domReady();
    _injectStyles();

    // ── CRITICAL FIX: Start the Firestore listener FIRST, unconditionally.
    // The modal popup does NOT need notification permission. It is just a
    // regular HTML element injected into the page. We must not gate it
    // behind requestPermission().
    _startListener();

    // ── Web Push (browser background notifications) — needs permission.
    // This runs in parallel and does NOT block the listener above.
    _setupWebPush();

    // ── Handle FCM foreground messages (tab open + focused)
    // _messaging is set inside _setupWebPush async — attach handler after it resolves
    _setupWebPush().then(() => {
        if (_messaging) {
            onMessage(_messaging, (payload) => {
                _showRequestModal(
                    payload.notification?.title || 'New Request',
                    payload.notification?.body  || '',
                    payload.data?.requestId     || null,
                    {}
                );
            });
        }
    });

    // ── Handle SW → page notification click
    navigator.serviceWorker?.addEventListener('message', (e) => {
        if (e.data?.type === 'NOTIFICATION_CLICK') {
            window.dispatchEvent(new CustomEvent('ft:notificationClicked', {
                detail: { requestId: e.data.requestId }
            }));
        }
    });

    _initialised = true;
    console.log("[AdminNotif] ✅ Firestore listener active");
}

export function stopAdminNotifications() {
    _unsubscribe?.();
    _unsubscribe  = null;
    _initialised  = false;
    _processedIds.clear();
}

/* ════════════════════════════════════════════════════════════════════════════
   DOM READY HELPER
   ════════════════════════════════════════════════════════════════════════════ */
function _domReady() {
    return new Promise(resolve => {
        if (document.readyState !== 'loading') resolve();
        else document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
}

/* ════════════════════════════════════════════════════════════════════════════
   FIRESTORE REAL-TIME LISTENER
   ── No orderBy → no composite index required → never silently fails
   ── Fires only on genuinely NEW added documents after first snapshot
   ════════════════════════════════════════════════════════════════════════════ */
function _startListener() {
    if (_unsubscribe) return;

    console.log("[AdminNotif] 👂 Attaching Firestore listener…");

    // FIXED: Removed orderBy("createdAt","desc") — that combination with
    // where() requires a composite index in Firestore. Without the index,
    // onSnapshot fires an error immediately and the listener dies.
    // Simple where() alone works with the default single-field index.
    const q = query(
        collection(db, "requests"),
        where("status", "==", "Pending")
    );

    let firstLoad = true;

    _unsubscribe = onSnapshot(q,
        (snapshot) => {
            if (firstLoad) {
                // Record all currently-existing IDs silently — no notifications
                snapshot.docs.forEach(d => _processedIds.add(d.id));
                firstLoad = false;
                console.log(`[AdminNotif] ✅ Listener ready — ${snapshot.size} existing pending requests recorded silently`);
                return;
            }

            // Only "added" changes after the first snapshot are truly new
            snapshot.docChanges().forEach((change) => {
                if (change.type !== "added") return;

                const docId = change.doc.id;
                if (_processedIds.has(docId)) return;
                _processedIds.add(docId);
                if (_processedIds.size > 500) _processedIds.clear();

                const d = change.doc.data();
                console.log("[AdminNotif] 🆕 New pending request:", docId, d);

                // Show the in-page modal popup
                _showRequestModal(`📋 New Facility Request`, docId, d);

                // Browser Web Push (only fires when tab is hidden/minimized)
                _showBrowserPush(d, docId);

                // Tell dashboard.js to refresh the pending badge count
                window.dispatchEvent(new CustomEvent('ft:newRequest', {
                    detail: { requestId: d.requestId || docId, data: d }
                }));
            });
        },
        (err) => {
            // Log the full error so you can see if it's an index error
            console.error("[AdminNotif] ❌ Firestore listener error:", err.code, err.message);
            _unsubscribe = null;
            // Retry after 5 seconds
            setTimeout(_startListener, 5000);
        }
    );
}

/* ════════════════════════════════════════════════════════════════════════════
   WEB PUSH SETUP — only needed for background (tab hidden) notifications
   The in-page modal works WITHOUT this
   ════════════════════════════════════════════════════════════════════════════ */
async function _setupWebPush() {
    if (!('Notification' in window)) return;

    const perm = Notification.permission;

    if (perm === 'granted') {
        await _registerServiceWorker();
        return;
    }

    if (perm === 'denied') {
        _showPermissionBanner(true);
        return;
    }

    // 'default' — show banner with Enable button
    _showPermissionBanner(false);
}

async function _registerServiceWorker() {
    try {
        _messaging = getMessaging(app);
        const reg  = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log("[AdminNotif] ✅ Service Worker registered");
        const token = await getToken(_messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: reg
        });
        if (token) console.log("[AdminNotif] ✅ FCM token:", token.substring(0, 20) + "…");
        else        console.warn("[AdminNotif] ⚠️ No FCM token — check VAPID key & SW path");
    } catch (err) {
        console.error("[AdminNotif] SW/FCM error:", err.message);
    }
}

/* ════════════════════════════════════════════════════════════════════════════
   CENTERED MODAL POPUP
   Shows full request details. Works with NO notification permission.
   ════════════════════════════════════════════════════════════════════════════ */
function _showRequestModal(title, docId, d = {}) {
    // Only one modal at a time
    const existing = document.getElementById('_ft_modal_overlay');
    if (existing) existing.remove();

    const requestId = d.requestId || docId;
    const event     = d.event    || d.title            || '';
    const name      = d.fullname || d.name             || '';
    const idNum     = d.idNumber || d.empId            || '';
    const position  = d.position || d.Position         || '';
    const venue     = d.venue    || d.location         || '';
    const date      = d.date     || '';
    const time      = (d.startTime && d.endTime)
                        ? `${d.startTime} – ${d.endTime}`
                        : d.startTime || d.time || '';
    const details   = d.eventDescription || d.description || '';

    const rows = [
        event    && `<div class="_ft-md-row"><span class="_ft-md-lbl">Event</span><span class="_ft-md-val">${_esc(event)}</span></div>`,
        name     && `<div class="_ft-md-row"><span class="_ft-md-lbl">Requested By</span><span class="_ft-md-val">${_esc(name)}</span></div>`,
        idNum    && `<div class="_ft-md-row"><span class="_ft-md-lbl">ID Number</span><span class="_ft-md-val">${_esc(idNum)}</span></div>`,
        position && `<div class="_ft-md-row"><span class="_ft-md-lbl">Position</span><span class="_ft-md-val">${_esc(position)}</span></div>`,
        venue    && `<div class="_ft-md-row"><span class="_ft-md-lbl">Venue</span><span class="_ft-md-val">${_esc(venue)}</span></div>`,
        date     && `<div class="_ft-md-row"><span class="_ft-md-lbl">Date</span><span class="_ft-md-val">${_esc(date)}</span></div>`,
        time     && `<div class="_ft-md-row"><span class="_ft-md-lbl">Time</span><span class="_ft-md-val">${_esc(time)}</span></div>`,
        details  && `<div class="_ft-md-row"><span class="_ft-md-lbl">Details</span><span class="_ft-md-val">${_esc(details)}</span></div>`,
    ].filter(Boolean).join('');

    const overlay = document.createElement('div');
    overlay.id    = '_ft_modal_overlay';
    overlay.innerHTML = `
        <div id="_ft_modal_box" role="dialog" aria-modal="true" aria-labelledby="_ft_modal_title">
            <div class="_ft-md-header">
                <span class="_ft-md-bell">🔔</span>
                <span id="_ft_modal_title" class="_ft-md-title">${_esc(title)}</span>
                <button class="_ft-md-close" aria-label="Close">✕</button>
            </div>
            <p class="_ft-md-subtitle">A new facility request has been submitted and is awaiting your review.</p>
            <div class="_ft-md-details">
                ${rows || `<div class="_ft-md-row"><span class="_ft-md-val" style="color:#8fa3c8">No additional details available.</span></div>`}
            </div>
            <div class="_ft-md-actions">
                <button class="_ft-md-btn-view" id="_ft_modal_view">View Request</button>
                <button class="_ft-md-btn-dismiss" id="_ft_modal_dismiss">Dismiss</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // FIXED: Double rAF ensures the element is fully composited before we
    // add the class that triggers the CSS transition. Single rAF sometimes
    // fires before the browser has painted the initial state.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.classList.add('_ft-visible');
    }));

    function closeModal() {
        overlay.classList.remove('_ft-visible');
        setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 300);
    }

    overlay.querySelector('._ft-md-close').addEventListener('click', closeModal);
    document.getElementById('_ft_modal_dismiss').addEventListener('click', closeModal);
    document.getElementById('_ft_modal_view').addEventListener('click', () => {
        closeModal();
        window.dispatchEvent(new CustomEvent('ft:notificationClicked', {
            detail: { requestId }
        }));
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/* ════════════════════════════════════════════════════════════════════════════
   BROWSER WEB PUSH — only when tab is hidden/minimized
   ════════════════════════════════════════════════════════════════════════════ */
function _showBrowserPush(d, docId) {
    if (Notification.permission !== 'granted') return;
    const event = d.event    || 'Facility Request';
    const name  = d.fullname || 'Unknown';
    const venue = d.venue    || '';
    const date  = d.date     || '';
    const reqId = d.requestId || docId;

    navigator.serviceWorker?.ready.then(reg => {
        reg.showNotification(`📋 New Request: ${event}`, {
            body:    `${name} → ${venue}${date ? ' on ' + date : ''}`,
            icon:    '/Images/logo.png',
            badge:   '/Images/logo.png',
            tag:     `ft-req-${reqId}`,
            vibrate: [200, 100, 200],
            data:    { requestId: reqId },
            actions: [
                { action: 'view',    title: 'View Request' },
                { action: 'dismiss', title: 'Dismiss' }
            ]
        });
    }).catch(e => console.warn("[AdminNotif] showNotification error:", e));
}

/* ════════════════════════════════════════════════════════════════════════════
   PERMISSION BANNER — for background Web Push only
   The in-page modal already works without this
   ════════════════════════════════════════════════════════════════════════════ */
function _showPermissionBanner(hardBlocked) {
    if (document.getElementById('_ft_perm_banner')) return;

    const b = document.createElement('div');
    b.id    = '_ft_perm_banner';
    b.style.cssText = `
        position: fixed !important;
        top: 0; left: 0; right: 0;
        background: #0f1724;
        color: #e8f0ff;
        border-bottom: 2px solid #4f8ef7;
        padding: 11px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 2147483647 !important;
        font-size: 13px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        pointer-events: all !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    `;

    const msg = hardBlocked
        ? `<strong>Notifications are blocked.</strong>
           Click the 🔒 lock icon in the address bar → Notifications → <em>Allow</em>.
           Or: Edge Settings → Cookies and site permissions → Notifications
           → turn OFF "Quiet notification requests", then
           <a href="" style="color:#4f8ef7;font-weight:700">reload</a>.`
        : `<strong>Enable browser notifications</strong> to receive alerts when this tab is minimized.`;

    b.innerHTML = `
        <span style="font-size:18px;flex-shrink:0">🔔</span>
        <span style="flex:1;line-height:1.5">${msg}</span>
        ${!hardBlocked ? `
            <button id="_ft_perm_btn" style="
                background:#4f8ef7;color:#fff;border:none;border-radius:6px;
                padding:6px 18px;font-size:13px;font-weight:700;cursor:pointer;
                pointer-events:all;flex-shrink:0;white-space:nowrap">
                Enable
            </button>` : ''}
        <button id="_ft_perm_close" style="
            background:none;border:none;color:#8fa3c8;font-size:18px;
            cursor:pointer;flex-shrink:0;pointer-events:all;line-height:1;
            padding:0 4px" aria-label="Close">✕</button>
    `;

    document.body.appendChild(b);

    document.getElementById('_ft_perm_btn')?.addEventListener('click', async () => {
        b.remove();
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            await _registerServiceWorker();
        } else {
            _showPermissionBanner(true);
        }
    }, { once: true });

    document.getElementById('_ft_perm_close')
        .addEventListener('click', () => b.remove(), { once: true });
}

/* ════════════════════════════════════════════════════════════════════════════
   SHARED STYLES
   ════════════════════════════════════════════════════════════════════════════ */
function _injectStyles() {
    if (document.getElementById('_ft_notif_css')) return;
    const s = document.createElement('style');
    s.id = '_ft_notif_css';
    s.textContent = `
        #_ft_modal_overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483646;
            opacity: 0;
            transition: opacity 0.25s ease;
            padding: 16px;
        }
        #_ft_modal_overlay._ft-visible {
            opacity: 1;
        }
        #_ft_modal_box {
            background: #111827;
            color: #e8f0ff;
            border-radius: 14px;
            border: 1px solid rgba(79,142,247,0.25);
            box-shadow: 0 24px 60px rgba(0,0,0,0.7);
            width: 100%;
            max-width: 460px;
            overflow: hidden;
            transform: scale(0.9) translateY(16px);
            transition: transform 0.3s cubic-bezier(0.21,1.02,0.73,1);
            font-family: 'Segoe UI', system-ui, sans-serif;
        }
        #_ft_modal_overlay._ft-visible #_ft_modal_box {
            transform: scale(1) translateY(0);
        }
        ._ft-md-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 18px 18px 14px;
            border-bottom: 1px solid rgba(79,142,247,0.15);
            background: rgba(79,142,247,0.05);
        }
        ._ft-md-bell { font-size: 22px; flex-shrink: 0; }
        ._ft-md-title {
            flex: 1;
            font-size: 15px;
            font-weight: 700;
            color: #e8f0ff;
        }
        ._ft-md-close {
            background: none; border: none; color: #4a5870;
            font-size: 18px; cursor: pointer; padding: 0 2px;
            flex-shrink: 0; line-height: 1; transition: color 0.15s;
        }
        ._ft-md-close:hover { color: #e8f0ff; }
        ._ft-md-subtitle {
            margin: 14px 18px 0;
            font-size: 12.5px;
            color: #8fa3c8;
            line-height: 1.5;
        }
        ._ft-md-details {
            margin: 12px 18px 4px;
            border: 1px solid rgba(79,142,247,0.15);
            border-radius: 8px;
            overflow: hidden;
        }
        ._ft-md-row {
            display: flex;
            gap: 8px;
            padding: 9px 13px;
            border-bottom: 1px solid rgba(79,142,247,0.08);
            font-size: 13px;
            line-height: 1.45;
        }
        ._ft-md-row:last-child { border-bottom: none; }
        ._ft-md-lbl {
            color: #5b7aab;
            font-weight: 600;
            min-width: 105px;
            flex-shrink: 0;
        }
        ._ft-md-val { color: #c8d8f0; word-break: break-word; }
        ._ft-md-actions {
            display: flex;
            gap: 10px;
            padding: 14px 18px 18px;
            justify-content: flex-end;
        }
        ._ft-md-btn-view {
            background: #4f8ef7; color: #fff; border: none;
            border-radius: 7px; padding: 9px 22px;
            font-size: 13px; font-weight: 700; cursor: pointer;
            transition: background 0.15s;
        }
        ._ft-md-btn-view:hover { background: #3a7ae8; }
        ._ft-md-btn-dismiss {
            background: rgba(255,255,255,0.05); color: #8fa3c8;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 7px; padding: 9px 18px;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: background 0.15s;
        }
        ._ft-md-btn-dismiss:hover { background: rgba(255,255,255,0.1); }
    `;
    document.head.appendChild(s);
}

/* ── Utility ─────────────────────────────────────────────────────────────────── */
function _esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}