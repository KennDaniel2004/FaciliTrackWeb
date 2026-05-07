/* =============================================
   FaciliTrack – Requests Panel Logic
   User/request.js
   ============================================= */

import { db } from "../DatabaseConn/dbconn.js";
import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
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

const topbarExpand    = document.getElementById('topbar-expand');
const EXPAND_STATE_KEY = 'ft_expand_all';

function setExpandState(active) {
  if (!topbarExpand) return;
  topbarExpand.classList.toggle('active', active);
  document.documentElement.classList.toggle('expanded-fullscreen', active);
  document.body.classList.toggle('expanded-fullscreen', active);
  if (active) sessionStorage.setItem(EXPAND_STATE_KEY, '1');
  else sessionStorage.removeItem(EXPAND_STATE_KEY);
}

if (sessionStorage.getItem(EXPAND_STATE_KEY) === '1') {
  setExpandState(true);
}

topbarExpand?.addEventListener('click', async () => {
  const docEl = document.documentElement;
  if (document.fullscreenElement) {
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

document.addEventListener('fullscreenchange', () => setExpandState(Boolean(document.fullscreenElement)));

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
const logoutBtn      = document.getElementById('logout-btn');

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
document.getElementById('modal-cancel').addEventListener('click', () => logoutModal.classList.add('hidden'));
document.getElementById('modal-overlay').addEventListener('click', () => logoutModal.classList.add('hidden'));
document.getElementById('modal-confirm-logout').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.replace('../Auth/auth.login.html');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    logoutModal.classList.add('hidden');
    closeAllModals();
  }
});

/* ============================================================
   STATE
   ============================================================ */
let allRequests  = [];
let searchTerm   = '';
let activeDocId  = null;
let activeAction = null;
let isLoading    = true;  // Loading state for initial fetch
let isActionInProgress = false; // For action buttons loading state

/* ============================================================
   SKELETON LOADING FUNCTIONS
   ============================================================ */

// Show skeleton table on initial load
function showSkeletonTable() {
  const tbody = document.getElementById('req-tbody');
  const empty = document.getElementById('req-empty');
  empty.classList.add('hidden');
  
  tbody.innerHTML = '';
  
  // Create 5 skeleton rows
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.className = 'skeleton-row';
    tr.innerHTML = `
      <td><div class="skeleton skeleton-cell-text"></div></td>
      <td><div class="skeleton skeleton-cell-text"></div></td>
      <td><div class="skeleton skeleton-cell-short"></div></td>
      <td><div class="skeleton skeleton-cell-text"></div></td>
      <td><div class="skeleton skeleton-cell-short"></div></td>
      <td>
        <div class="skeleton-actions">
          <div class="skeleton-icon"></div>
          <div class="skeleton-icon"></div>
          <div class="skeleton-icon"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// Show skeleton for modal details
function showSkeletonModal(modalId) {
  const detailsContainer = modalId === 'approve-details' ? 
    document.getElementById('approve-details') : 
    modalId === 'reject-details' ? 
    document.getElementById('reject-details') : 
    document.getElementById('view-details');
  
  if (!detailsContainer) return;
  
  detailsContainer.innerHTML = `
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
    </div>
  `;
}

// Remove skeleton from table
function removeSkeletonTable() {
  const skeletonRows = document.querySelectorAll('.skeleton-row');
  skeletonRows.forEach(row => row.remove());
}

// Show loading overlay on action button
function showButtonLoading(button) {
  if (!button) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.style.opacity = '0.7';
  button.innerHTML = '<span class="skeleton-spinner" style="width: 20px; height: 20px; border-width: 2px; display: inline-block;"></span> Loading...';
  return originalText;
}

// Restore button text
function restoreButton(button, originalText) {
  if (!button) return;
  button.disabled = false;
  button.style.opacity = '1';
  button.textContent = originalText;
}

// Add loading overlay to entire page
function showPageLoading() {
  const main = document.querySelector('.dash-main');
  const overlay = document.createElement('div');
  overlay.id = 'page-loading-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  overlay.innerHTML = '<div class="skeleton-spinner" style="width: 50px; height: 50px;"></div>';
  document.body.appendChild(overlay);
}

function hidePageLoading() {
  const overlay = document.getElementById('page-loading-overlay');
  if (overlay) overlay.remove();
}

/* ============================================================
   FIRESTORE — Real-time listener on Requests
   ============================================================ */
const reqQuery = query(
  collection(db, 'requests'),
  orderBy('createdAt', 'desc')
);

// Show skeleton on initial load
showSkeletonTable();

onSnapshot(reqQuery, (snapshot) => {
  allRequests = [];
  snapshot.forEach(docSnap => {
    allRequests.push({ id: docSnap.id, ...docSnap.data() });
  });
  
  // Remove skeleton after data loads
  removeSkeletonTable();
  isLoading = false;
  
  /* Badge: count only pending */
  const pendingCount = allRequests.filter(r => (r.status || 'Pending') === 'Pending').length;
  const badge = document.getElementById('requests-badge');
  if (pendingCount > 0) {
    badge.textContent    = pendingCount > 99 ? '99+' : pendingCount;
    badge.style.display  = 'inline-flex';
  } else {
    badge.style.display  = 'none';
  }
  
  applySearch();
}, err => {
  console.error('Firestore listener error:', err);
  removeSkeletonTable();
  isLoading = false;
  alert('Error loading requests: ' + err.message);
});

/* ============================================================
   SEARCH
   ============================================================ */
document.getElementById('req-search').addEventListener('input', function () {
  searchTerm = this.value.toLowerCase().trim();
  applySearch();
});

function applySearch() {
  if (isLoading) return;
  
  const filtered = !searchTerm
    ? allRequests
    : allRequests.filter(r =>
        (r.userId     || '').toLowerCase().includes(searchTerm) ||
        (r.fullname   || '').toLowerCase().includes(searchTerm) ||
        (r.idNumber   || '').toLowerCase().includes(searchTerm) ||
        (r.event      || '').toLowerCase().includes(searchTerm) ||
        (r.venue      || '').toLowerCase().includes(searchTerm)
      );
  renderTable(filtered);
}

/* ============================================================
   RENDER TABLE with loading states
   ============================================================ */
function renderTable(requests) {
  const tbody = document.getElementById('req-tbody');
  const empty = document.getElementById('req-empty');
  tbody.innerHTML = '';

  /* Show only pending requests in the main table */
  const pending = requests.filter(r => (r.status || 'Pending') === 'Pending');

  if (!pending.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  pending.forEach(req => {
    const fullname = req.fullname || '—';
    const createdAt = req.createdAt ? formatDate(req.createdAt) : '—';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(req.userId || req.id)}</td>
      <td>${escHtml(fullname)}</td>
      <td>${escHtml(req.idNumber || '—')}</td>
      <td>${escHtml(req.event || '—')}</td>
      <td>${escHtml(req.venue || '—')}</td>
      <td>
        <div class="req-actions">
          <button class="req-action-icon req-action-icon--approve" data-id="${escHtml(req.id)}" data-action="approve" title="Approve">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <button class="req-action-icon req-action-icon--reject" data-id="${escHtml(req.id)}" data-action="reject" title="Reject">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <button class="req-action-icon req-action-icon--view" data-id="${escHtml(req.id)}" data-action="view" title="View Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  bindActionButtons();
}

/* ============================================================
   Helper function to format date
   ============================================================ */
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/* ============================================================
   ACTION BUTTONS with loading state
   ============================================================ */
function bindActionButtons() {
  document.querySelectorAll('.req-action-icon').forEach(btn => {
    // Remove existing listener to avoid duplicates
    btn.removeEventListener('click', handleButtonClick);
    btn.addEventListener('click', handleButtonClick);
  });
}

async function handleButtonClick(e) {
  e.stopPropagation();
  
  // Prevent multiple clicks while processing
  if (isActionInProgress) return;
  
  const btn = e.currentTarget;
  const docId = btn.dataset.id;
  const action = btn.dataset.action;
  
  // Add loading state to the clicked button
  const originalSvg = btn.innerHTML;
  btn.style.opacity = '0.5';
  btn.disabled = true;
  btn.innerHTML = '<div class="skeleton-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>';
  
  try {
    await handleAction(docId, action);
  } finally {
    // Restore button
    btn.style.opacity = '1';
    btn.disabled = false;
    btn.innerHTML = originalSvg;
  }
}

/* ============================================================
   HANDLE ACTION — with skeleton loading for modals
   ============================================================ */
async function handleAction(docId, action) {
  const req = allRequests.find(r => r.id === docId);
  if (!req) return;

  activeDocId  = docId;
  activeAction = action;

  if (action === 'approve') {
    // Show skeleton while loading
    showSkeletonModal('approve-details');
    openModal('modal-approve');
    // Simulate minimal loading time then populate
    setTimeout(() => {
      populateDetails('approve-details', req);
    }, 100);

  } else if (action === 'reject') {
    showSkeletonModal('reject-details');
    openModal('modal-reject');
    setTimeout(() => {
      populateDetails('reject-details', req);
      document.getElementById('rejection-reason').value = '';
    }, 100);

  } else if (action === 'view') {
    showSkeletonModal('view-details');
    openModal('modal-view');
    setTimeout(() => {
      populateDetails('view-details', req, true);
    }, 100);
  }
}

/* ============================================================
   POPULATE DETAILS
   ============================================================ */
function populateDetails(containerId, req, showStatus = false) {
  const fullname = req.fullname || '—';
  const date = req.createdAt
    ? new Date(req.createdAt).toLocaleDateString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '—';

  let statusHtml = '';
  if (showStatus) {
    const status = req.status || 'Pending';
    statusHtml = `
      <div class="req-detail-label">Status</div>
      <div class="req-detail-value">
        <span class="req-status-badge req-status-badge--${status.toLowerCase()}">
          ${status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
    `;
  }

  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="req-detail-label">User ID</div>
    <div class="req-detail-value">${escHtml(req.userId || req.id)}</div>

    <div class="req-detail-label">Full Name</div>
    <div class="req-detail-value">${escHtml(fullname)}</div>

    <div class="req-detail-label">ID Number</div>
    <div class="req-detail-value">${escHtml(req.idNumber || '—')}</div>

    <div class="req-detail-label">Event</div>
    <div class="req-detail-value">${escHtml(req.event || '—')}</div>

    <div class="req-detail-label">Event Description</div>
    <div class="req-detail-value">${escHtml(req.eventDescription || '—')}</div>

    <div class="req-detail-label">Items Needed</div>
    <div class="req-detail-value">${escHtml(req.item || '—')}</div>

    <div class="req-detail-label">Date</div>
    <div class="req-detail-value">${escHtml(req.date || '—')}</div>

    <div class="req-detail-label">Time</div>
    <div class="req-detail-value">${escHtml((req.startTime || '—') + ' - ' + (req.endTime || '—'))}</div>

    <div class="req-detail-label">Venue</div>
    <div class="req-detail-value">${escHtml(req.venue || '—')}</div>

    <div class="req-detail-label">Request ID</div>
    <div class="req-detail-value">${escHtml(req.requestId || '—')}</div>

    <div class="req-detail-label">Date Requested</div>
    <div class="req-detail-value">${date}</div>

    ${statusHtml}

    ${req.rejectedReason ? `
      <div class="req-detail-label">Rejection Reason</div>
      <div class="req-detail-value">${escHtml(req.rejectedReason)}</div>
    ` : ''}
  `;
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
function closeAllModals() {
  ['modal-approve','modal-reject','modal-view','modal-confirm'].forEach(closeModal);
}

/* Back / Overlay close bindings */
document.getElementById('approve-back').addEventListener('click', () => closeModal('modal-approve'));
document.getElementById('approve-overlay').addEventListener('click', () => closeModal('modal-approve'));

document.getElementById('reject-back').addEventListener('click', () => closeModal('modal-reject'));
document.getElementById('reject-overlay').addEventListener('click', () => closeModal('modal-reject'));

document.getElementById('view-back').addEventListener('click', () => closeModal('modal-view'));
document.getElementById('view-overlay').addEventListener('click', () => closeModal('modal-view'));

document.getElementById('confirm-overlay').addEventListener('click', () => closeModal('modal-confirm'));
document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));

/* ============================================================
   APPROVE BUTTON with loading state
   ============================================================ */
document.getElementById('btn-confirm-approve').addEventListener('click', async () => {
  const btn = document.getElementById('btn-confirm-approve');
  const originalText = showButtonLoading(btn);
  
  try {
    closeModal('modal-approve');
    await openConfirmWithDelay('approve');
  } finally {
    restoreButton(btn, originalText);
  }
});


document.getElementById('btn-confirm-reject').addEventListener('click', async () => {
  const reason = document.getElementById('rejection-reason').value.trim();
  if (!reason) {
    document.getElementById('rejection-reason').focus();
    document.getElementById('rejection-reason').style.borderColor = '#dc2626';
    setTimeout(() => {
      document.getElementById('rejection-reason').style.borderColor = '';
    }, 2000);
    return;
  }
  
  const btn = document.getElementById('btn-confirm-reject');
  const originalText = showButtonLoading(btn);
  
  try {
    closeModal('modal-reject');
    await openConfirmWithDelay('reject', reason);
  } finally {
    restoreButton(btn, originalText);
  }
});



let pendingReason = '';

async function openConfirmWithDelay(action, reason = '') {
  pendingReason = reason;
  
  // Show loading in confirm modal
  const confirmCard = document.querySelector('.req-confirm-card');
  if (confirmCard) {
    confirmCard.style.opacity = '0.5';
  }
  
  // Simulate network delay for demonstration (remove in production or keep for slow connections)
  await new Promise(resolve => setTimeout(resolve, 300));
  
  if (confirmCard) {
    confirmCard.style.opacity = '1';
  }
  
  const icon    = document.getElementById('confirm-icon');
  const title   = document.getElementById('confirm-title');
  const msg     = document.getElementById('confirm-msg');
  const okBtn   = document.getElementById('confirm-ok');

  if (action === 'approve') {
    icon.className   = 'req-confirm-icon approve-icon';
    icon.textContent = '✓';
    title.textContent = 'Approve Request';
    msg.textContent   = 'Are you sure you want to approve this request? This action cannot be undone.';
    okBtn.className   = 'req-confirm-btn req-confirm-btn--ok approve-ok';
    okBtn.textContent = 'Yes, Approve';
  } else {
    icon.className   = 'req-confirm-icon reject-icon';
    icon.textContent = '✕';
    title.textContent = 'Reject Request';
    msg.textContent   = 'Are you sure you want to reject this request? This action cannot be undone.';
    okBtn.className   = 'req-confirm-btn req-confirm-btn--ok reject-ok';
    okBtn.textContent = 'Yes, Reject';
  }

  openModal('modal-confirm');
}

document.getElementById('confirm-ok').addEventListener('click', async () => {
  if (!activeDocId || !activeAction) return;
  
  // Show loading on confirm button
  const confirmOkBtn = document.getElementById('confirm-ok');
  const originalText = confirmOkBtn.textContent;
  confirmOkBtn.disabled = true;
  confirmOkBtn.style.opacity = '0.7';
  confirmOkBtn.innerHTML = '<span class="skeleton-spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block;"></span> Processing...';
  
  try {
    closeModal('modal-confirm');
    await executeAction(activeDocId, activeAction, pendingReason);
    activeDocId  = null;
    activeAction = null;
    pendingReason = '';
  } catch (error) {
    console.error('Action failed:', error);
    alert('Action failed: ' + error.message);
  } finally {
    confirmOkBtn.disabled = false;
    confirmOkBtn.style.opacity = '1';
    confirmOkBtn.textContent = originalText;
  }
});


async function executeAction(docId, action, reason = '') {
  isActionInProgress = true;
  
  try {
    const docRef = doc(db, 'requests', docId);

    if (action === 'approve') {
      await updateDoc(docRef, {
        status:     'Approved',
        approvedAt: serverTimestamp(),
        approvedBy: sessionStorage.getItem('ft_admin_id') || 'admin',
      });
    } else if (action === 'reject') {
      await updateDoc(docRef, {
        status:         'Rejected',
        rejectedAt:     serverTimestamp(),
        rejectedBy:     sessionStorage.getItem('ft_admin_id') || 'admin',
        rejectedReason: reason,
      });
    }
    // Show success feedback (optional)
    showToastMessage(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully!`, 'success');
  } catch (err) {
    console.error(`Failed to ${action} request:`, err);
    showToastMessage(`Failed to ${action} request: ${err.message}`, 'error');
    throw err;
  } finally {
    isActionInProgress = false;
  }
}


function showToastMessage(message, type = 'success') {
  // Remove existing toast
  const existingToast = document.querySelector('.req-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `req-toast req-toast--${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#16a34a' : '#dc2626'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add toast animations to CSS (add to your CSS file)
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(styleSheet);


function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]
  );
}