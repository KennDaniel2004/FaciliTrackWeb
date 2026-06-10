/* =============================================
   FaciliTrack – Dashboard Logic
   HomeDashboard/dashboard.js
   ============================================= */

import { db, COLLECTIONS } from "../DatabaseConn/dbconn.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

// ── Admin Notifications (new requests → toast + Web Push + mobile push) ───────
import { initAdminNotifications, stopAdminNotifications }
    from '../Notification/admin-notification-manager.js';

/* ============================================================
   SESSION GUARD
   ============================================================ */
const adminId = sessionStorage.getItem('ft_admin_id');
if (!adminId) {
  window.location.replace('../Auth/auth.login.html');
}

// ── Start notification listener (adminId is confirmed valid here) ─────────────
initAdminNotifications();

/* ============================================================
   TOPBAR
   ============================================================ */
const fullname = sessionStorage.getItem('ft_admin_fullname') || 'Admin';
const nameParts = fullname.trim().split(' ');
const initials  = (nameParts[0]?.[0] || '') + (nameParts[nameParts.length - 1]?.[0] || '');

document.getElementById('topbar-fullname').textContent = fullname;
document.getElementById('topbar-avatar').textContent   = initials.toUpperCase();

/* ============================================================
   SIDEBAR TOGGLE
   ============================================================ */
const hamburger      = document.getElementById('hamburger');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const dashLayout     = document.getElementById('dash-layout');

let sidebarOpen = window.innerWidth >= 768;

function setSidebar(open) {
  sidebarOpen = open;
  sidebar.classList.toggle('open', open);
  sidebarOverlay.classList.toggle('show', open && window.innerWidth < 768);
  hamburger.classList.toggle('open', open);
  if (window.innerWidth >= 768) {
    sidebar.classList.toggle('force-closed', !open);
    dashLayout.classList.toggle('sidebar-closed', !open);
  }
}

hamburger.addEventListener('click', () => setSidebar(!sidebarOpen));
sidebarOverlay.addEventListener('click', () => setSidebar(false));
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) sidebarOverlay.classList.remove('show');
});

setSidebar(sidebarOpen);

/* ============================================================
   PANEL NAVIGATION
   ============================================================ */
const scheduleParent   = document.querySelector('.nav-item.nav-parent');
const scheduleSubmenu  = document.querySelector('.nav-submenu');
const scheduleArrow    = document.querySelector('.nav-arrow-icon');

function setScheduleSubmenu(open) {
  if (!scheduleSubmenu || !scheduleParent) return;
  if (open) {
    scheduleSubmenu.classList.add('open');
    scheduleParent.classList.add('expanded');
  } else {
    scheduleSubmenu.classList.remove('open');
    scheduleParent.classList.remove('expanded');
  }
}

function toggleScheduleSubmenu() {
  if (!scheduleSubmenu || !scheduleParent) return;
  const isOpen = scheduleSubmenu.classList.contains('open');
  setScheduleSubmenu(!isOpen);
}

function showPanel(panelId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById(panelId);
  if (panel) panel.classList.remove('hidden');

  const navItem = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
  if (navItem) navItem.classList.add('active');

  if (panelId === 'panel-schedule' || panelId === 'panel-legalholiday') {
    setScheduleSubmenu(true);
  }
}

if (scheduleArrow) {
  scheduleArrow.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    toggleScheduleSubmenu();
  });
}

if (scheduleParent) {
  scheduleParent.addEventListener('click', function(e) {
    if (scheduleArrow && (e.target === scheduleArrow || scheduleArrow.contains(e.target))) {
      return;
    }
    const panelId = this.dataset.panel;
    if (panelId) {
      e.preventDefault();
      showPanel(panelId);
    }
  });
}

setScheduleSubmenu(false);

const legalHolidayLink = document.querySelector('.nav-child[data-panel="panel-legalholiday"]');
if (legalHolidayLink) {
  legalHolidayLink.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    showPanel('panel-legalholiday');
    setScheduleSubmenu(true);
    if (window.innerWidth < 768) setSidebar(false);
  });
}

showPanel('panel-schedule');

/* ============================================================
   LOGOUT
   ============================================================ */
const logoutModal   = document.getElementById('logout-modal');
const modalOverlay  = document.getElementById('modal-overlay');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const profileTrigger = document.getElementById('profile-trigger');
const dropdownMenu  = document.getElementById('dropdown-menu');
const logoutBtn     = document.getElementById('logout-btn');

profileTrigger.addEventListener('click', e => {
  e.stopPropagation();
  dropdownMenu.classList.toggle('show');
});
document.addEventListener('click', e => {
  if (!profileTrigger.contains(e.target)) dropdownMenu.classList.remove('show');
});

logoutBtn.addEventListener('click', e => {
  e.stopPropagation();
  dropdownMenu.classList.remove('show');
  logoutModal.classList.remove('hidden');
});
modalCancel.addEventListener('click',  () => logoutModal.classList.add('hidden'));
modalOverlay.addEventListener('click', () => logoutModal.classList.add('hidden'));
modalConfirm.addEventListener('click', () => {
  stopAdminNotifications();
  if (typeof stopNotificationListener === 'function') {
    stopNotificationListener();
  }
  sessionStorage.clear();
  window.location.replace('../Auth/auth.login.html');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') logoutModal.classList.add('hidden');
});

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
function showToast(message, type = 'success') {
  const existingToast = document.querySelector('.dashboard-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `dashboard-toast dashboard-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   CALENDAR STATE
   ============================================================ */
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const today = new Date();
today.setHours(0, 0, 0, 0);
let currentYear  = today.getFullYear();
let currentMonth = today.getMonth();

let approvedEvents = {};
let isLoading = true;

/* ============================================================
   SKELETON LOADING FUNCTIONS
   ============================================================ */
function showSkeletonCalendar() {
  const calGrid = document.getElementById('cal-grid');
  if (!calGrid) return;
  
  calGrid.className = 'cal-grid-skeleton';
  calGrid.innerHTML = '';
  
  const totalCells = 42;
  
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'skeleton-cell';
    
    const dayNum = document.createElement('div');
    dayNum.className = 'skeleton skeleton-day-num';
    cell.appendChild(dayNum);
    
    const eventCount = Math.floor(Math.random() * 3);
    for (let j = 0; j < eventCount; j++) {
      const event = document.createElement('div');
      event.className = `skeleton skeleton-event ${j === 0 ? 'skeleton-event-sm' : 'skeleton-event-xs'}`;
      cell.appendChild(event);
    }
    
    calGrid.appendChild(cell);
  }
}

function hideSkeletonCalendar() {
  const calGrid = document.getElementById('cal-grid');
  if (calGrid && calGrid.classList.contains('cal-grid-skeleton')) {
    calGrid.className = 'cal-grid month-view';
  }
}

/* ============================================================
   REAL-TIME CLOCK
   ============================================================ */
const calDateLabel = document.getElementById('cal-date-label');
const calYearLabel = document.getElementById('cal-year-label');
const calTimeLabel = document.getElementById('cal-time-label');

function updateClock() {
  const now  = new Date();
  const opts = { month: 'long', day: 'numeric' };
  calDateLabel.textContent = now.toLocaleDateString('en-US', opts);
  calYearLabel.textContent = now.getFullYear();
  calTimeLabel.textContent = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
updateClock();
setInterval(updateClock, 1000);

/* ============================================================
   FIRESTORE — Filter expired events
   ============================================================ */
const requestsQuery = query(
  collection(db, COLLECTIONS.REQUESTS),
  where('status', 'in', ['Approved', 'approved'])
);

showSkeletonCalendar();

onSnapshot(requestsQuery, (snapshot) => {
  approvedEvents = {};
  let eventCount = 0;
  let expiredCount = 0;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    let dateStr = '';
    let eventDate = null;
    
    if (data.date) {
      if (typeof data.date === 'string') {
        dateStr = data.date.substring(0, 10);
        eventDate = new Date(dateStr);
      } else if (data.date.toDate) {
        eventDate = data.date.toDate();
        dateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth()+1).padStart(2,'0')}-${String(eventDate.getDate()).padStart(2,'0')}`;
      }
    }

    if (!dateStr) return;
    
    if (eventDate && eventDate < todayDate) {
      expiredCount++;
      return;
    }

    const eventTitle = data.event || data.title || data.eventTitle || 'Approved Request';
    const timeValue = data.startTime && data.endTime
      ? `${data.startTime} - ${data.endTime}`
      : data.time || data.startTime || data.endTime || '';
    const descriptionText = data.eventDescription || data.description || data.details || '';
    const itemsText       = data.item ? data.item : '';

    if (!approvedEvents[dateStr]) approvedEvents[dateStr] = [];
    approvedEvents[dateStr].push({
      id:           docSnap.id,
      title:        eventTitle,
      time:         timeValue,
      requestedBy:  data.fullname || data.requestedBy || data.requester || '',
      position:     data.position || data.Position || '',
      venue:        data.venue || data.location || '',
      eventDetails: descriptionText,
      items:        itemsText,
      date:         dateStr,
    });
    eventCount++;
  });

  isLoading = false;
  hideSkeletonCalendar();
  renderCalendar();
  
  if (expiredCount > 0) {
    showToast(`${eventCount} upcoming event(s). ${expiredCount} expired event(s) hidden.`, 'info');
  } else if (eventCount > 0) {
    showToast(`${eventCount} upcoming approved event(s) loaded`, 'success');
  }
}, (err) => {
  console.error('Firestore listener error:', err);
  isLoading = false;
  hideSkeletonCalendar();
  showToast('Error loading events: ' + err.message, 'error');
});

/* ============================================================
   CALENDAR RENDER
   ============================================================ */
const calGrid         = document.getElementById('cal-grid');
const calGridHeader   = document.querySelector('.cal-grid-header');
const calMonthHeader  = document.getElementById('cal-month-header');
const calSearch       = document.getElementById('cal-search');
const calPrev         = document.getElementById('cal-prev');
const calToday        = document.getElementById('cal-today');
const calNext         = document.getElementById('cal-next');
const topbarExpand    = document.getElementById('topbar-expand');
const EXPAND_STATE_KEY = 'ft_expand_all';

let searchTerm = '';
let currentDate = new Date(today);

function setExpandState(active) {
  if (!topbarExpand) return;
  topbarExpand.classList.toggle('active', active);
  document.documentElement.classList.toggle('expanded-fullscreen', active);
  document.body.classList.toggle('expanded-fullscreen', active);

  if (active) {
    sessionStorage.setItem(EXPAND_STATE_KEY, '1');
  } else {
    sessionStorage.removeItem(EXPAND_STATE_KEY);
  }
}

if (sessionStorage.getItem(EXPAND_STATE_KEY) === '1') {
  setExpandState(true);
}

function moveCurrentView(offset) {
  currentDate.setMonth(currentDate.getMonth() + offset);
  renderCalendar();
}

function goToToday() {
  currentDate = new Date(today);
  renderCalendar();
  showToast('Showing current month', 'info');
}

calSearch.addEventListener('input', function () {
  searchTerm = this.value.toLowerCase().trim();
  renderCalendar();
});

calPrev.addEventListener('click', () => moveCurrentView(-1));
calNext.addEventListener('click', () => moveCurrentView(1));
calToday.addEventListener('click', goToToday);

topbarExpand?.addEventListener('click', async () => {
  const docEl = document.documentElement;
  const currentlyFullscreen = Boolean(document.fullscreenElement);

  if (currentlyFullscreen) {
    await document.exitFullscreen();
    setExpandState(false);
  } else if (docEl.requestFullscreen) {
    try {
      await docEl.requestFullscreen();
      setExpandState(true);
    } catch (err) {
      setExpandState(!docEl.classList.contains('expanded-fullscreen'));
    }
  } else {
    setExpandState(!docEl.classList.contains('expanded-fullscreen'));
  }
});

document.addEventListener('fullscreenchange', () => {
  setExpandState(Boolean(document.fullscreenElement));
});

/* Philippine Holiday Detection */
const PHILIPPINE_HOLIDAYS = [
  { month: 0, day: 1, name: "New Year's Day", description: "Celebrates the first day of the Gregorian calendar year." },
  { month: 3, day: 9, name: "Araw ng Kagitingan", description: "Commemorates the heroism of Filipino soldiers during WWII." },
  { month: 4, day: 1, name: "Labor Day", description: "Honors the working class and their contributions." },
  { month: 5, day: 12, name: "Independence Day", description: "Marks Philippine independence from Spain in 1898." },
  { month: 7, day: 4, name: "Philippine-American Friendship Day", description: "Commemorates Philippine-American relations." },
  { month: 7, day: 30, name: "Ninoy Aquino Day", description: "Honors Senator Benigno 'Ninoy' Aquino Jr." },
  { month: 10, day: 30, name: "Bonifacio Day", description: "Celebrates birth of Andres Bonifacio." },
  { month: 11, day: 25, name: "Christmas Day", description: "Celebrates the birth of Jesus Christ." },
  { month: 11, day: 30, name: "Rizal Day", description: "Commemorates Dr. Jose Rizal." },
  { month: 10, day: 1, name: "All Saints' Day", description: "Day to honor deceased loved ones." },
  { month: 10, day: 2, name: "All Souls' Day", description: "Commemorates the faithful departed." }
];

function getHolidayInfo(year, month, day) {
  return PHILIPPINE_HOLIDAYS.find(holiday => holiday.month === month && holiday.day === day);
}

function renderCalendar() {
  if (isLoading) return;
  calGridHeader.style.display = 'grid';
  renderMonthView();
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function getEventsForDateKey(dateKey) {
  const todayKey = formatDateKey(today);
  if (dateKey < todayKey) return [];
  
  return (approvedEvents[dateKey] || []).filter(ev => {
    if (!searchTerm) return true;
    return ev.title.toLowerCase().includes(searchTerm) ||
           ev.requestedBy.toLowerCase().includes(searchTerm) ||
           ev.venue.toLowerCase().includes(searchTerm);
  });
}

function renderMonthView() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  calMonthHeader.textContent = `${MONTHS[month]} ${year}`;

  const totalDays = daysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const todayKey = formatDateKey(today);
  const prevMonthDays = month === 0 ? daysInMonth(year - 1, 11) : daysInMonth(year, month - 1);

  calGrid.className = 'cal-grid month-view';
  calGrid.innerHTML = '';

  const totalCells = Math.ceil((firstDayOfWeek + totalDays) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    let dayNum, cellYear, cellMonth, isOther = false;

    if (i < firstDayOfWeek) {
      isOther = true;
      dayNum = prevMonthDays - firstDayOfWeek + 1 + i;
      cellMonth = month === 0 ? 11 : month - 1;
      cellYear = month === 0 ? year - 1 : year;
      cell.classList.add('other-month');
    } else if (i >= firstDayOfWeek + totalDays) {
      isOther = true;
      dayNum = i - firstDayOfWeek - totalDays + 1;
      cellMonth = month === 11 ? 0 : month + 1;
      cellYear = month === 11 ? year + 1 : year;
      cell.classList.add('other-month');
    } else {
      dayNum = i - firstDayOfWeek + 1;
      cellMonth = month;
      cellYear = year;
    }

    if (!isOther && dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      cell.classList.add('today');
    }

    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = dayNum;
    cell.appendChild(numEl);

    const dateKey = formatDateKey(new Date(cellYear, cellMonth, dayNum));
    const dayEvents = getEventsForDateKey(dateKey);

    const holidayInfo = getHolidayInfo(cellYear, cellMonth, dayNum);
    if (!isOther && dateKey === todayKey && dayEvents.length > 0) {
      cell.classList.add('today-event');
      const label = document.createElement('div');
      label.className = 'cal-day-event-label';
      label.textContent = 'Today';
      cell.appendChild(label);
    } else if (holidayInfo) {
      cell.classList.add('holiday-event');
      const label = document.createElement('div');
      label.className = 'cal-day-holiday-label';
      label.textContent = holidayInfo.name;
      label.title = holidayInfo.description;
      label.addEventListener('click', e => {
        e.stopPropagation();
        openHolidayPopup(holidayInfo, label);
      });
      cell.appendChild(label);
    }

    if (dayEvents.length) {
      const evWrap = document.createElement('div');
      evWrap.className = 'cal-events';
      
      const maxDisplay = 2;
      const visibleEvents = dayEvents.slice(0, maxDisplay);
      
      visibleEvents.forEach(event => {
        const chip = createEventChip(event);
        evWrap.appendChild(chip);
      });
      
      if (dayEvents.length > maxDisplay) {
        const moreBtn = document.createElement('div');
        moreBtn.className = 'cal-more-events';
        moreBtn.textContent = `+${dayEvents.length - maxDisplay} more`;
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDayEventsPopup(dateKey, dayEvents);
        });
        evWrap.appendChild(moreBtn);
      }
      
      cell.appendChild(evWrap);
    }

    calGrid.appendChild(cell);
  }
}

function createEventChip(ev, compact = false) {
  const chip = document.createElement('div');
  chip.className = `cal-event color-request ${compact ? 'compact' : ''}`;
  chip.textContent = compact ? `${ev.time ? `${ev.time} — ` : ''}${ev.title}` : ev.title;
  chip.title = `${ev.title}${ev.time ? ` • ${ev.time}` : ''}`;
  chip.addEventListener('click', e => {
    e.stopPropagation();
    openEventPopup(ev, chip);
  });
  return chip;
}

/* ============================================================
   EVENT POPUP
   ============================================================ */
const eventPopup        = document.getElementById('event-popup');
const eventPopupOverlay = document.getElementById('event-popup-overlay');
const eventPopupClose   = document.getElementById('event-popup-close');
const eventPopupBody    = document.getElementById('event-popup-body');

function openEventPopup(ev, chipEl) {
  let html = `<div class="ep-row"><span class="ep-label">Event Title : </span>${escHtml(ev.title)}</div>`;
  if (ev.date)        html += `<div class="ep-row"><span class="ep-label">Date : </span>${escHtml(ev.date)}</div>`;
  if (ev.time)        html += `<div class="ep-row"><span class="ep-label">Time : </span>${escHtml(ev.time)}</div>`;
  if (ev.requestedBy) html += `<div class="ep-row"><span class="ep-label">Requested By : </span>${escHtml(ev.requestedBy)}</div>`;
  if (ev.position)    html += `<div class="ep-row"><span class="ep-label">Position : </span>${escHtml(ev.position)}</div>`;
  if (ev.venue)       html += `<div class="ep-row"><span class="ep-label">Venue : </span>${escHtml(ev.venue)}</div>`;
  if (ev.eventDetails) html += `<div class="ep-row"><span class="ep-label">Details : </span>${escHtml(ev.eventDetails)}</div>`;
  if (ev.items)        html += `<div class="ep-row"><span class="ep-label">Items : </span>${escHtml(ev.items)}</div>`;

  eventPopupBody.innerHTML = html;

  const rect  = chipEl.getBoundingClientRect();
  const popup = eventPopup;
  popup.style.left = '';
  popup.style.top  = '';
  popup.classList.remove('hidden');
  eventPopupOverlay.classList.remove('hidden');

  const pw = popup.offsetWidth  || 300;
  const ph = popup.offsetHeight || 180;
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 6;

  if (left + pw > window.innerWidth - 16)  left = window.innerWidth - pw - 16;
  if (top + ph  > window.innerHeight - 16) top  = rect.top + window.scrollY - ph - 6;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;

  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';
}

function openDayEventsPopup(dateKey, events) {
  let html = `<div class="ep-row"><span class="ep-label">Date : </span>${escHtml(dateKey)}</div>`;
  html += `<div class="ep-row"><span class="ep-label">Events : </span>${events.length}</div>`;
  html += `<hr style="margin: 8px 0; border-color: #e2e6f0;">`;
  
  events.forEach((ev, index) => {
    html += `
      <div class="day-event-item">
        <div style="font-weight: 700; color: var(--blue-main);">${escHtml(ev.title)}</div>
        ${ev.time ? `<div style="font-size: 12px;"><strong>Time:</strong> ${escHtml(ev.time)}</div>` : ''}
        ${ev.venue ? `<div style="font-size: 12px;"><strong>Venue:</strong> ${escHtml(ev.venue)}</div>` : ''}
        ${ev.requestedBy ? `<div style="font-size: 12px;"><strong>Requested By:</strong> ${escHtml(ev.requestedBy)}</div>` : ''}
      </div>
      ${index < events.length - 1 ? '<hr style="margin: 8px 0;">' : ''}
    `;
  });

  eventPopupBody.innerHTML = html;
  const popup = eventPopup;
  popup.classList.remove('hidden');
  eventPopupOverlay.classList.remove('hidden');

  const pw = popup.offsetWidth  || 340;
  const ph = popup.offsetHeight || 400;
  let left = Math.max(16, (window.innerWidth - pw) / 2 + window.scrollX);
  let top  = Math.max(16, (window.innerHeight - ph) / 2 + window.scrollY);

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

function closeEventPopup() {
  eventPopup.classList.add('hidden');
  eventPopupOverlay.classList.add('hidden');
}

function openHolidayPopup(holidayInfo, labelEl) {
  let html = `<div class="ep-row"><span class="ep-label">Holiday : </span>${escHtml(holidayInfo.name)}</div>`;
  html += `<div class="ep-row"><span class="ep-label">Date : </span>${MONTHS[holidayInfo.month]} ${holidayInfo.day}</div>`;
  html += `<div class="ep-row"><span class="ep-label">Description : </span>${escHtml(holidayInfo.description)}</div>`;

  eventPopupBody.innerHTML = html;

  const rect  = labelEl.getBoundingClientRect();
  const popup = eventPopup;
  popup.classList.remove('hidden');
  eventPopupOverlay.classList.remove('hidden');

  const pw = popup.offsetWidth  || 300;
  const ph = popup.offsetHeight || 180;
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 6;

  if (left + pw > window.innerWidth - 16)  left = window.innerWidth - pw - 16;
  if (top + ph  > window.innerHeight - 16) top  = rect.top + window.scrollY - ph - 6;

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

eventPopupClose.addEventListener('click',   closeEventPopup);
eventPopupOverlay.addEventListener('click', closeEventPopup);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEventPopup(); });

function updateRequestsBadge() {
  const badge = document.getElementById('requests-badge');
  if (!badge) return;
  
  const pendingQuery = query(
    collection(db, 'requests'),
    where('status', '==', 'Pending')
  );
  
  onSnapshot(pendingQuery, (snapshot) => {
    const pendingCount = snapshot.size;
    if (pendingCount > 0) {
      badge.textContent = pendingCount > 99 ? '99+' : pendingCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  });
}

updateRequestsBadge();

window.addEventListener('ft:newRequest', (e) => {
  updateRequestsBadge();
  const requestId = e.detail?.requestId;
  showToast(`New request received${requestId ? `: ${requestId}` : ''}`, 'info');
});

window.addEventListener('ft:notificationClicked', (e) => {
  window.location.href = '../Requests/request.html';
});

/* ============================================================
   NOTIFICATION MANAGER - FACEBOOK STYLE
   Shows event requests (Pending, Approved, Rejected status)
   ============================================================ */

let notificationsUnsubscribe = null;
let currentNotifications = [];
let unreadCount = 0;
let isDropdownOpen = false;

// DOM Elements for notifications
const notificationBell = document.getElementById('notification-bell');
const notificationDropdown = document.getElementById('notification-dropdown');
const notificationList = document.getElementById('notification-list');
const notificationDot = document.getElementById('notification-dot');
const notificationBadge = document.getElementById('notification-badge');

// ── Initialize Notification Listener for Event Requests ────────────────────────
function initNotificationListener() {
  const adminId = sessionStorage.getItem('ft_admin_id');
  if (!adminId) {
    console.warn('[Notif] No admin ID found');
    return;
  }

  // Listen only to pending request documents so the notification dropdown
  // shows only pending requests.
  const q = query(
    collection(db, COLLECTIONS.REQUESTS),
    where('status', '==', 'Pending')
  );

  if (notificationList) {
    notificationList.innerHTML = '';
  }

  notificationsUnsubscribe = onSnapshot(q,
    (snapshot) => {
      const notifications = [];
      let pendingCount = 0;

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate?.() ||
          (typeof data.timestamp === 'number' ? new Date(data.timestamp) : new Date());
        const status = (data.status || 'Pending').toLowerCase();

        if (status === 'pending') pendingCount++;

        notifications.push({
          id: docSnap.id,
          ...data,
          createdAt
        });
      });

      currentNotifications = notifications;
      updateNotificationUI(pendingCount);
      renderNotificationList();

      if (pendingCount > unreadCount) {
        const newCount = pendingCount - unreadCount;
        showToast(`${newCount} new pending request${newCount !== 1 ? 's' : ''}`, 'info');
      }

      unreadCount = pendingCount;
    },
    (error) => {
      console.error('[Notif] Listener error:', error);
    }
  );
}

// ── Update UI Elements ──────────────────────────────────────
function updateNotificationUI(unread) {
  if (unread > 0) {
    notificationDot.style.display = 'block';
    notificationBadge.textContent = unread > 99 ? '99+' : unread;
    notificationBadge.style.display = 'flex';
  } else {
    notificationDot.style.display = 'none';
    notificationBadge.style.display = 'none';
  }
}

function clearNotificationIndicator() {
  notificationDot.style.display = 'none';
  notificationBadge.style.display = 'none';
}

// ── Get Status Badge HTML ───────────────────────────────────
function getStatusBadge(status) {
  const statusLower = (status || '').toLowerCase();
  if (statusLower === 'approved') {
    return '<span class="notif-status-badge approved">✓ Approved</span>';
  } else if (statusLower === 'rejected') {
    return '<span class="notif-status-badge rejected">✗ Rejected</span>';
  } else if (statusLower === 'pending') {
    return '<span class="notif-status-badge pending">⏳ Pending</span>';
  }
  return '';
}

// ── Render Notification List ────────────────────────────────
function renderNotificationList() {
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
    const status = notif.status || 'Pending';
    const eventName = notif.event || notif.title || notif.eventTitle || 'Facility Request';
    const requesterName = notif.fullname || notif.requestedBy || notif.requester || 'Unknown';
    const idNumber = notif.idNumber || notif.userId || '';
    const itemText = notif.item || notif.items || '';
    const venue = notif.venue || notif.location || '';
    const dateText = notif.date || '';
    const timeText = notif.startTime && notif.endTime ? `${notif.startTime} - ${notif.endTime}` : notif.startTime || notif.endTime || notif.time || '';
    const requestId = notif.requestId || '';
    const description = notif.eventDescription || notif.description || notif.details || '';
    const rejectedReason = notif.rejectedReason || '';

    const details = [];
    if (idNumber) details.push(`ID: ${escapeHtml(idNumber)}`);
    if (venue) details.push(`Venue: ${escapeHtml(venue)}`);
    if (dateText) details.push(`Date: ${escapeHtml(dateText)}`);
    if (timeText) details.push(`Time: ${escapeHtml(timeText)}`);
    if (itemText) details.push(`Items: ${escapeHtml(itemText)}`);
    if (requestId) details.push(`Request ID: ${escapeHtml(requestId)}`);
    if (rejectedReason) details.push(`Reason: ${escapeHtml(rejectedReason)}`);

    return `
      <div class="notification-item ${status.toLowerCase() === 'pending' ? 'unread' : ''}" data-notif-id="${notif.id}" data-request-id="${requestId}">
        <div class="notification-icon ${getNotificationIconClass(notif)}">
          ${getNotificationIcon(notif)}
        </div>
        <div class="notification-content">
          <div class="notification-title">
            ${escapeHtml(eventName)}
            ${getStatusBadge(status)}
          </div>
          <div class="notification-message">
            <strong>${escapeHtml(requesterName)}</strong>
            ${idNumber ? ` • ${escapeHtml(idNumber)}` : ''}
          </div>
          <div class="notification-details">
            ${details.map(line => `<div>${line}</div>`).join('')}
            ${description ? `<div>📝 ${escapeHtml(description)}</div>` : ''}
          </div>
          <div class="notification-time">${formatNotificationTime(notif.createdAt)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  document.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = '../Requests/request.html';
      closeNotificationDropdown();
    });
  });
}

// ── Get Notification Icon Class ───────────────────────────────────
function getNotificationIconClass(notif) {
  const status = notif.status || notif.type || '';
  const statusLower = status.toLowerCase();
  if (statusLower === 'approved') return 'approved';
  if (statusLower === 'rejected') return 'rejected';
  if (statusLower === 'pending') return 'pending';
  return 'info';
}

function getNotificationIcon(notif) {
  const status = notif.status || notif.type || '';
  const statusLower = status.toLowerCase();
  if (statusLower === 'approved') return '✓';
  if (statusLower === 'rejected') return '✗';
  if (statusLower === 'pending') return '⏳';
  return '📋';
}

// ── Mark Notification as Read ───────────────────────────────
async function markAsRead(notificationId) {
  try {
    const notifRef = doc(db, "Notification", notificationId);
    await updateDoc(notifRef, { read: true });
    console.log('[Notif] Marked as read:', notificationId);
  } catch (error) {
    console.error('[Notif] Error marking as read:', error);
  }
}

// ── Mark All as Read ────────────────────────────────────────
async function markAllAsRead() {
  const unreadNotifs = currentNotifications.filter(n => !n.read);
  if (unreadNotifs.length === 0) {
    showToast('No unread notifications', 'info');
    return;
  }
  
  try {
    const promises = unreadNotifs.map(notif => 
      updateDoc(doc(db, "Notification", notif.id), { read: true })
    );
    await Promise.all(promises);
    showToast(`Marked ${unreadNotifs.length} notification${unreadNotifs.length !== 1 ? 's' : ''} as read`, 'success');
  } catch (error) {
    console.error('[Notif] Error marking all as read:', error);
    showToast('Error marking notifications as read', 'error');
  }
}

// ── Format Notification Time ────────────────────────────────
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

// ── Toggle Notification Dropdown ───────────────────────────
function toggleNotificationDropdown() {
  isDropdownOpen = !isDropdownOpen;
  if (isDropdownOpen) {
    notificationDropdown.classList.add('show');
    renderNotificationList();
    clearNotificationIndicator();
  } else {
    notificationDropdown.classList.remove('show');
  }
}

function closeNotificationDropdown() {
  isDropdownOpen = false;
  notificationDropdown.classList.remove('show');
}

// ── Tab Switching ───────────────────────────────────────────
// ── Click Outside Handler ───────────────────────────────────
function setupClickOutsideHandler() {
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('notification-bell-wrapper');
    if (wrapper && !wrapper.contains(e.target) && isDropdownOpen) {
      closeNotificationDropdown();
    }
  });
}

// ── Stop Notification Listener ──────────────────────────────
function stopNotificationListener() {
  if (notificationsUnsubscribe) {
    notificationsUnsubscribe();
    notificationsUnsubscribe = null;
  }
}

// ── Initialize Notification System ──────────────────────────
function initNotificationSystem() {
  if (!notificationBell) {
    console.warn('[Notif] Notification bell not found');
    return;
  }
  
  // Initialize Firestore listener
  initNotificationListener();
  
  // Setup UI event listeners
  notificationBell.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotificationDropdown();
  });
  
  setupClickOutsideHandler();
  
  console.log('[Notif] Notification system initialized');
}

// Make stopNotificationListener available globally
window.stopNotificationListener = stopNotificationListener;

// Initialize notification system when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotificationSystem);
} else {
  initNotificationSystem();
}

/* ============================================================
   HELPER FUNCTIONS
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}

const escapeHtml = escHtml;

/* Initial render */
renderCalendar();