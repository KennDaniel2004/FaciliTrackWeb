// ============================================================
// history.js  —  FaciliTrack History Page (FULLY FIXED)
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
  onAuthStateChanged,
  signOut
} from "../DatabaseConn/dbconn.js";
import { initPendingRequestNotifications } from "../HomeDashboard/notification-panel.js";

// ── State ────────────────────────────────────────────────────
let allRequests = [];
let currentTab = "approved";
let pendingAction = null;
let currentAdmin = null;
let isLoading = true;
let searchTerm = '';

// ── DOM References ────────────────────────────────────────────
const historyBody = document.getElementById("history-body");
const emptyDiv = document.getElementById("history-empty");
const searchInput = document.getElementById("history-search");

// Count elements
const countApprovedSpan = document.getElementById("countApproved");
const countRejectSpan = document.getElementById("countReject");
const countRescheduledSpan = document.getElementById("countRescheduled");
const countFinishedSpan = document.getElementById("countFinished");

// Topbar elements
const adminFullName = document.getElementById("topbar-fullname");
const adminAvatar = document.getElementById("topbar-avatar");
const profileTrigger = document.getElementById("profile-trigger");
const dropdownMenu = document.getElementById("dropdown-menu");
const logoutBtn = document.getElementById("logout-btn");

// View Modal
const viewModal = document.getElementById("view-modal");
const viewModalDetails = document.getElementById("view-modal-details");
const viewModalBack = document.getElementById("view-modal-back");
const viewModalOverlay = document.getElementById("view-modal-overlay");

// Confirmation Modal
const confirmModal = document.getElementById("confirm-modal");
const confirmIcon = document.getElementById("confirm-icon");
const confirmTitle = document.getElementById("confirm-title");
const confirmMsg = document.getElementById("confirm-msg");
const confirmCancel = document.getElementById("confirm-cancel");
const confirmOk = document.getElementById("confirm-ok");
const confirmOverlay = document.getElementById("confirm-modal-overlay");

// Logout modal
const logoutModal = document.getElementById("logout-modal");
const modalCancel = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");
const modalOverlay = document.getElementById("modal-overlay");

// Sidebar elements
const hamburger = document.getElementById("hamburger");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const dashLayout = document.getElementById("dash-layout");
const historyMenu = document.getElementById("historyMenu");
const historySub = document.getElementById("historySub");
const historyArrow = document.getElementById("historyArrow");

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

function showToast(message, type = "success") {
  const existingToast = document.querySelector('.history-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `history-toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${message}`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function updateSidebarActive() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  if (historyMenu) historyMenu.classList.add('active');
  document.querySelectorAll('.nav-child').forEach(item => {
    item.classList.remove('active');
  });
  const historyLink = document.querySelector('.nav-child[href="history.html"]');
  if (historyLink) historyLink.classList.add('active');
}

if (typeof initPendingRequestNotifications === 'function') {
  initPendingRequestNotifications();
}

function normalizeStatus(status) {
  if (!status) return 'Pending';
  const statusLower = String(status).toLowerCase();
  if (statusLower === 'approved') return 'Approved';
  if (statusLower === 'rejected') return 'Rejected';
  if (statusLower === 'finished') return 'Finished';
  if (statusLower === 'rescheduled') return 'Rescheduled';
  return statusLower.charAt(0).toUpperCase() + statusLower.slice(1);
}

// ── Update Counts Function ─────────────────────────────────────
function updateCounts() {
  const approved = allRequests.filter(r => r.displayStatus === "Approved").length;
  const rejected = allRequests.filter(r => r.displayStatus === "Rejected").length;
  const rescheduled = allRequests.filter(r => r.displayStatus === "Rescheduled").length;
  const finished = allRequests.filter(r => r.displayStatus === "Finished").length;
  
  if (countApprovedSpan) countApprovedSpan.textContent = approved;
  if (countRejectSpan) countRejectSpan.textContent = rejected;
  if (countRescheduledSpan) countRescheduledSpan.textContent = rescheduled;
  if (countFinishedSpan) countFinishedSpan.textContent = finished;
}

// ── Skeleton Loading Functions ────────────────────────────────
function showSkeletonLoading() {
  if (historyBody) {
    const skeletonRows = [];
    for (let i = 0; i < 5; i++) {
      skeletonRows.push(`
        <tr class="skeleton-row">
          <td><div class="skeleton-cell-text"></div></td>
          <td><div class="skeleton-cell-text"></div></td>
          <td><div class="skeleton-cell-text"></div></td>
          <td><div class="skeleton-cell-short"></div></td>
          <td><div class="skeleton-cell-short"></div></td>
          <td><div class="skeleton-badge"></div></td>
          <td><div class="skeleton-cell-text"></div></td>
          <td><div class="skeleton-actions"><div class="skeleton-icon"></div></div></td>
        </tr>
      `);
    }
    historyBody.innerHTML = skeletonRows.join('');
  }
  
  if (countApprovedSpan) countApprovedSpan.textContent = '--';
  if (countRejectSpan) countRejectSpan.textContent = '--';
  if (countRescheduledSpan) countRescheduledSpan.textContent = '--';
  if (countFinishedSpan) countFinishedSpan.textContent = '--';
}

// ── Auth Check ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const adminFromSession = getCurrentAdmin();
  
  if (!user && !adminFromSession) {
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

// ── Load Requests from Firestore ─────────────────────────────
async function loadHistory() {
  console.log('Loading history...');
  showSkeletonLoading();
  
  try {
    const q = query(collection(db, COLLECTIONS.REQUESTS));
    const snap = await getDocs(q);
    
    allRequests = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      
      // Only show non-archived requests (archived !== true)
      if (data.archived !== true) {
        const normalizedStatus = normalizeStatus(data.status);
        allRequests.push({ 
          id: docSnap.id, 
          ...data,
          displayStatus: normalizedStatus
        });
      }
    });

    console.log('Loaded non-archived requests:', allRequests.length);
    
    updateCounts();
    attachCardListeners();
    attachTabListeners();
    renderTab(currentTab);
    
  } catch (err) {
    console.error("loadHistory error:", err);
    if (historyBody) {
      historyBody.innerHTML = `<tr><td colspan="8" class="empty-row" style="color:red;">Error loading data: ${err.message}</td></tr>`;
    }
    showToast("Failed to load history", "error");
  }
}

// ── Search Function ───────────────────────────────────────────
function applySearch() {
  const term = searchInput?.value.toLowerCase() || '';
  const filtered = term ? allRequests.filter(r => 
    (r.fullname || '').toLowerCase().includes(term) ||
    (r.event || '').toLowerCase().includes(term) ||
    (r.venue || '').toLowerCase().includes(term) ||
    (r.idNumber || r.userId || '').toLowerCase().includes(term)
  ) : [...allRequests];
  
  renderTab(currentTab, filtered);
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    applySearch();
  });
}

// ── Attach Event Listeners ─────────────────────────────────────
function attachTabListeners() {
  const tabBtns = document.querySelectorAll(".history-tab-btn");
  tabBtns.forEach(btn => {
    btn.removeEventListener('click', btn._listener);
    btn._listener = () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      applySearch();
    };
    btn.addEventListener('click', btn._listener);
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

function switchTab(tab) {
  const btns = document.querySelectorAll(".history-tab-btn");
  if (!btns.length) return;
  const btn = Array.from(btns).find(b => b.dataset.tab === tab);
  if (btn) {
    btns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = tab;
    applySearch();
  }
}

// ── Render Tab ─────────────────────────────────────────────────
const TAB_STATUS_MAP = {
  finished: ["Finished"],
  approved: ["Approved"],
  rejected: ["Rejected"],
  rescheduled: ["Rescheduled"]
};

function renderTab(tab, requests = allRequests) {
  const targetStatuses = TAB_STATUS_MAP[tab];
  if (!targetStatuses) return;
  
  const rows = requests.filter(r => targetStatuses.includes(r.displayStatus));
  
  if (!historyBody) return;
  
  if (!rows.length) {
    historyBody.innerHTML = '';
    if (emptyDiv) emptyDiv.classList.remove('hidden');
    return;
  }
  
  if (emptyDiv) emptyDiv.classList.add('hidden');
  historyBody.innerHTML = rows.map(r => buildRow(r, tab)).join("");
  attachRowListeners();
}

function getRelevantTimestamp(r) {
  if (r.displayStatus === "Approved") return formatTimestamp(r.approvedAt);
  if (r.displayStatus === "Rejected") return formatTimestamp(r.rejectedAt);
  if (r.displayStatus === "Rescheduled") return formatTimestamp(r.rescheduledAt);
  if (r.displayStatus === "Finished") return formatTimestamp(r.finishedAt || r.approvedAt);
  return formatTimestamp(r.createdAt);
}

function buildRow(r, tab) {
  const badgeClass = {
    Approved: "history-badge--approved",
    Finished: "history-badge--finished",
    Rejected: "history-badge--rejected",
    Rescheduled: "history-badge--rescheduled"
  }[r.displayStatus] || "";

  let actionsHtml = '';
  
  if (tab === 'approved') {
    actionsHtml = `
      <div class="history-actions">
        <button class="history-action-btn history-action-btn--view" data-action="view" data-id="${r.id}" title="View Details">
          <i class="fa-solid fa-eye"></i><span>View</span>
        </button>
        <button class="history-action-btn history-action-btn--delete" data-action="delete" data-id="${r.id}" title="Delete">
          <i class="fa-regular fa-trash-can"></i><span>Delete</span>
        </button>
      </div>
    `;
  } else {
    actionsHtml = `
      <div class="history-actions">
        <button class="history-action-btn history-action-btn--view" data-action="view" data-id="${r.id}" title="View Details">
          <i class="fa-solid fa-eye"></i><span>View</span>
        </button>
        <button class="history-action-btn history-action-btn--archive" data-action="archive" data-id="${r.id}" title="Archive">
          <i class="fa-solid fa-box-archive"></i><span>Archive</span>
        </button>
        <button class="history-action-btn history-action-btn--delete" data-action="delete" data-id="${r.id}" title="Delete">
          <i class="fa-regular fa-trash-can"></i><span>Delete</span>
        </button>
      </div>
    `;
  }

  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.idNumber || r.userId || "—")}</td>
      <td>${escapeHtml(r.fullname || "—")}</td>
      <td>${escapeHtml(r.event || "—")}</td>
      <td>${escapeHtml(r.venue || "—")}</td>
      <td>${formatDate(r.date)}</td>
      <td><span class="history-badge ${badgeClass}">${r.displayStatus}</span></td>
      <td>${getRelevantTimestamp(r)}</td>
      <td>${actionsHtml}</td>
    </tr>
  `;
}

function attachRowListeners() {
  if (!historyBody) return;
  historyBody.querySelectorAll(".history-action-btn").forEach(btn => {
    btn.removeEventListener('click', btn._listener);
    btn._listener = (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const record = allRequests.find(r => r.id === id);
      if (!record) return;
      
      if (action === "view") {
        openViewModal(record);
      } else if (action === "archive") {
        openConfirmModal("archive", id, record);
      } else if (action === "delete") {
        openConfirmModal("delete", id, record);
      }
    };
    btn.addEventListener('click', btn._listener);
  });
}

// ── View Modal ────────────────────────────────────────────────
function openViewModal(r) {
  if (!viewModalDetails) return;
  
  viewModalDetails.innerHTML = `
    <div class="skeleton-modal-details">
      <div class="skeleton-detail-row"><div class="skeleton-detail-label"></div><div class="skeleton-detail-value"></div></div>
      <div class="skeleton-detail-row"><div class="skeleton-detail-label"></div><div class="skeleton-detail-value"></div></div>
      <div class="skeleton-detail-row"><div class="skeleton-detail-label"></div><div class="skeleton-detail-value"></div></div>
      <div class="skeleton-detail-row"><div class="skeleton-detail-label"></div><div class="skeleton-detail-value-full"></div></div>
    </div>
  `;
  viewModal.classList.remove("hidden");
  
  setTimeout(() => {
    let rescheduleHtml = '';
    if (r.displayStatus === "Rescheduled") {
      rescheduleHtml = `
        <div class="history-detail-item full">
          <label>Reschedule Reason</label>
          <span>${escapeHtml(r.rescheduleReason || "No reason provided")}</span>
        </div>
        <div class="history-detail-item">
          <label>Rescheduled By</label>
          <span>${escapeHtml(r.rescheduledByName || r.rescheduledBy || "—")}</span>
        </div>
      `;
    }
    
    viewModalDetails.innerHTML = `
      <div class="history-detail-grid">
        <div class="history-detail-item"><label>User ID</label><span>${escapeHtml(r.idNumber || r.userId || "—")}</span></div>
        <div class="history-detail-item"><label>Full Name</label><span>${escapeHtml(r.fullname || "—")}</span></div>
        <div class="history-detail-item"><label>Event</label><span>${escapeHtml(r.event || "—")}</span></div>
        <div class="history-detail-item"><label>Venue</label><span>${escapeHtml(r.venue || "—")}</span></div>
        <div class="history-detail-item"><label>Date</label><span>${formatDate(r.date)}</span></div>
        <div class="history-detail-item"><label>Time</label><span>${escapeHtml(r.startTime || "—")} – ${escapeHtml(r.endTime || "—")}</span></div>
        <div class="history-detail-item"><label>Status</label><span>${r.displayStatus || "—"}</span></div>
        <div class="history-detail-item"><label>Items</label><span>${escapeHtml(r.item || "—")}</span></div>
        <div class="history-detail-item full"><label>Description</label><span>${escapeHtml(r.eventDescription || "—")}</span></div>
        ${rescheduleHtml}
        <div class="history-detail-item"><label>Created</label><span>${formatTimestamp(r.createdAt)}</span></div>
      </div>
    `;
  }, 200);
}

function closeViewModal() {
  viewModal.classList.add("hidden");
}

if (viewModalBack) viewModalBack.addEventListener("click", closeViewModal);
if (viewModalOverlay) viewModalOverlay.addEventListener("click", closeViewModal);

// ── Confirmation Modal for Archive/Delete ─────────────────────
function openConfirmModal(type, id, record) {
  pendingAction = { type, id, record };
  
  const config = {
    archive: { 
      icon: "📦", 
      title: "Archive Request", 
      msg: `Move "${record.event || record.fullname}" to archive?` 
    },
    delete: { 
      icon: "🗑️", 
      title: "Delete Request", 
      msg: `Permanently delete "${record.event || record.fullname}"? This cannot be undone.` 
    }
  };
  
  const cfg = config[type];
  if (cfg) {
    if (confirmIcon) confirmIcon.textContent = cfg.icon;
    if (confirmTitle) confirmTitle.textContent = cfg.title;
    if (confirmMsg) confirmMsg.innerHTML = `<strong>${escapeHtml(record.fullname || record.idNumber)}</strong><br>${cfg.msg}`;
  }
  
  confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  confirmModal.classList.add("hidden");
  pendingAction = null;
}

if (confirmCancel) confirmCancel.addEventListener("click", closeConfirmModal);
if (confirmOverlay) confirmOverlay.addEventListener("click", closeConfirmModal);

// ── EXECUTE ARCHIVE/DELETE ACTION (FIXED) ─────────────────────
if (confirmOk) {
  confirmOk.addEventListener("click", async () => {
    if (!pendingAction) {
      console.log('No pending action');
      return;
    }
    
    const { type, id, record } = pendingAction;
    console.log('Executing action:', type, 'for request:', id, record.fullname);
    
    // Close modal immediately
    closeConfirmModal();
    
    // Show loading state
    confirmOk.disabled = true;
    confirmOk.style.opacity = '0.7';
    confirmOk.innerHTML = '<span style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:8px;"></span> Processing...';
    
    try {
      const requestRef = doc(db, COLLECTIONS.REQUESTS, id);
      
      if (type === "archive") {
        console.log('Archiving request...');
        await updateDoc(requestRef, { 
          archived: true,
          archivedAt: new Date()
        });
        
        console.log('Archive successful');
        
        await logAdminAction({
          actionType: "archive",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Archived request for ${record.fullname} — ${record.event}`
        });
        
        showToast("Request archived successfully!", "success");
      }
      
      if (type === "delete") {
        console.log('Deleting request...');
        await deleteDoc(requestRef);
        console.log('Delete successful');
        
        await logAdminAction({
          actionType: "delete",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Deleted request for ${record.fullname} — ${record.event}`
        });
        
        showToast("Request deleted permanently", "success");
      }
      
      // Reload the history page
      await loadHistory();
      
    } catch (err) {
      console.error("Action error:", err);
      showToast("Operation failed: " + err.message, "error");
    } finally {
      confirmOk.disabled = false;
      confirmOk.style.opacity = '1';
      confirmOk.innerHTML = 'Confirm';
    }
  });
}

// ── Sidebar Toggle ────────────────────────────────────────────
let sidebarOpen = window.innerWidth >= 768;

function setSidebar(open) {
  sidebarOpen = open;
  if (!sidebar) return;

  sidebar.classList.toggle('open', open);
  if (sidebarOverlay) sidebarOverlay.classList.toggle('show', open && window.innerWidth < 768);
  if (hamburger) hamburger.classList.toggle('open', open);
  if (window.innerWidth >= 768) {
    sidebar.classList.toggle('force-closed', !open);
    if (dashLayout) dashLayout.classList.toggle('sidebar-closed', !open);
  }
}

if (hamburger) hamburger.addEventListener("click", () => setSidebar(!sidebarOpen));
if (sidebarOverlay) sidebarOverlay.addEventListener("click", () => setSidebar(false));
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768 && sidebarOverlay) sidebarOverlay.classList.remove('show');
});
setSidebar(sidebarOpen);

// History submenu toggle
if (historyArrow) {
  historyArrow.addEventListener("click", (e) => {
    e.stopPropagation();
    historyMenu.classList.toggle("expanded");
    historySub.classList.toggle("open");
  });
}
if (historyMenu) {
  historyMenu.addEventListener("click", (e) => {
    if (e.target === historyArrow || (historyArrow && historyArrow.contains(e.target))) return;
    historyMenu.classList.toggle("expanded");
    historySub.classList.toggle("open");
  });
}
if (historySub) historySub.classList.add("open");
if (historyMenu) historyMenu.classList.add("expanded");

// ── Profile Dropdown ──────────────────────────────────────────
if (profileTrigger) {
  profileTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdownMenu) dropdownMenu.classList.toggle("show");
  });
  document.addEventListener("click", () => {
    if (dropdownMenu) dropdownMenu.classList.remove("show");
  });
}

// ── Logout ────────────────────────────────────────────────────
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    if (logoutModal) logoutModal.classList.remove("hidden");
  });
}
if (modalCancel) {
  modalCancel.addEventListener("click", () => {
    if (logoutModal) logoutModal.classList.add("hidden");
  });
}
if (modalConfirm) {
  modalConfirm.addEventListener("click", async () => {
    await signOut(auth);
    sessionStorage.clear();
    window.location.href = "../Auth/auth.login.html";
  });
}
if (modalOverlay) {
  modalOverlay.addEventListener("click", () => {
    if (logoutModal) logoutModal.classList.add("hidden");
  });
}

// ── Fullscreen Toggle ─────────────────────────────────────────
const topbarExpand = document.getElementById("topbar-expand");
if (topbarExpand) {
  topbarExpand.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  });
}

// Close sidebar on nav click (mobile)
document.querySelectorAll('.nav-item, .nav-child').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 768) {
      sidebar?.classList.remove('open');
      sidebarOverlay?.classList.remove('show');
      hamburger?.classList.remove('open');
    }
  });
});

console.log('History page initialized');