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
  onAuthStateChanged
} from "../DatabaseConn/dbconn.js";

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

// Modals
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

// Sidebar elements
const hamburger = document.getElementById("hamburger");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
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
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
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

// IMPORTANT: This function handles different status case formats
function normalizeStatus(status) {
  if (!status) return 'Pending';
  
  // Convert to lowercase for comparison
  const statusLower = String(status).toLowerCase();
  
  if (statusLower === 'approved') return 'Approved';
  if (statusLower === 'rejected') return 'Rejected';
  if (statusLower === 'finished') return 'Finished';
  if (statusLower === 'rescheduled') return 'Rescheduled';
  if (statusLower === 'pending') return 'Pending';
  
  // If unknown, return as is with first letter capitalized
  return statusLower.charAt(0).toUpperCase() + statusLower.slice(1);
}

// ── Update Counts Function ─────────────────────────────────────
function updateCounts() {
  // Count based on displayStatus
  const approved = allRequests.filter(r => r.displayStatus === "Approved").length;
  const rejected = allRequests.filter(r => r.displayStatus === "Rejected").length;
  const rescheduled = allRequests.filter(r => r.displayStatus === "Rescheduled").length;
  const finished = allRequests.filter(r => r.displayStatus === "Finished").length;
  
  console.log('=== COUNT UPDATE ===');
  console.log('Total requests:', allRequests.length);
  console.log('Approved:', approved);
  console.log('Rejected:', rejected);
  console.log('Rescheduled:', rescheduled);
  console.log('Finished:', finished);
  console.log('All statuses:', allRequests.map(r => ({ id: r.id, status: r.status, displayStatus: r.displayStatus })));
  
  // Update DOM
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
  
  // Set counts to 0 while loading
  if (countApprovedSpan) countApprovedSpan.textContent = '0';
  if (countRejectSpan) countRejectSpan.textContent = '0';
  if (countRescheduledSpan) countRescheduledSpan.textContent = '0';
  if (countFinishedSpan) countFinishedSpan.textContent = '0';
}

function hideSkeletonAndShowContent() {
  // Just remove skeleton class, actual content will be rendered by renderTab
  isLoading = false;
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
    // Get ALL requests from Firestore
    const q = query(collection(db, COLLECTIONS.REQUESTS));
    const snap = await getDocs(q);
    
    console.log('Firestore returned', snap.size, 'documents');

    allRequests = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      
      // Skip archived requests
      if (data.archived === true) {
        console.log('Skipping archived:', docSnap.id);
        return;
      }
      
      const normalizedStatus = normalizeStatus(data.status);
      
      allRequests.push({ 
        id: docSnap.id, 
        ...data,
        displayStatus: normalizedStatus,
        originalStatus: data.status  // Keep original for debugging
      });
    });

    console.log('Processed requests:', allRequests.length);
    console.log('Request details:', allRequests.map(r => ({ 
      id: r.id, 
      fullname: r.fullname,
      originalStatus: r.originalStatus,
      displayStatus: r.displayStatus 
    })));
    
    // Hide skeleton
    hideSkeletonAndShowContent();
    
    // Update counts and render
    updateCounts();
    
    // Attach event listeners
    attachCardListeners();
    attachTabListeners();
    
    // Render the current tab
    renderTab(currentTab);
    
    if (allRequests.length === 0) {
      showToast('No requests found in database', 'info');
    } else {
      showToast(`Loaded ${allRequests.length} requests`, 'success');
    }
    
  } catch (err) {
    console.error("loadHistory error:", err);
    hideSkeletonAndShowContent();
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
    cardApproved._listener = () => {
      document.querySelectorAll(".history-tab-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.dataset.tab === "approved") btn.classList.add("active");
      });
      currentTab = "approved";
      applySearch();
    };
    cardApproved.addEventListener('click', cardApproved._listener);
  }
  
  if (cardReject) {
    cardReject.removeEventListener('click', cardReject._listener);
    cardReject._listener = () => {
      document.querySelectorAll(".history-tab-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.dataset.tab === "rejected") btn.classList.add("active");
      });
      currentTab = "rejected";
      applySearch();
    };
    cardReject.addEventListener('click', cardReject._listener);
  }
  
  if (cardRescheduled) {
    cardRescheduled.removeEventListener('click', cardRescheduled._listener);
    cardRescheduled._listener = () => {
      document.querySelectorAll(".history-tab-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.dataset.tab === "rescheduled") btn.classList.add("active");
      });
      currentTab = "rescheduled";
      applySearch();
    };
    cardRescheduled.addEventListener('click', cardRescheduled._listener);
  }
  
  if (cardFinished) {
    cardFinished.removeEventListener('click', cardFinished._listener);
    cardFinished._listener = () => {
      document.querySelectorAll(".history-tab-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.dataset.tab === "finished") btn.classList.add("active");
      });
      currentTab = "finished";
      applySearch();
    };
    cardFinished.addEventListener('click', cardFinished._listener);
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
  
  console.log(`Rendering tab "${tab}" - Found ${rows.length} requests with status:`, targetStatuses);

  if (!historyBody) return;
  
  if (!rows.length) {
    historyBody.innerHTML = '';
    if (emptyDiv) emptyDiv.classList.remove('hidden');
    return;
  }
  
  if (emptyDiv) emptyDiv.classList.add('hidden');
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

function buildRow(r) {
  const badgeClass = {
    Approved: "history-badge--approved",
    Finished: "history-badge--finished",
    Rejected: "history-badge--rejected",
    Rescheduled: "history-badge--rescheduled"
  }[r.displayStatus] || "";

  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.idNumber || r.userId || "—")}</td>
      <td>${escapeHtml(r.fullname || "—")}</td>
      <td>${escapeHtml(r.event || "—")}</td>
      <td>${escapeHtml(r.venue || "—")}</td>
      <td>${formatDate(r.date)}</td>
      <td><span class="history-badge ${badgeClass}">${r.displayStatus}</span></td>
      <td>${getRelevantTimestamp(r)}</td>
      <td><div class="history-actions">
          <button class="history-action-btn history-action-btn--archive" data-action="archive" data-id="${r.id}" title="Archive">
            <i class="fa-solid fa-box-archive"></i><span>Archive</span>
          </button>
          <button class="history-action-btn history-action-btn--delete" data-action="delete" data-id="${r.id}" title="Delete">
            <i class="fa-regular fa-trash-can"></i><span>Delete</span>
          </button>
        </div></td>
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
      openConfirmModal(action, id, record);
    };
    btn.addEventListener('click', btn._listener);
  });
}

// ── Confirmation Modal ────────────────────────────────────────
function openConfirmModal(type, id, record) {
  pendingAction = { type, id, record };
  
  const config = {
    archive: { icon: "📦", title: "Archive Request", msg: `Move "${record.event}" to archive?` },
    delete: { icon: "🗑️", title: "Delete Request", msg: `Permanently delete "${record.event}"? This cannot be undone.` }
  };
  
  const cfg = config[type];
  if (cfg) {
    if (confirmIcon) confirmIcon.textContent = cfg.icon;
    if (confirmTitle) confirmTitle.textContent = cfg.title;
    if (confirmMsg) confirmMsg.innerHTML = `<strong>${escapeHtml(record.fullname)}</strong><br>${cfg.msg}`;
  }
  
  if (confirmModal) confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  if (confirmModal) confirmModal.classList.add("hidden");
  pendingAction = null;
}

if (confirmCancel) confirmCancel.addEventListener("click", closeConfirmModal);
if (confirmOverlay) confirmOverlay.addEventListener("click", closeConfirmModal);
if (confirmOk) {
  confirmOk.addEventListener("click", async () => {
    if (!pendingAction) return;
    closeConfirmModal();
    
    const { type, id, record } = pendingAction;
    
    try {
      const ref = doc(db, COLLECTIONS.REQUESTS, id);
      if (type === "archive") {
        await updateDoc(ref, { archived: true, archivedAt: new Date() });
        showToast("Request archived successfully");
      }
      if (type === "delete") {
        await deleteDoc(ref);
        showToast("Request deleted successfully");
      }
      await loadHistory();
    } catch (err) {
      showToast("Operation failed: " + err.message, "error");
    }
  });
}

// ── Sidebar Toggle ────────────────────────────────────────────
if (hamburger) {
  hamburger.addEventListener("click", () => {
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
  modalConfirm.addEventListener("click", () => {
    sessionStorage.clear();
    window.location.href = "../Auth/auth.login.html";
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
      if (sidebar) sidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }
  });
});

console.log('History page initialized - waiting for data...');