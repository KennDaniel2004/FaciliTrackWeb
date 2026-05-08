// ============================================================
// history.js  —  FaciliTrack History Page (FULLY RESPONSIVE)
// ============================================================
import {
  db,
  auth,
  COLLECTIONS,
  getCurrentAdmin,
  logAdminAction,
  formatTimestamp,
  formatDate,
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onAuthStateChanged
} from "../DatabaseConn/dbconn.js";

// ── State ────────────────────────────────────────────────────
let allRequests = [];
let currentTab = "approved";
let pendingAction = null;
let currentAdmin = null;
let isLoading = true;

// ── DOM References ────────────────────────────────────────────
const historyBody = document.getElementById("historyBody");
const adminFullName = document.getElementById("adminFullName");
const adminAvatar = document.getElementById("adminAvatar");

// Summary count elements
let countApprovedSpan = null;
let countRejectSpan = null;
let countRescheduledSpan = null;
let countFinishedSpan = null;

// Modals
const viewModal = document.getElementById("viewModal");
const viewModalBody = document.getElementById("viewModalBody");
const closeViewModal = document.getElementById("closeViewModal");
const viewCloseBtn = document.getElementById("viewCloseBtn");

const confirmModal = document.getElementById("confirmModal");
const confirmIcon = document.getElementById("confirmIcon");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancel = document.getElementById("confirmCancel");
const confirmProceed = document.getElementById("confirmProceed");

const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

// Sidebar elements
const sidebar = document.getElementById("sidebar");
const mainWrapper = document.getElementById("mainWrapper");
const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const historyMenu = document.getElementById("historyMenu");
const historySub = document.getElementById("historySub");

// Store original HTML for restoration
let originalCardsHTML = '';
let originalTabsHTML = '';

// ── Helper Functions ──────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer;
function showToast(msg, type = "success") {
  if (!toastMsg) return;
  toastMsg.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function updateSidebarActive() {
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => {
    item.classList.remove('active');
  });
  if (historyMenu) historyMenu.classList.add('active');
  const historyLink = document.querySelector('.nav-sub-item[href="history.html"]');
  if (historyLink) historyLink.classList.add('active');
}

function normalizeStatus(status) {
  if (!status) return 'Pending';
  const statusLower = status.toLowerCase();
  if (statusLower === 'approved') return 'Approved';
  if (statusLower === 'rejected') return 'Rejected';
  if (statusLower === 'finished') return 'Finished';
  if (statusLower === 'rescheduled') return 'Rescheduled';
  if (statusLower === 'pending') return 'Pending';
  return status;
}

// ── Skeleton Loading Functions ────────────────────────────────

function showSkeletonLoading() {
  // Save original HTML for later restoration
  const summaryCards = document.querySelector('.summary-cards');
  const tabsRow = document.querySelector('.tabs-row');
  
  if (summaryCards && !originalCardsHTML) {
    originalCardsHTML = summaryCards.innerHTML;
  }
  if (tabsRow && !originalTabsHTML) {
    originalTabsHTML = tabsRow.innerHTML;
  }
  
  // Show skeleton for summary cards (counts show as "--")
  if (summaryCards) {
    summaryCards.innerHTML = `
      <div class="card card--approved skeleton-card">
        <div class="card-icon skeleton-icon"></div>
        <div class="card-info">
          <span class="card-label">Approved</span>
          <span class="card-count skeleton-count">--</span>
        </div>
      </div>
      <div class="card card--reject skeleton-card">
        <div class="card-icon skeleton-icon"></div>
        <div class="card-info">
          <span class="card-label">Reject</span>
          <span class="card-count skeleton-count">--</span>
        </div>
      </div>
      <div class="card card--rescheduled skeleton-card">
        <div class="card-icon skeleton-icon"></div>
        <div class="card-info">
          <span class="card-label">Reschedule</span>
          <span class="card-count skeleton-count">--</span>
        </div>
      </div>
      <div class="card card--finished skeleton-card">
        <div class="card-icon skeleton-icon"></div>
        <div class="card-info">
          <span class="card-label">Finished</span>
          <span class="card-count skeleton-count">--</span>
        </div>
      </div>
    `;
  }
  
  // Show skeleton for table rows
  if (historyBody) {
    const skeletonRows = [];
    for (let i = 0; i < 5; i++) {
      skeletonRows.push(`
        <tr class="skeleton-row">
          <td><div class="skeleton-cell" style="width: 100px; height: 16px;"></div></td>
          <td><div class="skeleton-cell" style="width: 140px; height: 16px;"></div></td>
          <td><div class="skeleton-cell" style="width: 120px; height: 16px;"></div></td>
          <td><div class="skeleton-cell" style="width: 100px; height: 16px;"></div></td>
          <td><div class="skeleton-cell" style="width: 90px; height: 16px;"></div></td>
          <td><div class="skeleton-cell" style="width: 80px; height: 24px; border-radius: 20px;"></div></td>
          <td><div class="skeleton-cell" style="width: 130px; height: 16px;"></div></td>
          <td><div class="skeleton-cell" style="width: 100px; height: 32px;"></div></td>
        </tr>
      `);
    }
    historyBody.innerHTML = skeletonRows.join('');
  }
}

function hideSkeletonAndShowContent() {
  const summaryCards = document.querySelector('.summary-cards');
  const tabsRow = document.querySelector('.tabs-row');
  
  // Restore original summary cards
  if (summaryCards && originalCardsHTML) {
    summaryCards.innerHTML = originalCardsHTML;
  }
  
  // Restore original tabs if needed
  if (tabsRow && originalTabsHTML && tabsRow.querySelector('.skeleton-tab')) {
    tabsRow.innerHTML = originalTabsHTML;
  }
  
  isLoading = false;
}

// ── Auth Check ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const adminFromSession = getCurrentAdmin();
  
  if (!user && !adminFromSession) {
    console.log('No authentication found, redirecting to login...');
    window.location.href = "../Auth/auth.login.html";
    return;
  }

  currentAdmin = adminFromSession || {
    id: user?.uid,
    fullName: user?.displayName || "Admin",
    username: user?.email?.split('@')[0] || "Admin"
  };
  
  if (adminFullName) {
    const displayName = currentAdmin.fullName || currentAdmin.username || "Admin";
    adminFullName.textContent = displayName;
    const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    if (adminAvatar) adminAvatar.textContent = initials;
  }

  await loadHistory();
  updateSidebarActive();
});

// ── Load ALL requests ─────────────────────────────────────────
async function loadHistory() {
  // Show skeleton loading
  showSkeletonLoading();
  
  try {
    const q = query(collection(db, COLLECTIONS.REQUESTS));
    const snap = await getDocs(q);

    allRequests = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const normalizedStatus = normalizeStatus(data.status);
      
      if (data.archived !== true) {
        allRequests.push({ 
          id: docSnap.id, 
          ...data,
          displayStatus: normalizedStatus
        });
      }
    });

    console.log('Loaded requests:', allRequests.length);
    
    // Hide skeleton and show real content
    hideSkeletonAndShowContent();
    
    // Re-attach event listeners
    attachTabListeners();
    attachCardListeners();
    
    // Update counts and render
    updateCounts();
    renderTab(currentTab);
    
  } catch (err) {
    console.error("loadHistory error:", err);
    hideSkeletonAndShowContent();
    if (historyBody) {
      historyBody.innerHTML = `<tr><td colspan="8" class="empty-row" style="color:var(--red)">Failed to load history. Error: ${err.message}</td></tr>`;
    }
    showToast("Failed to load history", "error");
  }
}

// ── Attach Event Listeners ─────────────────────────────────────
function attachTabListeners() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.removeEventListener('click', btn._listener);
    const listener = () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderTab(btn.dataset.tab);
    };
    btn._listener = listener;
    btn.addEventListener('click', listener);
  });
}

function attachCardListeners() {
  const cardApproved = document.getElementById("cardApproved");
  const cardReject = document.getElementById("cardReject");
  const cardRescheduled = document.getElementById("cardRescheduled");
  const cardFinished = document.getElementById("cardFinished");
  
  if (cardApproved) {
    cardApproved.removeEventListener('click', cardApproved._listener);
    cardApproved._listener = () => switchTab("approved");
    cardApproved.addEventListener('click', cardApproved._listener);
  }
  if (cardReject) {
    cardReject.removeEventListener('click', cardReject._listener);
    cardReject._listener = () => switchTab("rejected");
    cardReject.addEventListener('click', cardReject._listener);
  }
  if (cardRescheduled) {
    cardRescheduled.removeEventListener('click', cardRescheduled._listener);
    cardRescheduled._listener = () => switchTab("rescheduled");
    cardRescheduled.addEventListener('click', cardRescheduled._listener);
  }
  if (cardFinished) {
    cardFinished.removeEventListener('click', cardFinished._listener);
    cardFinished._listener = () => switchTab("finished");
    cardFinished.addEventListener('click', cardFinished._listener);
  }
}

// ── Update Counts ──────────────────────────────────────────────
function updateCounts() {
  const approved = allRequests.filter(r => r.displayStatus === "Approved").length;
  const rejected = allRequests.filter(r => r.displayStatus === "Rejected").length;
  const rescheduled = allRequests.filter(r => r.displayStatus === "Rescheduled").length;
  const finished = allRequests.filter(r => r.displayStatus === "Finished").length;
  
  countApprovedSpan = document.getElementById("countApproved");
  countRejectSpan = document.getElementById("countReject");
  countRescheduledSpan = document.getElementById("countRescheduled");
  countFinishedSpan = document.getElementById("countFinished");
  
  if (countApprovedSpan) countApprovedSpan.textContent = approved;
  if (countRejectSpan) countRejectSpan.textContent = rejected;
  if (countRescheduledSpan) countRescheduledSpan.textContent = rescheduled;
  if (countFinishedSpan) countFinishedSpan.textContent = finished;
}

// ── Tab rendering ─────────────────────────────────────────────
const TAB_STATUS_MAP = {
  finished: ["Finished"],
  approved: ["Approved"],
  rejected: ["Rejected"],
  rescheduled: ["Rescheduled"]
};

function renderTab(tab) {
  if (isLoading) return;
  
  currentTab = tab;
  const targetStatuses = TAB_STATUS_MAP[tab];
  
  if (!targetStatuses) {
    console.error('Unknown tab:', tab);
    return;
  }
  
  const rows = allRequests.filter(r => targetStatuses.includes(r.displayStatus));

  if (!historyBody) return;
  
  if (!rows.length) {
    historyBody.innerHTML = `<tr><td colspan="8" class="empty-row">No ${tab} requests found.</td></tr>`;
    return;
  }

  historyBody.innerHTML = rows.map(r => buildRow(r)).join("");
  attachRowListeners();
}

function getRelevantTimestamp(r) {
  if (r.displayStatus === "Approved") return formatTimestamp(r.approvedAt);
  if (r.displayStatus === "Rejected") return formatTimestamp(r.rejectedAt);
  if (r.displayStatus === "Rescheduled") return formatTimestamp(r.rescheduledAt);
  if (r.displayStatus === "Finished") return formatTimestamp(r.finishedAt || r.approvedAt);
  return formatTimestamp(r.createdAt);
}

// History only shows Archive and Delete buttons
function buildActions(r) {
  return `
    <button class="act-btn act-btn--archive" data-action="archive" data-id="${r.id}" title="Archive">
      <i class="fa-solid fa-box-archive"></i><span>Archive</span>
    </button>
    <button class="act-btn act-btn--delete" data-action="delete" data-id="${r.id}" title="Delete">
      <i class="fa-regular fa-trash-can"></i><span>Delete</span>
    </button>`;
}

function buildRow(r) {
  const badgeClass = {
    Approved: "badge--approved",
    Finished: "badge--finished",
    Rejected: "badge--rejected",
    Rescheduled: "badge--rescheduled"
  }[r.displayStatus] || "badge--pending";

  const ts = getRelevantTimestamp(r);
  const actions = buildActions(r);

  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.idNumber || r.userId || "—")}</td>
      <td>${escapeHtml(r.fullname || "—")}</td>
      <td>${escapeHtml(r.event || "—")}</td>
      <td>${escapeHtml(r.venue || "—")}</td>
      <td>${formatDate(r.date)}</td>
      <td><span class="badge ${badgeClass}">${r.displayStatus}</span></td>
      <td>${ts}</td>
      <td><div class="actions-cell">${actions}</div></td>
    </tr>
  `;
}

function attachRowListeners() {
  if (!historyBody) return;
  historyBody.querySelectorAll(".act-btn").forEach(btn => {
    btn.removeEventListener('click', btn._listener);
    const listener = (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const record = allRequests.find(r => r.id === id);
      if (!record) return;
      if (action === "archive") askConfirm("archive", id, record);
      if (action === "delete") askConfirm("delete", id, record);
    };
    btn._listener = listener;
    btn.addEventListener('click', listener);
  });
}

// ── View Modal ────────────────────────────────────────────────
let viewingRecord = null;

function openViewModal(r) {
  if (!viewModalBody) return;
  viewingRecord = r;
  
  let rescheduleHtml = '';
  if (r.displayStatus === "Rescheduled") {
    rescheduleHtml = `
      <div class="detail-item full">
        <label>Reschedule Reason</label>
        <span>${escapeHtml(r.rescheduleReason || "No reason provided")}</span>
      </div>
      <div class="detail-item">
        <label>Rescheduled By</label>
        <span>${escapeHtml(r.rescheduledByName || r.rescheduledBy || "—")}</span>
      </div>
      <div class="detail-item">
        <label>Rescheduled Date</label>
        <span>${formatTimestamp(r.rescheduledAt)}</span>
      </div>
    `;
  }
  
  viewModalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>User ID</label><span>${escapeHtml(r.idNumber || r.userId || "—")}</span></div>
      <div class="detail-item"><label>Full Name</label><span>${escapeHtml(r.fullname || "—")}</span></div>
      <div class="detail-item"><label>Event</label><span>${escapeHtml(r.event || "—")}</span></div>
      <div class="detail-item"><label>Venue</label><span>${escapeHtml(r.venue || "—")}</span></div>
      <div class="detail-item"><label>Date</label><span>${formatDate(r.date)}</span></div>
      <div class="detail-item"><label>Time</label><span>${escapeHtml(r.startTime || "—")} – ${escapeHtml(r.endTime || "—")}</span></div>
      <div class="detail-item"><label>Status</label><span><span class="badge badge--${r.displayStatus?.toLowerCase()}">${r.displayStatus || "—"}</span></span></div>
      <div class="detail-item"><label>Items</label><span>${escapeHtml(r.item || "—")}</span></div>
      <div class="detail-item full"><label>Description</label><span>${escapeHtml(r.eventDescription || "—")}</span></div>
      ${rescheduleHtml}
      <div class="detail-item"><label>Created</label><span>${formatTimestamp(r.createdAt)}</span></div>
    </div>
  `;

  viewModal.classList.add("open");
}

function closeViewModalHandler() {
  viewModal.classList.remove("open");
  viewingRecord = null;
}

if (closeViewModal) closeViewModal.addEventListener("click", closeViewModalHandler);
if (viewCloseBtn) viewCloseBtn.addEventListener("click", closeViewModalHandler);
if (viewModal) {
  viewModal.addEventListener("click", e => {
    if (e.target === viewModal) closeViewModalHandler();
  });
}

// ── Confirmation Modal ────────────────────────────────────────
const CONFIRM_CONFIG = {
  archive: { icon: "📦", title: "Archive this Request?", message: "This request will be moved to the Archive.", btnLabel: "Archive", btnClass: "btn--primary" },
  delete: { icon: "🗑️", title: "Delete this Request?", message: "This action is permanent and cannot be undone.", btnLabel: "Delete", btnClass: "btn--danger" }
};

function askConfirm(type, id, record) {
  const cfg = CONFIRM_CONFIG[type];
  if (!cfg) return;
  pendingAction = { type, id, record };
  if (confirmIcon) confirmIcon.textContent = cfg.icon;
  if (confirmTitle) confirmTitle.textContent = cfg.title;
  if (confirmMessage) confirmMessage.innerHTML = `<strong>${escapeHtml(record.fullname || record.idNumber)}</strong><br><strong>Event:</strong> ${escapeHtml(record.event || "—")}<br><br>${cfg.message}`;
  if (confirmProceed) {
    confirmProceed.textContent = cfg.btnLabel;
    confirmProceed.className = `btn ${cfg.btnClass}`;
  }
  confirmModal.classList.add("open");
}

if (confirmCancel) {
  confirmCancel.addEventListener("click", () => {
    confirmModal.classList.remove("open");
    pendingAction = null;
  });
}
if (confirmModal) {
  confirmModal.addEventListener("click", e => {
    if (e.target === confirmModal) {
      confirmModal.classList.remove("open");
      pendingAction = null;
    }
  });
}
if (confirmProceed) {
  confirmProceed.addEventListener("click", async () => {
    if (!pendingAction) return;
    confirmModal.classList.remove("open");
    confirmProceed.disabled = true;
    const { type, id, record } = pendingAction;
    pendingAction = null;
    try {
      const ref = doc(db, COLLECTIONS.REQUESTS, id);
      if (type === "archive") {
        await updateDoc(ref, { archived: true, archivedAt: new Date() });
        await logAdminAction({
          actionType: "archive",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Archived request for ${record.fullname} — ${record.event}`
        });
        showToast("Request archived successfully.", "success");
      }
      if (type === "delete") {
        await deleteDoc(ref);
        await logAdminAction({
          actionType: "delete",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Deleted request for ${record.fullname} — ${record.event}`
        });
        showToast("Request deleted permanently.", "success");
      }
      await loadHistory();
    } catch (err) {
      console.error("Action error:", err);
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      confirmProceed.disabled = false;
    }
  });
}

// ── Sidebar toggle with overlay for mobile ────────────────────
if (hamburgerBtn) {
  hamburgerBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    if (sidebarOverlay) sidebarOverlay.classList.toggle("show");
  });
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
  });
}
if (historyMenu) {
  historyMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    historyMenu.classList.toggle("open");
    if (historySub) historySub.classList.toggle("open");
  });
}
if (historyMenu) historyMenu.classList.add("open");
if (historySub) historySub.classList.add("open");

function switchTab(tab) {
  const btns = document.querySelectorAll(".tab-btn");
  if (!btns.length) return;
  const btn = Array.from(btns).find(b => b.dataset.tab === tab);
  if (btn) {
    btns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderTab(tab);
  }
}

// Logout functionality
const logoutBtn = document.getElementById('logout-btn');
const logoutModalElem = document.getElementById('logout-modal');
const modalCancelBtn = document.getElementById('modal-cancel');
const modalConfirmBtn = document.getElementById('modal-confirm');

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    if (logoutModalElem) logoutModalElem.classList.remove('hidden');
  });
}
if (modalCancelBtn) {
  modalCancelBtn.addEventListener('click', () => {
    if (logoutModalElem) logoutModalElem.classList.add('hidden');
  });
}
if (modalConfirmBtn) {
  modalConfirmBtn.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = '../Auth/auth.login.html';
  });
}

// Close sidebar when clicking on a link (mobile)
document.querySelectorAll('.nav-item, .nav-sub-item').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 768) {
      sidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }
  });
});