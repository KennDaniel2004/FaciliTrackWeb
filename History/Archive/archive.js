// ============================================================
// archive.js  —  FaciliTrack Archive Page (WITH SKELETON LOADING)
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
} from "../../DatabaseConn/dbconn.js";

// ── State ────────────────────────────────────────────────────
let archivedItems = [];
let currentPage = 1;
let filteredItems = [];
const PAGE_SIZE = 10;
let pendingAction = null;
let currentAdmin = null;
let isLoading = true;
let searchTerm = '';

// ── DOM References ────────────────────────────────────────────
const archiveBody = document.getElementById("archiveBody");
const pageNumbers = document.getElementById("pageNumbers");
const pagePrev = document.getElementById("pagePrev");
const pageNext = document.getElementById("pageNext");
const adminFullName = document.getElementById("adminFullName");
const adminAvatar = document.getElementById("adminAvatar");
const searchInput = document.getElementById("archive-search");
const totalArchivedSpan = document.getElementById("totalArchived");
const archivedThisMonthSpan = document.getElementById("archivedThisMonth");

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

const sidebar = document.getElementById("sidebar");
const mainWrapper = document.getElementById("mainWrapper");
const hamburgerBtn = document.getElementById("hamburgerBtn");
const historyMenu = document.getElementById("historyMenu");
const historySub = document.getElementById("historySub");

// Store original skeleton HTML
let originalSkeletonHTML = '';

// Helper functions
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function getTimeValue(ts) {
  if (!ts) return 0;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts === "number") return ts;
  if (ts?.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime() || 0;
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
  const archiveLink = document.querySelector('.nav-sub-item[href="archive.html"]');
  if (archiveLink) archiveLink.classList.add('active');
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
  if (archiveBody && !originalSkeletonHTML) {
    originalSkeletonHTML = archiveBody.innerHTML;
  }
  
  if (archiveBody) {
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
    archiveBody.innerHTML = skeletonRows.join('');
  }
  
  // Show skeleton for stats
  if (totalArchivedSpan) totalArchivedSpan.textContent = '--';
  if (archivedThisMonthSpan) archivedThisMonthSpan.textContent = '--';
}

function hideSkeletonAndShowContent() {
  // Stats will be updated by updateStats function
  isLoading = false;
}

// ── Auth Check ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const adminFromSession = getCurrentAdmin();
  
  if (!user && !adminFromSession) {
    console.log('No authentication found, redirecting to login...');
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
  showSkeletonLoading();
  
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

    // Sort by archivedAt descending (newest first)
    archivedItems.sort((a, b) => getTimeValue(b.archivedAt) - getTimeValue(a.archivedAt));
    
    // Update stats
    updateStats();
    
    // Apply current search filter
    applySearch();
    
    hideSkeletonAndShowContent();
    
  } catch (err) {
    console.error("loadArchive error:", err);
    if (archiveBody) {
      archiveBody.innerHTML = `<tr><td colspan="8" class="empty-row" style="color:var(--red)">Failed to load archive. Please refresh.<\/td><\/tr>`;
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
  if (!searchTerm.trim()) {
    filteredItems = [...archivedItems];
  } else {
    const term = searchTerm.toLowerCase();
    filteredItems = archivedItems.filter(item => 
      (item.fullname || '').toLowerCase().includes(term) ||
      (item.event || '').toLowerCase().includes(term) ||
      (item.venue || '').toLowerCase().includes(term) ||
      (item.idNumber || item.userId || '').toLowerCase().includes(term)
    );
  }
  
  currentPage = 1;
  renderPage();
  renderPagination();
}

// Search input listener
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    applySearch();
  });
}

// ── Render current page ───────────────────────────────────────
function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  if (!archiveBody) return;
  
  if (!filteredItems.length) {
    archiveBody.innerHTML = `<tr><td colspan="8" class="empty-row"><i class="fa-solid fa-box-open"></i> No archived requests found.<\/td><\/tr>`;
    return;
  }

  archiveBody.innerHTML = pageItems.map(r => buildRow(r)).join("");
  attachRowListeners();
}

function buildRow(r) {
  const badgeClass = {
    Approved: "badge--approved",
    Finished: "badge--finished",
    Rejected: "badge--rejected",
    Rescheduled: "badge--rescheduled"
  }[r.displayStatus] || "";

  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.idNumber || r.userId || "—")}<\/td>
      <td>${escapeHtml(r.fullname || "—")}<\/td>
      <td>${escapeHtml(r.event || "—")}<\/td>
      <td>${escapeHtml(r.venue || "—")}<\/td>
      <td>${formatDate(r.date)}<\/td>
      <td><span class="badge ${badgeClass}">${r.displayStatus || "—"}<\/span><\/td>
      <td>${formatTimestamp(r.archivedAt)}<\/td>
      <td>
        <div class="actions-cell">
          <button class="act-btn act-btn--view" data-action="view" data-id="${r.id}" title="View Details">
            <i class="fa-solid fa-eye"></i><span>View</span>
          </button>
          <button class="act-btn act-btn--unarchive" data-action="unarchive" data-id="${r.id}" title="Un-archive">
            <i class="fa-solid fa-rotate-left"></i><span>Un-archive</span>
          </button>
          <button class="act-btn act-btn--delete" data-action="delete" data-id="${r.id}" title="Delete Permanently">
            <i class="fa-regular fa-trash-can"></i><span>Delete</span>
          </button>
        <\/div>
      <\/td>
    <\/tr>
  `;
}

function attachRowListeners() {
  if (!archiveBody) return;
  archiveBody.querySelectorAll(".act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const record = filteredItems.find(r => r.id === id);
      if (!record) return;
      if (action === "view") openViewModal(record);
      if (action === "unarchive") askConfirm("unarchive", id, record);
      if (action === "delete") askConfirm("delete", id, record);
    });
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
        <span>${escapeHtml(r.rescheduleReason || "No reason provided")}<\/span>
      <\/div>
      <div class="detail-item">
        <label>Rescheduled By</label>
        <span>${escapeHtml(r.rescheduledByName || r.rescheduledBy || "—")}<\/span>
      <\/div>
    `;
  }
  
  viewModalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>User ID</label><span>${escapeHtml(r.idNumber || r.userId || "—")}<\/span><\/div>
      <div class="detail-item"><label>Full Name</label><span>${escapeHtml(r.fullname || "—")}<\/span><\/div>
      <div class="detail-item"><label>Event<\/label><span>${escapeHtml(r.event || "—")}<\/span><\/div>
      <div class="detail-item"><label>Venue<\/label><span>${escapeHtml(r.venue || "—")}<\/span><\/div>
      <div class="detail-item"><label>Original Date<\/label><span>${formatDate(r.date)}<\/span><\/div>
      <div class="detail-item"><label>Time<\/label><span>${escapeHtml(r.startTime || "—")} – ${escapeHtml(r.endTime || "—")}<\/span><\/div>
      <div class="detail-item"><label>Status<\/label><span><span class="badge badge--${r.displayStatus?.toLowerCase()}">${r.displayStatus || "—"}<\/span><\/span><\/div>
      <div class="detail-item"><label>Items<\/label><span>${escapeHtml(r.item || "—")}<\/span><\/div>
      <div class="detail-item full"><label>Description<\/label><span>${escapeHtml(r.eventDescription || "—")}<\/span><\/div>
      ${rescheduleHtml}
      <div class="detail-item"><label>Archived Date<\/label><span>${formatTimestamp(r.archivedAt)}<\/span><\/div>
      <div class="detail-item"><label>Created<\/label><span>${formatTimestamp(r.createdAt)}<\/span><\/div>
    <\/div>
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

// ── Pagination ────────────────────────────────────────────────
function renderPagination() {
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const paginationRow = document.getElementById("paginationRow");
  if (!paginationRow) return;

  if (totalPages <= 1) {
    paginationRow.style.display = "none";
    return;
  }
  paginationRow.style.display = "flex";

  if (pageNumbers) {
    pageNumbers.innerHTML = "";
    
    // Show first page
    const firstBtn = document.createElement("button");
    firstBtn.className = `page-num ${1 === currentPage ? "active" : ""}`;
    firstBtn.textContent = "1";
    firstBtn.addEventListener("click", () => goToPage(1));
    pageNumbers.appendChild(firstBtn);
    
    // Show ellipsis if needed
    if (currentPage > 3) {
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.padding = "0 4px";
      pageNumbers.appendChild(ellipsis);
    }
    
    // Show pages around current page
    let startPage = Math.max(2, currentPage - 1);
    let endPage = Math.min(totalPages - 1, currentPage + 1);
    
    for (let i = startPage; i <= endPage; i++) {
      if (i === 1 || i === totalPages) continue;
      const btn = document.createElement("button");
      btn.className = `page-num ${i === currentPage ? "active" : ""}`;
      btn.textContent = i;
      btn.addEventListener("click", () => goToPage(i));
      pageNumbers.appendChild(btn);
    }
    
    // Show ellipsis if needed
    if (currentPage < totalPages - 2) {
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.padding = "0 4px";
      pageNumbers.appendChild(ellipsis);
    }
    
    // Show last page if more than 1
    if (totalPages > 1) {
      const lastBtn = document.createElement("button");
      lastBtn.className = `page-num ${totalPages === currentPage ? "active" : ""}`;
      lastBtn.textContent = totalPages;
      lastBtn.addEventListener("click", () => goToPage(totalPages));
      pageNumbers.appendChild(lastBtn);
    }
  }
  
  if (pagePrev) pagePrev.disabled = currentPage === 1;
  if (pageNext) pageNext.disabled = currentPage === totalPages;
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPage();
  renderPagination();
}

if (pagePrev) pagePrev.addEventListener("click", () => goToPage(currentPage - 1));
if (pageNext) pageNext.addEventListener("click", () => goToPage(currentPage + 1));

// ── Confirmation Modal ────────────────────────────────────────
const CONFIRM_CONFIG = {
  unarchive: { icon: "📤", title: "Un-archive this Request?", message: "This request will be moved back to History.", btnLabel: "Un-archive", btnClass: "btn--primary" },
  delete: { icon: "🗑️", title: "Delete this Request Permanently?", message: "This action is permanent and cannot be undone. The request will be removed completely from the database.", btnLabel: "Delete Permanently", btnClass: "btn--danger" }
};

function askConfirm(type, id, record) {
  const cfg = CONFIRM_CONFIG[type];
  if (!cfg) return;
  pendingAction = { type, id, record };
  if (confirmIcon) confirmIcon.textContent = cfg.icon;
  if (confirmTitle) confirmTitle.textContent = cfg.title;
  if (confirmMessage) confirmMessage.innerHTML = `<strong>${escapeHtml(record.fullname || record.idNumber)}<\/strong><br><strong>Event:</strong> ${escapeHtml(record.event || "—")}<br><br>${cfg.message}`;
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
      if (type === "unarchive") {
        await updateDoc(ref, { archived: false, archivedAt: null });
        await logAdminAction({
          actionType: "unarchive",
          requestId: record.requestId || id,
          adminId: currentAdmin?.id,
          adminName: currentAdmin?.fullName || currentAdmin?.username,
          details: `Un-archived request for ${record.fullname} — ${record.event}`
        });
        showToast("Request moved back to History.", "success");
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
        showToast("Request permanently deleted.", "success");
      }
      await loadArchive();
    } catch (err) {
      console.error("Action error:", err);
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      confirmProceed.disabled = false;
    }
  });
}

// ── Sidebar toggle ────────────────────────────────────────────
if (hamburgerBtn) {
  hamburgerBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    mainWrapper.classList.toggle("expanded");
  });
}
if (historyMenu) {
  historyMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    historyMenu.classList.toggle("open");
    historySub.classList.toggle("open");
  });
}
historyMenu.classList.add("open");
historySub.classList.add("open");

// Logout functionality
const logoutBtn = document.getElementById('logout-btn');
const logoutModalElem = document.getElementById('logout-modal');
const modalCancelBtn = document.getElementById('modal-cancel');
const modalConfirmBtn = document.getElementById('modal-confirm');

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    logoutModalElem.classList.remove('hidden');
  });
}
if (modalCancelBtn) {
  modalCancelBtn.addEventListener('click', () => {
    logoutModalElem.classList.add('hidden');
  });
}
if (modalConfirmBtn) {
  modalConfirmBtn.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = '../../Auth/auth.login.html';
  });
}