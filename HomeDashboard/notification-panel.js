import { db, COLLECTIONS } from "../DatabaseConn/dbconn.js";
import {
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

let notificationsUnsubscribe = null;
let currentNotifications = [];
let unreadCount = 0;
let isDropdownOpen = false;
let initialLoad = true;

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.dashboard-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `dashboard-toast dashboard-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatNotificationTime(date) {
  if (!date) return 'Just now';
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updateNotificationUI(count) {
  const notificationDot = document.getElementById('notification-dot');
  const notificationBadge = document.getElementById('notification-badge');
  if (!notificationDot || !notificationBadge) return;

  if (count > 0) {
    notificationDot.style.display = 'block';
    notificationBadge.textContent = count > 99 ? '99+' : count;
    notificationBadge.style.display = 'flex';
  } else {
    notificationDot.style.display = 'none';
    notificationBadge.style.display = 'none';
  }
}

function clearNotificationIndicator() {
  const notificationDot = document.getElementById('notification-dot');
  const notificationBadge = document.getElementById('notification-badge');
  if (notificationDot) notificationDot.style.display = 'none';
  if (notificationBadge) notificationBadge.style.display = 'none';
}

function getNotificationIcon(status) {
  if (!status) return '📋';
  const lower = String(status).toLowerCase();
  if (lower === 'approved') return '✓';
  if (lower === 'rejected') return '✗';
  if (lower === 'pending') return '⏳';
  return '📋';
}

function renderNotificationList() {
  const notificationList = document.getElementById('notification-list');
  if (!notificationList) return;

  const displayNotifs = currentNotifications.slice(0, 20);
  if (displayNotifs.length === 0) {
    notificationList.innerHTML = `
      <div class="notification-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <p>No pending requests yet</p>
        <p style="font-size: 12px; margin-top: 8px;">Pending facility requests will appear here.</p>
      </div>
    `;
    return;
  }

  notificationList.innerHTML = displayNotifs.map(notif => {
    const eventName = notif.event || notif.title || notif.eventTitle || 'Facility Request';
    const requesterName = notif.fullname || notif.requestedBy || notif.requester || 'Unknown';
    const venue = notif.venue || notif.location || '';
    const dateText = notif.date || '';
    const timeText = notif.startTime && notif.endTime ? `${notif.startTime} - ${notif.endTime}` : notif.startTime || notif.endTime || notif.time || '';
    const details = [];
    if (venue) details.push(`Venue: ${escapeHtml(venue)}`);
    if (dateText) details.push(`Date: ${escapeHtml(dateText)}`);
    if (timeText) details.push(`Time: ${escapeHtml(timeText)}`);
    if (notif.item) details.push(`Items: ${escapeHtml(notif.item)}`);
    if (notif.requestId) details.push(`Request ID: ${escapeHtml(notif.requestId)}`);

    return `
      <div class="notification-item" data-request-id="${escapeHtml(notif.id)}">
        <div class="notification-icon pending">${getNotificationIcon(notif.status || 'pending')}</div>
        <div class="notification-content">
          <div class="notification-title">${escapeHtml(eventName)}</div>
          <div class="notification-message"><strong>${escapeHtml(requesterName)}</strong></div>
          <div class="notification-details">
            ${details.map(line => `<div>${line}</div>`).join('')}
          </div>
          <div class="notification-time">${formatNotificationTime(notif.createdAt)}</div>
        </div>
      </div>
    `;
  }).join('');

  notificationList.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      window.location.href = '../Requests/request.html';
    });
  });
}

function toggleNotificationDropdown() {
  const notificationDropdown = document.getElementById('notification-dropdown');
  if (!notificationDropdown) return;

  isDropdownOpen = !isDropdownOpen;
  notificationDropdown.classList.toggle('show', isDropdownOpen);
  if (isDropdownOpen) {
    renderNotificationList();
    clearNotificationIndicator();
  }
}

function closeNotificationDropdown() {
  const notificationDropdown = document.getElementById('notification-dropdown');
  if (!notificationDropdown) return;

  isDropdownOpen = false;
  notificationDropdown.classList.remove('show');
}

function setupClickOutsideHandler(wrapper) {
  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target) && isDropdownOpen) {
      closeNotificationDropdown();
    }
  });
}

function initPendingRequestNotifications() {
  const notificationBell = document.getElementById('notification-bell');
  const wrapper = document.getElementById('notification-bell-wrapper');
  if (!notificationBell || !wrapper) {
    return;
  }

  const q = query(
    collection(db, COLLECTIONS.REQUESTS),
    where('status', '==', 'Pending')
  );

  notificationsUnsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = [];
    let pendingCount = 0;

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate?.() || (typeof data.timestamp === 'number' ? new Date(data.timestamp) : new Date());
      notifications.push({ id: docSnap.id, ...data, createdAt });
      if ((data.status || 'Pending').toLowerCase() === 'pending') {
        pendingCount++;
      }
    });

    currentNotifications = notifications;
    updateNotificationUI(pendingCount);
    renderNotificationList();

    if (!initialLoad && pendingCount > unreadCount) {
      const newCount = pendingCount - unreadCount;
      showToast(`${newCount} new pending request${newCount !== 1 ? 's' : ''}`, 'info');
    }

    unreadCount = pendingCount;
    initialLoad = false;
  }, (error) => {
    console.error('[Notification Panel] Listener error:', error);
  });

  notificationBell.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleNotificationDropdown();
  });

  setupClickOutsideHandler(wrapper);
}

export { initPendingRequestNotifications };
