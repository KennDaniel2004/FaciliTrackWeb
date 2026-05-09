// ============================================================
// archive.js  —  FaciliTrack Archive Page
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
} from "../../DatabaseConn/dbconn.js";

// ── State ────────────────────────────────────────────────────
let archivedItems = [];
let currentPage = 1;
let filteredItems = [];
const PAGE_SIZE = 10;
let pendingAction = null;
let currentAdmin = null;
let searchTerm = '';

// ── DOM References ────────────────────────────────────────────
const archiveBody = document.getElementById("archive-body");
const emptyDiv = document.getElementById("archive-empty");
const searchInput = document.getElementById("archive-search");
const totalArchivedSpan = document.getElementById("totalArchived");
const archivedThisMonthSpan = document.getElementById("archivedThisMonth");
const paginationDiv = document.getElementById("archive-pagination");
const pageNumbersDiv = document.getElementById("page-numbers");
const pagePrevBtn = document.getElementById("page-prev");
const pageNextBtn = document.getElementById("page-next");

// Topbar elements
const adminFullName = document.getElementById("topbar-fullname");
const adminAvatar = document.getElementById("topbar-avatar");
const profileTrigger = document.getElementById("profile-trigger");
const dropdownMenu = document.getElementById("dropdown-menu");
const logoutBtn = document.getElementById("logout-btn");

// Modals
const viewModal = document.getElementById("view-modal");
const viewModalDetails = document.getElementById("view-modal-details");
const viewModalBack = document.getElementById("view-modal-back");
const viewModalOverlay = document.getElementById("view-modal-overlay");

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
const historyMenu = document.getElementById("historyMenu");
const historySub = document.getElementById("historySub");
const historyArrow = document.getElementById("historyArrow");

// ── Helper Functions ──────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function showToast(message, type = "success") {
  const existingToast = document.querySelector('.archive-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `archive-toast ${type}`;
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
  const archiveLink = document.querySelector('.nav-child[href="archive.html"]');
  if (archiveLink) archiveLink.classList.add('active');
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

function getTimeValue(ts) {
  if (!ts) return 0;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts === "number") return ts;
  if (ts?.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime() || 0;
}

// ── Auth Check ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const adminFromSession = getCurrentAdmin();
  
  if (!user && !adminFromSession) {
    window.location.href = "../../Auth/auth.login.html";
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

  await loadArchive();
  updateSidebarActive();
});

// ── Load Archived Requests ────────────────────────────────────
async function loadArchive() {
  // Show skeleton loading
  if (archiveBody) {
    archiveBody.innerHTML = `
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-cell" style="height: 40px;"></div></td></tr>
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-cell" style="height: 40px;"></div></td></tr>
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-cell" style="height: 40px;"></div></td></tr>
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-cell" style="height: 40px;"></div></td></tr>
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-cell" style="height: 40px;"></div></td></tr>
    `;
  }
  
  if (totalArchivedSpan) totalArchivedSpan.textContent = '--';
  if (archivedThisMonthSpan) archivedThisMonthSpan.textContent = '--';
  
  try {
    const q = query(collection(db, COLLECTIONS.REQUESTS), where("archived", "==", true));
    const snap = await getDocs(q);

    archivedItems = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      archivedItems.push({ 
        id: docSnap.id, 
        ...data,
        displayStatus: normalizeStatus(data.status)
      });
    });

    archivedItems.sort((a, b) => getTimeValue(b.archivedAt) - getTimeValue(a.archivedAt));
    
    updateStats();
    applySearch();
    
  } catch (err) {
    console.error("loadArchive error:", err);
    if (archiveBody) {
      archiveBody.innerHTML = `<tr><td colspan="8" class="empty-row" style="color:red;">Failed to load archive: ${err.message}</td></tr>`;
    }
    showToast("Failed to load archive", "error");
  }
}

// ── Update Stats ──────────────────────────────────────────────
function updateStats() {
  const total = archivedItems.length;
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  const archivedThisMonth = archivedItems.filter(item => {
    const archivedDate = item.archivedAt?.toDate ? item.archivedAt.toDate() : new Date(item.archivedAt);
    return archivedDate && archivedDate.getMonth() === currentMonth && archivedDate.getFullYear() === currentYear;
  }).length;
  
  if (totalArchivedSpan) totalArchivedSpan.textContent = total;
  if (archivedThisMonthSpan) archivedThisMonthSpan.textContent = archivedThisMonth;
}

// ── Search Function ───────────────────────────────────────────
function applySearch() {
  const term = searchInput?.value.toLowerCase() || '';
  filteredItems = term ? archivedItems.filter(item => 
    (item.fullname || '').toLowerCase().includes(term) ||
    (item.event || '').toLowerCase().includes(term) ||
    (item.venue || '').toLowerCase().includes(term) ||
    (item.idNumber || item.userId || '').toLowerCase().includes(term)
  ) : [...archivedItems];
  
  currentPage = 1;
  renderPage();
  renderPagination();
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    applySearch();
  });
}

// ── Render Page ───────────────────────────────────────────────
function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  if (!archiveBody) return;
  
  if (!filteredItems.length) {
    archiveBody.innerHTML = '';
    if (emptyDiv) emptyDiv.classList.remove('hidden');
    if (paginationDiv) paginationDiv.style.display = 'none';
    return;
  }
  
  if (emptyDiv) emptyDiv.classList.add('hidden');
  if (paginationDiv) paginationDiv.style.display = 'flex';
  
  archiveBody.innerHTML = pageItems.map(r => buildRow(r)).join("");
  attachRowListeners();
}

function buildRow(r) {
  let badgeClass = '';
  if (r.displayStatus === 'Approved') badgeClass = 'archive-badge--approved';
  else if (r.displayStatus === 'Finished') badgeClass = 'archive-badge--finished';
  else if (r.displayStatus === 'Rejected') badgeClass = 'archive-badge--rejected';
  else if (r.displayStatus === 'Rescheduled') badgeClass = 'archive-badge--rescheduled';
  else badgeClass = '';

  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.idNumber || r.userId || "—")}<\/td>
      <td>${escapeHtml(r.fullname || "—")}<\/td>
      <td>${escapeHtml(r.event || "—")}<\/td>
      <td>${escapeHtml(r.venue || "—")}<\/td>
      <td>${formatDate(r.date)}<\/td>
      <td><span class="archive-badge ${badgeClass}">${r.displayStatus || "—"}</span><\/td>
      <td>${formatTimestamp(r.archivedAt)}<\/td>
      <td>
        <div class="archive-actions">
          <button class="archive-action-btn archive-action-btn--view" data-action="view" data-id="${r.id}" title="View Details">
            <i class="fa-solid fa-eye"></i><span>View</span>
          </button>
          <button class="archive-action-btn archive-action-btn--unarchive" data-action="unarchive" data-id="${r.id}" title="Un-archive">
            <i class="fa-solid fa-rotate-left"></i><span>Un-archive</span>
          </button>
          <button class="archive-action-btn archive-action-btn--delete" data-action="delete" data-id="${r.id}" title="Delete Permanently">
            <i class="fa-regular fa-trash-can"></i><span>Delete</span>
          </button>
        <\/div>
      <\/td>
    <\/tr>
  `;
}

function attachRowListeners() {
  if (!archiveBody) return;
  archiveBody.querySelectorAll(".archive-action-btn").forEach(btn => {
    btn.removeEventListener('click', btn._listener);
    btn._listener = (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const record = filteredItems.find(r => r.id === id);
      if (!record) return;
      if (action === "view") openViewModal(record);
      if (action === "unarchive") openConfirmModal("unarchive", id, record);
      if (action === "delete") openConfirmModal("delete", id, record);
    };
    btn.addEventListener('click', btn._listener);
  });
}

// ── View Modal ────────────────────────────────────────────────
function openViewModal(r) {
  if (!viewModalDetails) return;
  
  let rescheduleHtml = '';
  if (r.displayStatus === "Rescheduled") {
    rescheduleHtml = `
      <div class="archive-detail-item full">
        <label>Reschedule Reason</label>
        <span>${escapeHtml(r.rescheduleReason || "No reason provided")}</span>
      </div>
      <div class="archive-detail-item">
        <label>Rescheduled By</label>
        <span>${escapeHtml(r.rescheduledByName || r.rescheduledBy || "—")}</span>
      </div>
    `;
  }
  
  viewModalDetails.innerHTML = `
    <div class="archive-detail-grid">
      <div class="archive-detail-item"><label>User ID</label><span>${escapeHtml(r.idNumber || r.userId || "—")}</span></div>
      <div class="archive-detail-item"><label>Full Name</label><span>${escapeHtml(r.fullname || "—")}</span></div>
      <div class="archive-detail-item"><label>Event</label><span>${escapeHtml(r.event || "—")}</span></div>
      <div class="archive-detail-item"><label>Venue</label><span>${escapeHtml(r.venue || "—")}</span></div>
      <div class="archive-detail-item"><label>Original Date</label><span>${formatDate(r.date)}</span></div>
      <div class="archive-detail-item"><label>Time</label><span>${escapeHtml(r.startTime || "—")} – ${escapeHtml(r.endTime || "—")}</span></div>
      <div class="archive-detail-item"><label>Status</label><span>${r.displayStatus || "—"}</span></div>
      <div class="archive-detail-item"><label>Items</label><span>${escapeHtml(r.item || "—")}</span></div>
      <div class="archive-detail-item full"><label>Description</label><span>${escapeHtml(r.eventDescription || "—")}</span></div>
      ${rescheduleHtml}
      <div class="archive-detail-item"><label>Archived Date</label><span>${formatTimestamp(r.archivedAt)}</span></div>
    </div>
  `;

  viewModal.classList.remove("hidden");
}

function closeViewModal() {
  viewModal.classList.add("hidden");
}

if (viewModalBack) viewModalBack.addEventListener("click", closeViewModal);
if (viewModalOverlay) viewModalOverlay.addEventListener("click", closeViewModal);

// ── Confirmation Modal ────────────────────────────────────────
function openConfirmModal(type, id, record) {
  pendingAction = { type, id, record };
  
  const config = {
    unarchive: { icon: "📤", title: "Un-archive Request", msg: `Move "${record.event}" back to History?` },
    delete: { icon: "🗑️", title: "Delete Permanently", msg: `Permanently delete "${record.event}"? This cannot be undone.` }
  };
  
  const cfg = config[type];
  if (cfg) {
    if (confirmIcon) confirmIcon.textContent = cfg.icon;
    if (confirmTitle) confirmTitle.textContent = cfg.title;
    if (confirmMsg) confirmMsg.innerHTML = `<strong>${escapeHtml(record.fullname)}</strong><br>${cfg.msg}`;
  }
  
  confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  confirmModal.classList.add("hidden");
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
      if (type === "unarchive") {
        await updateDoc(ref, { archived: false, archivedAt: null });
        await logAdminAction({
          actionType: "unarchive",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Un-archived request for ${record.fullname} — ${record.event}`
        });
        showToast("Request moved back to History", "success");
      }
      if (type === "delete") {
        await deleteDoc(ref);
        await logAdminAction({
          actionType: "delete_archived",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Permanently deleted archived request for ${record.fullname} — ${record.event}`
        });
        showToast("Request permanently deleted", "success");
      }
      await loadArchive();
    } catch (err) {
      showToast("Operation failed: " + err.message, "error");
    }
  });
}

// ── Pagination ────────────────────────────────────────────────
function renderPagination() {
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  
  if (!paginationDiv || !pageNumbersDiv) return;

  if (totalPages <= 1) {
    paginationDiv.style.display = "none";
    return;
  }
  
  paginationDiv.style.display = "flex";
  pageNumbersDiv.innerHTML = "";
  
  if (pagePrevBtn) pagePrevBtn.disabled = currentPage === 1;
  if (pageNextBtn) pageNextBtn.disabled = currentPage === totalPages;
  
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  if (endPage - startPage + 1 < 5) {
    startPage = Math.max(1, endPage - 4);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement("button");
    btn.className = `archive-page-num ${i === currentPage ? "active" : ""}`;
    btn.textContent = i;
    btn.addEventListener("click", () => goToPage(i));
    pageNumbersDiv.appendChild(btn);
  }
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPage();
  renderPagination();
}

if (pagePrevBtn) pagePrevBtn.addEventListener("click", () => goToPage(currentPage - 1));
if (pageNextBtn) pageNextBtn.addEventListener("click", () => goToPage(currentPage + 1));

// ── Sidebar Toggle ────────────────────────────────────────────
if (hamburger) {
  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    if (sidebarOverlay) sidebarOverlay.classList.toggle("show");
    hamburger.classList.toggle("open");
  });
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
    hamburger.classList.remove("open");
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
historySub?.classList.add("open");
historyMenu?.classList.add("expanded");

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
    window.location.href = "../../Auth/auth.login.html";
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
      sidebar.classList.remove('open');
      sidebarOverlay?.classList.remove('show');
      hamburger?.classList.remove('open');
    }
  });
});

console.log('Archive page initialized');