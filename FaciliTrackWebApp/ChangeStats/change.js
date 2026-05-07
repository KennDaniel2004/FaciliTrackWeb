/* =============================================
   FaciliTrack – Change Stats Logic
   ChangeStats/change.js

   AUTH FLOW:
   ┌────────────────────────────────────────────────────────────┐
   │ Action button clicked                                       │
   │   ↓                                                         │
   │   Is One-Time Login done this session?                      │
   │   NO  → Show OTL Modal (username + password)               │
   │         → Validate against Registered_Admin (Firestore)    │
   │         → Save adminDocId to sessionStorage                │
   │         → Does admin have changeStatsPasscode in DB?       │
   │           NO  → Show Passcode Registration                  │
   │                 → Save passcode to Firestore + session     │
   │                 → Open Detail Panel                        │
   │           YES → Show Passcode Entry                        │
   │                 → Validate → Open Detail Panel             │
   │   YES → Show Passcode Entry                                 │
   │         → Validate → Open Detail Panel                     │
   └────────────────────────────────────────────────────────────┘

   Collections:
   ┌─────────────────────────────────────────────┐
   │ requests          status == "Approved"       │
   │ Registered_User   status == "active"         │
   │ Registered_Admin  role == "admin"            │
   │   username, password, changeStatsPasscode    │
   └─────────────────────────────────────────────┘
   ============================================= */

import { db } from "../DatabaseConn/dbconn.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

/* ============================================================
   SESSION GUARD
   ============================================================ */
if (!sessionStorage.getItem('ft_admin_id')) {
  window.location.replace('../Auth/auth.login.html');
}

/* ============================================================
   TOPBAR
   ============================================================ */
const fullname = sessionStorage.getItem('ft_admin_fullname') || 'Admin';
const parts    = fullname.trim().split(' ');
const initials = (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
document.getElementById('topbar-fullname').textContent = fullname;
document.getElementById('topbar-avatar').textContent   = initials.toUpperCase();

/* ============================================================
   SIDEBAR
   ============================================================ */
const hamburger      = document.getElementById('hamburger');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const dashLayout     = document.getElementById('dash-layout');
let sidebarOpen      = window.innerWidth >= 768;

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
   LOGOUT
   ============================================================ */
const logoutModal    = document.getElementById('logout-modal');
const profileTrigger = document.getElementById('profile-trigger');
const dropdownMenu   = document.getElementById('dropdown-menu');

profileTrigger.addEventListener('click', e => {
  e.stopPropagation();
  dropdownMenu.classList.toggle('show');
});
document.addEventListener('click', e => {
  if (!profileTrigger.contains(e.target)) dropdownMenu.classList.remove('show');
});
document.getElementById('logout-btn').addEventListener('click', e => {
  e.stopPropagation();
  dropdownMenu.classList.remove('show');
  logoutModal.classList.remove('hidden');
});
document.getElementById('modal-cancel').addEventListener('click',  () => logoutModal.classList.add('hidden'));
document.getElementById('modal-overlay').addEventListener('click', () => logoutModal.classList.add('hidden'));
document.getElementById('modal-confirm').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.replace('../Auth/auth.login.html');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    logoutModal.classList.add('hidden');
    closeAllAuth();
    closeDetail();
    closeConfirm();
  }
});

/* ============================================================
   USER CACHE
   ============================================================ */
const userCache = new Map();

async function loadUserCache() {
  try {
    const snap = await getDocs(
      query(collection(db, 'Registered_User'), where('status', '==', 'active'))
    );
    snap.forEach(d => {
      const data = d.data();
      const uid  = data.UserID || d.id;
      userCache.set(uid, {
        firstName:  data.First_Name  || '',
        middleName: data.Middle_Name || '',
        lastName:   data.Last_Name   || '',
        fullName:   data.fullName    ||
                    `${data.First_Name || ''} ${data.Middle_Name || ''} ${data.Last_Name || ''}`.trim(),
        position:   data.Position    || '—',
      });
    });
    console.log(`✅ User cache loaded — ${userCache.size} active users`);
  } catch (err) {
    console.error('User cache load error:', err);
  }
}

/* ============================================================
   DATE HELPER
   ============================================================ */
function isFinished(dateStr, endTimeStr) {
  if (!dateStr) return false;
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    let endHour = 23, endMin = 59;
    if (endTimeStr) {
      const clean = endTimeStr.trim().toUpperCase();
      const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const period = match[3];
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        endHour = h; endMin = m;
      }
    }
    const eventEnd = new Date(year, month - 1, day, endHour, endMin, 0);
    return new Date() > eventEnd;
  } catch (_) { return false; }
}

/* ============================================================
   STATE
   ============================================================ */
let allRequests = [];
let searchTerm  = '';
let activeDocId = null;
let activeData  = null;

// Auth state persists for the session
let otlDone       = sessionStorage.getItem('ft_cs_otl_done') === 'true';
let csAdminDocId  = sessionStorage.getItem('ft_cs_admin_docid') || null;
let csPasscode    = sessionStorage.getItem('ft_cs_passcode')    || null; // cached in session
let pendingDocId  = null;  // request waiting to open after auth

/* ============================================================
   SEARCH
   ============================================================ */
document.getElementById('cs-search').addEventListener('input', function () {
  searchTerm = this.value.toLowerCase().trim();
  renderTable(filterRequests());
});

function filterRequests() {
  if (!searchTerm) return allRequests;
  return allRequests.filter(r =>
    (r.idNumber  || '').toLowerCase().includes(searchTerm) ||
    (r._fullName || '').toLowerCase().includes(searchTerm) ||
    (r._position || '').toLowerCase().includes(searchTerm) ||
    (r.event     || '').toLowerCase().includes(searchTerm) ||
    (r.venue     || '').toLowerCase().includes(searchTerm)
  );
}

/* ============================================================
   FIRESTORE — live listener
   ============================================================ */
async function init() {
  await loadUserCache();

  const approvedQuery = query(
    collection(db, 'requests'),
    where('status', '==', 'Approved')
  );

  onSnapshot(approvedQuery, (snapshot) => {
    allRequests = [];
    snapshot.forEach(docSnap => {
      const data = { _docId: docSnap.id, ...docSnap.data() };
      if (isFinished(data.date, data.endTime)) return;

      const uid  = data.idNumber || data.userId || '';
      const user = userCache.get(uid);
      data._fullName   = user?.fullName  || data.fullname || '—';
      data._position   = user?.position  || '—';
      data._firstName  = user?.firstName  || '';
      data._middleName = user?.middleName || '';
      data._lastName   = user?.lastName   || '';
      allRequests.push(data);
    });

    allRequests.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    renderTable(filterRequests());
  }, err => {
    console.error('Firestore listener error:', err);
    showToast('Failed to load requests: ' + err.message, 'error');
  });
}

init();

/* ============================================================
   RENDER TABLE
   ============================================================ */
const tbody   = document.getElementById('cs-tbody');
const emptyEl = document.getElementById('cs-empty');
const table   = document.getElementById('cs-table');

function renderTable(rows) {
  tbody.innerHTML = '';
  if (!rows.length) {
    table.style.display = 'none';
    emptyEl.classList.remove('hidden');
    return;
  }
  table.style.display = '';
  emptyEl.classList.add('hidden');

  rows.forEach(r => {
    const idNum    = escHtml(r.idNumber   || r.userId  || '—');
    const fname    = escHtml(r._fullName);
    const position = escHtml(r._position);
    const activity = escHtml(r.event      || '—');
    const venue    = escHtml(r.venue      || '—');
    const status   = escHtml(r.status     || 'Approved');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idNum}</td>
      <td>${fname}</td>
      <td>${position}</td>
      <td>${activity}</td>
      <td>${venue}</td>
      <td><span class="cs-status-badge">${status}</span></td>
      <td>
        <button class="cs-action-btn" data-id="${r._docId}"
                title="Reschedule" aria-label="Reschedule request">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               width="20" height="20">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.cs-action-btn').forEach(btn => {
    btn.addEventListener('click', () => handleActionClick(btn.dataset.id));
  });
}

/* ============================================================
   AUTH ENTRY POINT — called when action button clicked
   ============================================================ */
function handleActionClick(docId) {
  pendingDocId = docId;

  if (!otlDone) {
    // First time this session: show One Time Login
    openOtlModal();
  } else {
    // Already logged in: just ask for passcode every time
    openPcEntryModal();
  }
}

/* ============================================================
   EYE TOGGLE HELPER
   ============================================================ */
const EYE_OPEN = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
       width="18" height="18">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;

const EYE_CLOSED = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
       width="18" height="18">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;

function setupEyeToggle(eyeBtn, inputEl) {
  eyeBtn.innerHTML = EYE_CLOSED;
  eyeBtn.addEventListener('click', () => {
    const isPassword = inputEl.type === 'password';
    inputEl.type = isPassword ? 'text' : 'password';
    eyeBtn.innerHTML = isPassword ? EYE_OPEN : EYE_CLOSED;
  });
}

/* ============================================================
   ONE TIME LOGIN MODAL
   ============================================================ */
const otlModal    = document.getElementById('otl-modal');
const otlOverlay  = document.getElementById('otl-overlay');
const otlUsername = document.getElementById('otl-username');
const otlPassword = document.getElementById('otl-password');
const otlError    = document.getElementById('otl-error');
const otlLoginBtn = document.getElementById('otl-login-btn');
const otlBtnText  = document.getElementById('otl-btn-text');

// Setup eye toggle
setupEyeToggle(document.getElementById('otl-eye'), otlPassword);

function openOtlModal() {
  otlUsername.value = '';
  otlPassword.value = '';
  otlError.classList.add('hidden');
  otlUsername.classList.remove('input-error');
  otlPassword.classList.remove('input-error');
  otlModal.classList.remove('hidden');
  setTimeout(() => otlUsername.focus(), 100);
}

function closeOtlModal() {
  otlModal.classList.add('hidden');
}

otlOverlay.addEventListener('click', closeOtlModal);

otlLoginBtn.addEventListener('click', performOtlLogin);
otlPassword.addEventListener('keydown', e => { if (e.key === 'Enter') performOtlLogin(); });

async function performOtlLogin() {
  const username = otlUsername.value.trim();
  const password = otlPassword.value.trim();

  if (!username || !password) {
    setAuthError(otlError, 'Please enter both username and password.');
    if (!username) otlUsername.classList.add('input-error');
    if (!password) otlPassword.classList.add('input-error');
    return;
  }

  otlLoginBtn.disabled = true;
  otlBtnText.textContent = 'Verifying…';
  otlError.classList.add('hidden');
  otlUsername.classList.remove('input-error');
  otlPassword.classList.remove('input-error');

  try {
    // Query Registered_Admin collection for matching credentials
    const adminQuery = query(
      collection(db, 'Registered_Admin'),
      where('username', '==', username),
      where('password', '==', password),
      where('status',   '==', 'active')
    );
    const snap = await getDocs(adminQuery);

    if (snap.empty) {
      setAuthError(otlError, 'Invalid username or password.');
      otlUsername.classList.add('input-error');
      otlPassword.classList.add('input-error');
      return;
    }

    // Valid admin found
    const adminDoc  = snap.docs[0];
    csAdminDocId    = adminDoc.id;
    const adminData = adminDoc.data();

    // Mark One Time Login as done for this session
    sessionStorage.setItem('ft_cs_otl_done', 'true');
    sessionStorage.setItem('ft_cs_admin_docid', csAdminDocId);
    otlDone = true;

    closeOtlModal();

    // Check if passcode already registered
    if (adminData.changeStatsPasscode) {
      // Passcode exists — cache it in session and show entry
      csPasscode = adminData.changeStatsPasscode;
      sessionStorage.setItem('ft_cs_passcode', csPasscode);
      openPcEntryModal();
    } else {
      // No passcode — show registration
      openPcRegModal();
    }

  } catch (err) {
    console.error('OTL Login error:', err);
    setAuthError(otlError, 'Login failed. Please try again.');
  } finally {
    otlLoginBtn.disabled = false;
    otlBtnText.textContent = 'Login';
  }
}

/* ============================================================
   PASSCODE REGISTRATION MODAL
   ============================================================ */
const pcregModal    = document.getElementById('pcreg-modal');
const pcregOverlay  = document.getElementById('pcreg-overlay');
const pcregPass     = document.getElementById('pcreg-pass');
const pcregConfirm  = document.getElementById('pcreg-confirm');
const pcregError    = document.getElementById('pcreg-error');
const pcregEnterBtn = document.getElementById('pcreg-enter-btn');
const pcregBtnText  = document.getElementById('pcreg-btn-text');

setupEyeToggle(document.getElementById('pcreg-eye1'), pcregPass);
setupEyeToggle(document.getElementById('pcreg-eye2'), pcregConfirm);

function openPcRegModal() {
  pcregPass.value    = '';
  pcregConfirm.value = '';
  pcregError.classList.add('hidden');
  pcregPass.classList.remove('input-error');
  pcregConfirm.classList.remove('input-error');
  pcregModal.classList.remove('hidden');
  setTimeout(() => pcregPass.focus(), 100);
}

function closePcRegModal() {
  pcregModal.classList.add('hidden');
}

pcregOverlay.addEventListener('click', closePcRegModal);

pcregEnterBtn.addEventListener('click', performPcRegistration);
pcregConfirm.addEventListener('keydown', e => { if (e.key === 'Enter') performPcRegistration(); });

async function performPcRegistration() {
  const pass    = pcregPass.value.trim();
  const confirm = pcregConfirm.value.trim();

  if (!pass || !confirm) {
    setAuthError(pcregError, 'Please fill in both passcode fields.');
    if (!pass)    pcregPass.classList.add('input-error');
    if (!confirm) pcregConfirm.classList.add('input-error');
    return;
  }

  if (pass.length < 4) {
    setAuthError(pcregError, 'Passcode must be at least 4 characters.');
    pcregPass.classList.add('input-error');
    return;
  }

  if (pass !== confirm) {
    setAuthError(pcregError, 'Passcodes do not match. Try again.');
    pcregConfirm.classList.add('input-error');
    pcregConfirm.value = '';
    setTimeout(() => pcregConfirm.focus(), 50);
    return;
  }

  pcregEnterBtn.disabled = true;
  pcregBtnText.textContent = 'Saving…';
  pcregError.classList.add('hidden');

  try {
    // Save passcode to Firestore admin document
    await updateDoc(doc(db, 'Registered_Admin', csAdminDocId), {
      changeStatsPasscode: pass,
      passcodeRegisteredAt: serverTimestamp()
    });

    // Cache in session
    csPasscode = pass;
    sessionStorage.setItem('ft_cs_passcode', csPasscode);

    closePcRegModal();
    showToast('Passcode registered successfully.', 'success');

    // Proceed to open the detail panel
    openDetail(pendingDocId);

  } catch (err) {
    console.error('Passcode registration error:', err);
    setAuthError(pcregError, 'Failed to save passcode. Try again.');
  } finally {
    pcregEnterBtn.disabled = false;
    pcregBtnText.textContent = 'Enter';
  }
}

/* ============================================================
   PASSCODE ENTRY MODAL (every time feature is accessed)
   ============================================================ */
const pcentryModal    = document.getElementById('pcentry-modal');
const pcentryOverlay  = document.getElementById('pcentry-overlay');
const pcentryPass     = document.getElementById('pcentry-pass');
const pcentryError    = document.getElementById('pcentry-error');
const pcentryEnterBtn = document.getElementById('pcentry-enter-btn');
const pcentryBtnText  = document.getElementById('pcentry-btn-text');

setupEyeToggle(document.getElementById('pcentry-eye'), pcentryPass);

function openPcEntryModal() {
  pcentryPass.value = '';
  pcentryError.classList.add('hidden');
  pcentryPass.classList.remove('input-error');
  pcentryModal.classList.remove('hidden');
  setTimeout(() => pcentryPass.focus(), 100);
}

function closePcEntryModal() {
  pcentryModal.classList.add('hidden');
}

pcentryOverlay.addEventListener('click', closePcEntryModal);

pcentryEnterBtn.addEventListener('click', performPcEntry);
pcentryPass.addEventListener('keydown', e => { if (e.key === 'Enter') performPcEntry(); });

async function performPcEntry() {
  const entered = pcentryPass.value.trim();

  if (!entered) {
    setAuthError(pcentryError, 'Please enter your passcode.');
    pcentryPass.classList.add('input-error');
    return;
  }

  pcentryEnterBtn.disabled = true;
  pcentryBtnText.textContent = 'Checking…';
  pcentryError.classList.add('hidden');
  pcentryPass.classList.remove('input-error');

  try {
    // Use cached passcode first; if not cached, fetch from Firestore
    if (!csPasscode && csAdminDocId) {
      const adminSnap = await getDoc(doc(db, 'Registered_Admin', csAdminDocId));
      if (adminSnap.exists()) {
        csPasscode = adminSnap.data().changeStatsPasscode || null;
        if (csPasscode) sessionStorage.setItem('ft_cs_passcode', csPasscode);
      }
    }

    if (entered === csPasscode) {
      closePcEntryModal();
      openDetail(pendingDocId);
    } else {
      setAuthError(pcentryError, 'Incorrect passcode. Try again.');
      pcentryPass.classList.add('input-error');
      pcentryPass.value = '';
      setTimeout(() => pcentryPass.focus(), 50);
    }

  } catch (err) {
    console.error('Passcode entry error:', err);
    setAuthError(pcentryError, 'Verification failed. Try again.');
  } finally {
    pcentryEnterBtn.disabled = false;
    pcentryBtnText.textContent = 'Enter';
  }
}

/* ============================================================
   CLOSE ALL AUTH MODALS
   ============================================================ */
function closeAllAuth() {
  otlModal.classList.add('hidden');
  pcregModal.classList.add('hidden');
  pcentryModal.classList.add('hidden');
}

/* ============================================================
   AUTH ERROR HELPER
   ============================================================ */
function setAuthError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ============================================================
   DETAIL PANEL
   ============================================================ */
const detailOverlay = document.getElementById('detail-overlay');
const detailPanel   = document.getElementById('detail-panel');
const detailInfo    = document.getElementById('detail-info');
const reasonInput   = document.getElementById('reschedule-reason');
const btnReschedule = document.getElementById('btn-reschedule');
const detailBackBtn = document.getElementById('detail-back-btn');

function openDetail(docId) {
  const r = allRequests.find(req => req._docId === docId);
  if (!r) return;

  activeDocId = docId;
  activeData  = r;
  reasonInput.value = '';

  const uid  = r.idNumber || r.userId || '';
  const user = userCache.get(uid);

  const displayId  = escHtml(uid || '—');
  const firstName  = escHtml(user?.firstName  || r._firstName  || '—');
  const middleName = escHtml(user?.middleName || r._middleName || '—');
  const lastName   = escHtml(user?.lastName   || r._lastName   || '—');
  const fullName   = escHtml(user?.fullName   || r._fullName   || '—');
  const position   = escHtml(user?.position   || r._position   || '—');

  detailInfo.innerHTML =
    infoRow('Request ID',      r.requestId        || r._docId)
  + infoRow('User ID',         displayId)
  + infoRow('First Name',      firstName)
  + infoRow('Middle Name',     middleName)
  + infoRow('Last Name',       lastName)
  + infoRow('Full Name',       fullName)
  + infoRow('Position',        position)
  + infoRow('Event',           r.event            || '—')
  + infoRow('Description',     r.eventDescription || '—')
  + infoRow('Venue',           r.venue            || '—')
  + infoRow('Date',            r.date             || '—')
  + infoRow('Start Time',      r.startTime        || '—')
  + infoRow('End Time',        r.endTime          || '—')
  + infoRow('Items/Equipment', r.item             || '—')
  + infoRow('Status',          r.status           || '—');

  detailOverlay.classList.remove('hidden');
  detailPanel.classList.remove('hidden');
  reasonInput.focus();
}

function infoRow(label, value) {
  return `
    <div class="detail-info-row">
      <span class="detail-info-label">${escHtml(label)}</span>
      <span class="detail-info-value">${escHtml(String(value ?? '—'))}</span>
    </div>`;
}

function closeDetail() {
  detailOverlay.classList.add('hidden');
  detailPanel.classList.add('hidden');
  activeDocId = null;
  activeData  = null;
}

// Back button closes the detail panel
detailBackBtn.addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', closeDetail);

/* Validate reason → open confirmation */
btnReschedule.addEventListener('click', () => {
  const reason = reasonInput.value.trim();
  if (!reason) {
    reasonInput.style.borderColor = '#dc2626';
    reasonInput.placeholder = '⚠ Please enter a reason first.';
    reasonInput.focus();
    setTimeout(() => {
      reasonInput.style.borderColor = '';
      reasonInput.placeholder = 'Enter reason for rescheduling…';
    }, 2500);
    return;
  }
  openConfirm();
});

/* ============================================================
   CONFIRMATION MODAL
   ============================================================ */
const confirmModal   = document.getElementById('confirm-modal');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmOk      = document.getElementById('confirm-ok');
const confirmCancel  = document.getElementById('confirm-cancel');

function openConfirm()  { confirmModal.classList.remove('hidden'); }
function closeConfirm() { confirmModal.classList.add('hidden'); }

confirmCancel.addEventListener('click',  closeConfirm);
confirmOverlay.addEventListener('click', closeConfirm);
confirmOk.addEventListener('click', async () => {
  closeConfirm();
  await performReschedule();
});

/* ============================================================
   PERFORM RESCHEDULE
   ============================================================ */
async function performReschedule() {
  if (!activeDocId) return;

  const reason    = reasonInput.value.trim();
  const adminId   = sessionStorage.getItem('ft_admin_id')       || '';
  const adminName = sessionStorage.getItem('ft_admin_username')  ||
                    sessionStorage.getItem('ft_admin_fullname')  || 'Admin';

  btnReschedule.disabled    = true;
  btnReschedule.textContent = 'Saving…';

  try {
    await updateDoc(doc(db, 'requests', activeDocId), {
      status:            'Rescheduled',
      rescheduleReason:  reason,
      rescheduledAt:     serverTimestamp(),
      rescheduledBy:     adminId,
      rescheduledByName: adminName,
    });

    console.log('✅ Rescheduled:', activeDocId);
    closeDetail();
    showToast('Request successfully rescheduled.', 'success');

  } catch (err) {
    console.error('Reschedule error:', err);
    showToast('Failed to reschedule: ' + err.message, 'error');
  } finally {
    btnReschedule.disabled    = false;
    btnReschedule.textContent = 'Reschedule';
  }
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg, type) {
  document.querySelectorAll('.cs-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'cs-toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed; bottom:28px; left:50%;
    transform:translateX(-50%);
    background:${type === 'success' ? '#065f46' : '#991b1b'};
    color:#fff; padding:12px 28px; border-radius:30px;
    font-size:14px; font-weight:600; z-index:9999;
    box-shadow:0 6px 24px rgba(0,0,0,.2);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ============================================================
   HELPER
   ============================================================ */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]
  );
}