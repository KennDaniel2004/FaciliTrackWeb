/* =============================================
   FaciliTrack – Change Stats Logic
   ============================================= */

import {
  db,
  auth,
  COLLECTIONS,
  getCurrentAdmin,
  formatTimestamp,
  formatDate,
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  onAuthStateChanged,
  signOut
} from "../DatabaseConn/dbconn.js";
import { initPendingRequestNotifications } from "../HomeDashboard/notification-panel.js";
import { generateWordDocument } from './generateWordDocument.js';

/* ============================================================
   SIDEBAR & TOPBAR (Same as Dashboard)
   ============================================================ */
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const dashLayout = document.getElementById('dash-layout');
const historyMenu = document.getElementById('historyMenu');
const historySub = document.getElementById('historySub');
const historyArrow = document.getElementById('historyArrow');

let sidebarOpen = window.innerWidth >= 768;

function setSidebar(open) {
  if (!sidebar) return;
  sidebarOpen = open;
  sidebar.classList.toggle('open', open);
  if (sidebarOverlay) sidebarOverlay.classList.toggle('show', open && window.innerWidth < 768);
  if (hamburger) hamburger.classList.toggle('open', open);
  if (window.innerWidth >= 768) {
    sidebar.classList.toggle('force-closed', !open);
    if (dashLayout) dashLayout.classList.toggle('sidebar-closed', !open);
  }
}

if (hamburger) {
  hamburger.addEventListener('click', () => setSidebar(!sidebarOpen));
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => setSidebar(false));
}
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768 && sidebarOverlay) sidebarOverlay.classList.remove('show');
});
setSidebar(sidebarOpen);

// History submenu toggle
if (historyArrow) {
  historyArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    historyMenu.classList.toggle('expanded');
    historySub.classList.toggle('open');
  });
}
if (historyMenu) {
  historyMenu.addEventListener('click', (e) => {
    if (e.target === historyArrow || (historyArrow && historyArrow.contains(e.target))) return;
    historyMenu.classList.toggle('expanded');
    historySub.classList.toggle('open');
  });
}
if (historySub) historySub.classList.add('open');
if (historyMenu) historyMenu.classList.add('expanded');

/* ============================================================
   TOPBAR PROFILE
   ============================================================ */
const adminFullName = document.getElementById('topbar-fullname');
const adminAvatar = document.getElementById('topbar-avatar');
const profileTrigger = document.getElementById('profile-trigger');
const dropdownMenu = document.getElementById('dropdown-menu');

const adminData = getCurrentAdmin();
if (adminData) {
  const displayName = adminData.fullName || adminData.username || 'Admin';
  if (adminFullName) adminFullName.textContent = displayName;
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (adminAvatar) adminAvatar.textContent = initials;
}

if (profileTrigger) {
  profileTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('show');
  });
  document.addEventListener('click', () => {
    dropdownMenu?.classList.remove('show');
  });
  initPendingRequestNotifications();
}

/* ============================================================
   LOGOUT
   ============================================================ */
const logoutModal = document.getElementById('logout-modal');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const modalOverlay = document.getElementById('modal-overlay');

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (logoutModal) logoutModal.classList.remove('hidden');
});
modalCancel?.addEventListener('click', () => {
  if (logoutModal) logoutModal.classList.add('hidden');
});
modalOverlay?.addEventListener('click', () => {
  if (logoutModal) logoutModal.classList.add('hidden');
});
modalConfirm?.addEventListener('click', async () => {
  await signOut(auth);
  sessionStorage.clear();
  window.location.href = '../Auth/auth.login.html';
});

/* ============================================================
   FULLSCREEN TOGGLE
   ============================================================ */
const topbarExpand = document.getElementById('topbar-expand');
if (topbarExpand) {
  topbarExpand.addEventListener('click', async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  });
}

/* ============================================================
   EYE TOGGLE HELPER
   ============================================================ */
function setupEyeToggle(eyeBtn, inputEl) {
  if (!eyeBtn || !inputEl) return;
  let isVisible = false;
  eyeBtn.addEventListener('click', () => {
    isVisible = !isVisible;
    inputEl.type = isVisible ? 'text' : 'password';
    eyeBtn.innerHTML = isVisible ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    ` : `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    `;
  });
}

setupEyeToggle(document.getElementById('otl-eye'), document.getElementById('otl-password'));
setupEyeToggle(document.getElementById('pcreg-eye1'), document.getElementById('pcreg-pass'));
setupEyeToggle(document.getElementById('pcreg-eye2'), document.getElementById('pcreg-confirm'));
setupEyeToggle(document.getElementById('pcentry-eye'), document.getElementById('pcentry-pass'));

/* ============================================================
   STATE
   ============================================================ */
let allRequests = [];
let searchTerm = '';
let activeDocId = null;
let activeData = null;
let pendingDocId = null;
let isLoading = true;
let isActionInProgress = false;

let otlDone = sessionStorage.getItem('ft_cs_otl_done') === 'true';
let csAdminDocId = sessionStorage.getItem('ft_cs_admin_docid') || null;
let csPasscode = sessionStorage.getItem('ft_cs_passcode') || null;

/* ============================================================
   SKELETON LOADING FUNCTIONS
   ============================================================ */

function showSkeletonTable() {
  const tbody = document.getElementById('cs-tbody');
  const emptyEl = document.getElementById('cs-empty');
  if (emptyEl) emptyEl.classList.add('hidden');

  if (tbody) {
    tbody.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.className = 'skeleton-row';
      tr.innerHTML = `
        <td><div class="skeleton skeleton-cell-text"></div></td>
        <td><div class="skeleton skeleton-cell-text"></div></td>
        <td><div class="skeleton skeleton-cell-short"></div></td>
        <td><div class="skeleton skeleton-cell-text"></div></td>
        <td><div class="skeleton skeleton-cell-short"></div></td>
        <td><div class="skeleton skeleton-cell-short" style="width: 40px;"></div></td>
        <td>
          <div class="skeleton-actions">
            <div class="skeleton-icon"></div>
            <div class="skeleton-icon"></div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }
}

function removeSkeletonTable() {
  const skeletonRows = document.querySelectorAll('.skeleton-row');
  skeletonRows.forEach(row => row.remove());
}

function showSkeletonDetail() {
  const detailInfo = document.getElementById('detail-info');
  if (detailInfo) {
    detailInfo.innerHTML = `
      <div class="skeleton-modal-details">
        <div class="skeleton-detail-row">
          <div class="skeleton skeleton-detail-label"></div>
          <div class="skeleton skeleton-detail-value"></div>
        </div>
        <div class="skeleton-detail-row">
          <div class="skeleton skeleton-detail-label"></div>
          <div class="skeleton skeleton-detail-value"></div>
        </div>
        <div class="skeleton-detail-row">
          <div class="skeleton skeleton-detail-label"></div>
          <div class="skeleton skeleton-detail-value"></div>
        </div>
        <div class="skeleton-detail-row">
          <div class="skeleton skeleton-detail-label"></div>
          <div class="skeleton skeleton-detail-value-full"></div>
        </div>
        <div class="skeleton-detail-row">
          <div class="skeleton skeleton-detail-label"></div>
          <div class="skeleton skeleton-detail-value"></div>
        </div>
        <div class="skeleton-detail-row">
          <div class="skeleton skeleton-detail-label"></div>
          <div class="skeleton skeleton-detail-value"></div>
        </div>
      </div>
    `;
  }

  const reasonInput = document.getElementById('reschedule-reason');
  if (reasonInput) {
    reasonInput.placeholder = 'Loading...';
    reasonInput.disabled = true;
  }

  const btnReschedule = document.getElementById('btn-reschedule');
  if (btnReschedule) {
    btnReschedule.disabled = true;
    btnReschedule.textContent = 'Loading...';
  }
}

function showButtonLoading(button, text) {
  if (!button) return;
  button.disabled = true;
  button.style.opacity = '0.7';
  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="skeleton-spinner" style="width: 20px; height: 20px; border-width: 2px; display: inline-block; margin-right: 8px;"></span> ' + text;
  return originalContent;
}

function restoreButton(button, originalText, originalHTML = null) {
  if (!button) return;
  button.disabled = false;
  button.style.opacity = '1';
  if (originalHTML) {
    button.innerHTML = originalHTML;
  } else {
    button.textContent = originalText;
  }
}

function showToastMessage(message, type = 'success') {
  const existingToast = document.querySelector('.cs-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `cs-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   DOCUMENT GENERATION MODAL
   ============================================================ */
const docGenModal = document.getElementById('doc-gen-modal');
const docGenOverlay = document.getElementById('doc-gen-overlay');
const docGenClose = document.getElementById('doc-gen-close');
const generateWordBtn = document.getElementById('generate-word-btn');
let currentDocGenRequest = null;

function openDocumentGenerator(requestData) {
  console.log('Opening document generator for:', requestData);
  currentDocGenRequest = requestData;
  if (docGenModal) {
    docGenModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    console.error('Document generator modal not found');
    showToastMessage('Document generator not available', 'error');
  }
}

function closeDocumentGenerator() {
  if (docGenModal) {
    docGenModal.classList.add('hidden');
    document.body.style.overflow = '';
    currentDocGenRequest = null;
  }
}

if (docGenOverlay) {
  docGenOverlay.addEventListener('click', closeDocumentGenerator);
}
if (docGenClose) {
  docGenClose.addEventListener('click', closeDocumentGenerator);
}
if (generateWordBtn) {
  generateWordBtn.addEventListener('click', () => {
    if (currentDocGenRequest) {
      generateWordDocument(currentDocGenRequest);
      closeDocumentGenerator();
    } else {
      showToastMessage('No request data available', 'error');
    }
  });
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && docGenModal && !docGenModal.classList.contains('hidden')) {
    closeDocumentGenerator();
  }
});

/* ============================================================
   USER CACHE
   ============================================================ */
const userCache = new Map();

async function loadUserCache() {
  try {
    // NOTE: Remove the where('status','==','active') clause if your users
    // don't have a status field, or it will return 0 results silently.
    const snap = await getDocs(collection(db, COLLECTIONS.REGISTERED_USERS));
    snap.forEach(d => {
      const data = d.data();
      const uid = data.UserID || d.id;
      userCache.set(uid, {
        firstName:  data.First_Name  || '',
        middleName: data.Middle_Name || '',
        lastName:   data.Last_Name   || '',
        fullName:   data.fullName    || `${data.First_Name || ''} ${data.Middle_Name || ''} ${data.Last_Name || ''}`.trim(),
        position:   data.Position    || 'Faculty',
      });
    });
    console.log(`✅ User cache loaded — ${userCache.size} users`);
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
   FIRESTORE LISTENER
   ============================================================ */
async function init() {
  showSkeletonTable();
  await loadUserCache();

  const approvedQuery = query(collection(db, 'requests'), where('status', '==', 'Approved'));

  onSnapshot(approvedQuery, (snapshot) => {
    allRequests = [];
    snapshot.forEach(docSnap => {
      const data = { _docId: docSnap.id, ...docSnap.data() };
      if (isFinished(data.date, data.endTime)) return;

      const uid = data.idNumber || data.userId || '';
      const user = userCache.get(uid);
      data._fullName  = user?.fullName    || data.fullname || '—';
      data._position  = user?.position    || '—';
      data._firstName = user?.firstName   || '';
      data._middleName = user?.middleName || '';
      data._lastName  = user?.lastName    || '';
      allRequests.push(data);
    });

    allRequests.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    removeSkeletonTable();
    isLoading = false;
    renderTable(filterRequests());
  }, err => {
    console.error('Firestore listener error:', err);
    removeSkeletonTable();
    isLoading = false;
    showToastMessage('Failed to load requests: ' + err.message, 'error');
  });
}

init();

/* ============================================================
   RENDER TABLE
   ============================================================ */
const tbody = document.getElementById('cs-tbody');
const emptyEl = document.getElementById('cs-empty');
const table = document.getElementById('cs-table');

function filterRequests() {
  if (!searchTerm) return allRequests;
  return allRequests.filter(r =>
    (r.idNumber   || '').toLowerCase().includes(searchTerm) ||
    (r._fullName  || '').toLowerCase().includes(searchTerm) ||
    (r._position  || '').toLowerCase().includes(searchTerm) ||
    (r.event      || '').toLowerCase().includes(searchTerm) ||
    (r.venue      || '').toLowerCase().includes(searchTerm)
  );
}

function renderTable(rows) {
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!rows.length) {
    if (table) table.style.display = 'none';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  if (table) table.style.display = '';
  if (emptyEl) emptyEl.classList.add('hidden');

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.idNumber || r.userId || '—')}</td>
      <td>${escapeHtml(r._fullName)}</td>
      <td>${escapeHtml(r._position)}</td>
      <td>${escapeHtml(r.event || '—')}</td>
      <td>${escapeHtml(r.venue || '—')}</td>
      <td><span class="cs-status-badge">Approved</span></td>
      <td class="cs-action-cell">
        <button class="cs-action-btn cs-action-btn--edit" data-id="${r._docId}" title="Reschedule">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="cs-action-btn cs-action-btn--doc" data-id="${r._docId}" title="Generate Document">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Reschedule button
  tbody.querySelectorAll('.cs-action-btn--edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleActionClick(btn.dataset.id);
    });
  });

  // Document generation button
  tbody.querySelectorAll('.cs-action-btn--doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const docId = btn.dataset.id;
      const request = allRequests.find(req => req._docId === docId);
      if (request) {
        openDocumentGenerator(request);
      } else {
        showToastMessage('Request data not found', 'error');
      }
    });
  });
}

/* ============================================================
   AUTH MODALS
   ============================================================ */
const otlModal     = document.getElementById('otl-modal');
const otlOverlay   = document.getElementById('otl-overlay');
const otlUsername  = document.getElementById('otl-username');
const otlPassword  = document.getElementById('otl-password');
const otlError     = document.getElementById('otl-error');
const otlLoginBtn  = document.getElementById('otl-login-btn');

const pcregModal    = document.getElementById('pcreg-modal');
const pcregOverlay  = document.getElementById('pcreg-overlay');
const pcregPass     = document.getElementById('pcreg-pass');
const pcregConfirm  = document.getElementById('pcreg-confirm');
const pcregError    = document.getElementById('pcreg-error');
const pcregEnterBtn = document.getElementById('pcreg-enter-btn');

const pcentryModal    = document.getElementById('pcentry-modal');
const pcentryOverlay  = document.getElementById('pcentry-overlay');
const pcentryPass     = document.getElementById('pcentry-pass');
const pcentryError    = document.getElementById('pcentry-error');
const pcentryEnterBtn = document.getElementById('pcentry-enter-btn');

function openOtlModal() {
  if (otlUsername) otlUsername.value = '';
  if (otlPassword) otlPassword.value = '';
  if (otlError) otlError.classList.add('hidden');
  if (otlModal) otlModal.classList.remove('hidden');
  setTimeout(() => otlUsername?.focus(), 100);
}

function closeOtlModal() {
  if (otlModal) otlModal.classList.add('hidden');
}

function openPcRegModal() {
  if (pcregPass) pcregPass.value = '';
  if (pcregConfirm) pcregConfirm.value = '';
  if (pcregError) pcregError.classList.add('hidden');
  if (pcregModal) pcregModal.classList.remove('hidden');
  setTimeout(() => pcregPass?.focus(), 100);
}

function closePcRegModal() {
  if (pcregModal) pcregModal.classList.add('hidden');
}

function openPcEntryModal() {
  if (pcentryPass) pcentryPass.value = '';
  if (pcentryError) pcentryError.classList.add('hidden');
  if (pcentryModal) pcentryModal.classList.remove('hidden');
  setTimeout(() => pcentryPass?.focus(), 100);
}

function closePcEntryModal() {
  if (pcentryModal) pcentryModal.classList.add('hidden');
}

if (otlOverlay)    otlOverlay.addEventListener('click', closeOtlModal);
if (pcregOverlay)  pcregOverlay.addEventListener('click', closePcRegModal);
if (pcentryOverlay) pcentryOverlay.addEventListener('click', closePcEntryModal);

/* ============================================================
   ONE TIME LOGIN
   ============================================================ */
async function performOtlLogin() {
  const username = otlUsername?.value.trim() || '';
  const password = otlPassword?.value.trim() || '';

  if (!username || !password) {
    if (otlError) {
      otlError.textContent = 'Please enter both username and password.';
      otlError.classList.remove('hidden');
    }
    return;
  }

  let originalButtonHTML = null;
  if (otlLoginBtn) {
    originalButtonHTML = otlLoginBtn.innerHTML;
    showButtonLoading(otlLoginBtn, 'Verifying...');
  }
  if (otlError) otlError.classList.add('hidden');

  try {
    const adminQuery = query(
      collection(db, 'Registered_Admin'),
      where('username', '==', username),
      where('password', '==', password),
      where('status', '==', 'active')
    );
    const snap = await getDocs(adminQuery);

    if (snap.empty) {
      if (otlError) {
        otlError.textContent = 'Invalid username or password.';
        otlError.classList.remove('hidden');
      }
      return;
    }

    const adminDoc  = snap.docs[0];
    csAdminDocId    = adminDoc.id;
    const adminInfo = adminDoc.data();

    sessionStorage.setItem('ft_cs_otl_done', 'true');
    sessionStorage.setItem('ft_cs_admin_docid', csAdminDocId);
    otlDone = true;

    closeOtlModal();

    if (adminInfo.changeStatsPasscode) {
      csPasscode = adminInfo.changeStatsPasscode;
      sessionStorage.setItem('ft_cs_passcode', csPasscode);
      openPcEntryModal();
    } else {
      openPcRegModal();
    }

  } catch (err) {
    console.error('OTL Login error:', err);
    if (otlError) {
      otlError.textContent = 'Login failed. Please try again.';
      otlError.classList.remove('hidden');
    }
  } finally {
    if (otlLoginBtn) restoreButton(otlLoginBtn, 'Login', originalButtonHTML);
  }
}

if (otlLoginBtn) otlLoginBtn.addEventListener('click', performOtlLogin);
if (otlPassword) otlPassword.addEventListener('keydown', e => { if (e.key === 'Enter') performOtlLogin(); });

/* ============================================================
   PASSCODE REGISTRATION
   ============================================================ */
async function performPcRegistration() {
  const pass    = pcregPass?.value.trim()    || '';
  const confirm = pcregConfirm?.value.trim() || '';

  if (!pass || !confirm) {
    if (pcregError) {
      pcregError.textContent = 'Please fill in both passcode fields.';
      pcregError.classList.remove('hidden');
    }
    return;
  }

  if (pass.length < 4) {
    if (pcregError) {
      pcregError.textContent = 'Passcode must be at least 4 characters.';
      pcregError.classList.remove('hidden');
    }
    return;
  }

  if (pass !== confirm) {
    if (pcregError) {
      pcregError.textContent = 'Passcodes do not match.';
      pcregError.classList.remove('hidden');
    }
    if (pcregConfirm) pcregConfirm.value = '';
    setTimeout(() => pcregConfirm?.focus(), 50);
    return;
  }

  let originalButtonHTML = null;
  if (pcregEnterBtn) {
    originalButtonHTML = pcregEnterBtn.innerHTML;
    showButtonLoading(pcregEnterBtn, 'Saving...');
  }
  if (pcregError) pcregError.classList.add('hidden');

  try {
    await updateDoc(doc(db, COLLECTIONS.REGISTERED_ADMIN, csAdminDocId), {
      changeStatsPasscode:    pass,
      passcodeRegisteredAt:   serverTimestamp()
    });

    csPasscode = pass;
    sessionStorage.setItem('ft_cs_passcode', csPasscode);

    closePcRegModal();
    showToastMessage('Passcode registered successfully.', 'success');
    openDetail(pendingDocId);

  } catch (err) {
    console.error('Passcode registration error:', err);
    if (pcregError) {
      pcregError.textContent = 'Failed to save passcode. Try again.';
      pcregError.classList.remove('hidden');
    }
  } finally {
    if (pcregEnterBtn) restoreButton(pcregEnterBtn, 'Register', originalButtonHTML);
  }
}

if (pcregEnterBtn) pcregEnterBtn.addEventListener('click', performPcRegistration);
if (pcregConfirm) pcregConfirm.addEventListener('keydown', e => { if (e.key === 'Enter') performPcRegistration(); });

/* ============================================================
   PASSCODE ENTRY
   ============================================================ */
async function performPcEntry() {
  const entered = pcentryPass?.value.trim() || '';

  if (!entered) {
    if (pcentryError) {
      pcentryError.textContent = 'Please enter your passcode.';
      pcentryError.classList.remove('hidden');
    }
    return;
  }

  let originalButtonHTML = null;
  if (pcentryEnterBtn) {
    originalButtonHTML = pcentryEnterBtn.innerHTML;
    showButtonLoading(pcentryEnterBtn, 'Verifying...');
  }
  if (pcentryError) pcentryError.classList.add('hidden');

  try {
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
      if (pcentryError) {
        pcentryError.textContent = 'Incorrect passcode. Try again.';
        pcentryError.classList.remove('hidden');
      }
      if (pcentryPass) pcentryPass.value = '';
      setTimeout(() => pcentryPass?.focus(), 50);
    }
  } catch (err) {
    console.error('Passcode entry error:', err);
    if (pcentryError) {
      pcentryError.textContent = 'Verification failed. Try again.';
      pcentryError.classList.remove('hidden');
    }
  } finally {
    if (pcentryEnterBtn) restoreButton(pcentryEnterBtn, 'Verify', originalButtonHTML);
  }
}

if (pcentryEnterBtn) pcentryEnterBtn.addEventListener('click', performPcEntry);
if (pcentryPass) pcentryPass.addEventListener('keydown', e => { if (e.key === 'Enter') performPcEntry(); });

/* ============================================================
   HANDLE ACTION CLICK
   ============================================================ */
function handleActionClick(docId) {
  pendingDocId = docId;

  if (!otlDone) {
    openOtlModal();
  } else {
    openPcEntryModal();
  }
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
  showSkeletonDetail();

  if (detailOverlay) detailOverlay.classList.remove('hidden');
  if (detailPanel)   detailPanel.classList.remove('hidden');

  const r = allRequests.find(req => req._docId === docId);
  if (!r) {
    setTimeout(() => {
      const retryReq = allRequests.find(req => req._docId === docId);
      if (retryReq) {
        populateDetailInfo(retryReq);
      } else {
        if (detailInfo) detailInfo.innerHTML = '<div class="detail-info-row"><span class="detail-info-value">Request data not found</span></div>';
      }
    }, 500);
    return;
  }

  populateDetailInfo(r);
}

function populateDetailInfo(r) {
  activeDocId = r._docId;
  activeData  = r;
  if (reasonInput) reasonInput.value = '';

  const uid  = r.idNumber || r.userId || '';
  const user = userCache.get(uid);

  if (detailInfo) {
    detailInfo.innerHTML = `
      ${infoRow('Request ID',    r.requestId || r._docId)}
      ${infoRow('User ID',       uid || '—')}
      ${infoRow('First Name',    user?.firstName  || r._firstName  || '—')}
      ${infoRow('Middle Name',   user?.middleName || r._middleName || '—')}
      ${infoRow('Last Name',     user?.lastName   || r._lastName   || '—')}
      ${infoRow('Full Name',     user?.fullName   || r._fullName   || '—')}
      ${infoRow('Position',      user?.position   || r._position   || '—')}
      ${infoRow('Event',         r.event          || '—')}
      ${infoRow('Description',   r.eventDescription || '—')}
      ${infoRow('Venue',         r.venue          || '—')}
      ${infoRow('Date',          formatDate(r.date))}
      ${infoRow('Start Time',    r.startTime      || '—')}
      ${infoRow('End Time',      r.endTime        || '—')}
      ${infoRow('Items/Equipment', r.item         || '—')}
      ${infoRow('Status',        r.status         || '—')}
    `;
  }

  if (reasonInput) {
    reasonInput.disabled    = false;
    reasonInput.placeholder = 'Enter reason for rescheduling…';
    reasonInput.value       = '';
  }

  if (btnReschedule) {
    btnReschedule.disabled    = false;
    btnReschedule.textContent = 'Reschedule';
  }

  setTimeout(() => reasonInput?.focus(), 100);
}

function infoRow(label, value) {
  return `
    <div class="detail-info-row">
      <span class="detail-info-label">${escapeHtml(label)}</span>
      <span class="detail-info-value">${escapeHtml(String(value ?? '—'))}</span>
    </div>
  `;
}

function closeDetail() {
  if (detailOverlay) detailOverlay.classList.add('hidden');
  if (detailPanel)   detailPanel.classList.add('hidden');
  activeDocId = null;
  activeData  = null;
}

if (detailBackBtn) detailBackBtn.addEventListener('click', closeDetail);
if (detailOverlay) detailOverlay.addEventListener('click', closeDetail);

/* ============================================================
   RESCHEDULE CONFIRMATION
   ============================================================ */
const confirmModalElem  = document.getElementById('confirm-modal');
const confirmOverlayElem = document.getElementById('confirm-overlay');
const confirmOkBtn      = document.getElementById('confirm-ok');
const confirmCancelBtn  = document.getElementById('confirm-cancel');

if (btnReschedule) {
  btnReschedule.addEventListener('click', () => {
    const reason = reasonInput?.value.trim() || '';
    if (!reason) {
      if (reasonInput) {
        reasonInput.style.borderColor = '#dc2626';
        reasonInput.placeholder = '⚠ Please enter a reason first.';
        reasonInput.focus();
        setTimeout(() => {
          if (reasonInput) {
            reasonInput.style.borderColor = '';
            reasonInput.placeholder = 'Enter reason for rescheduling…';
          }
        }, 2500);
      }
      return;
    }
    if (confirmModalElem) confirmModalElem.classList.remove('hidden');
  });
}

function closeConfirm() {
  if (confirmModalElem) confirmModalElem.classList.add('hidden');
}

if (confirmCancelBtn)  confirmCancelBtn.addEventListener('click', closeConfirm);
if (confirmOverlayElem) confirmOverlayElem.addEventListener('click', closeConfirm);

if (confirmOkBtn) {
  confirmOkBtn.addEventListener('click', async () => {
    closeConfirm();
    await performReschedule();
  });
}

/* ============================================================
   PERFORM RESCHEDULE
   ============================================================ */
async function performReschedule() {
  if (!activeDocId) return;

  const reason    = reasonInput?.value.trim() || '';
  const adminId   = sessionStorage.getItem('ft_admin_id')       || '';
  const adminName = sessionStorage.getItem('ft_admin_username')  ||
                    sessionStorage.getItem('ft_admin_fullname')  || 'Admin';

  let originalButtonHTML = null;
  if (btnReschedule) {
    originalButtonHTML = btnReschedule.innerHTML;
    showButtonLoading(btnReschedule, 'Saving...');
  }

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
    showToastMessage('Request successfully rescheduled.', 'success');

  } catch (err) {
    console.error('Reschedule error:', err);
    showToastMessage('Failed to reschedule: ' + err.message, 'error');
  } finally {
    if (btnReschedule) restoreButton(btnReschedule, 'Reschedule', originalButtonHTML);
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return '&#39;';
  });
}

// Close sidebar on mobile when clicking a link
document.querySelectorAll('.nav-item, .nav-child').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 768) {
      sidebar?.classList.remove('open');
      sidebarOverlay?.classList.remove('show');
      hamburger?.classList.remove('open');
    }
  });
});

console.log('Change Stats page loaded successfully');