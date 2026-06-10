/* =============================================
   FaciliTrack – User's Panel Logic
   User/user.js (COMPLETE WITH SHOW USER ACCOUNT & PASSWORD - NO EMAIL)
   ============================================= */

import { db, COLLECTIONS } from "../DatabaseConn/dbconn.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";
import { initPendingRequestNotifications } from "../HomeDashboard/notification-panel.js";

/* ============================================================
   SESSION GUARD
   ============================================================ */
if (!sessionStorage.getItem('ft_admin_id')) {
  window.location.replace('../Auth/auth.login.html');
}

/* ============================================================
   TOPBAR
   ============================================================ */
const fullname  = sessionStorage.getItem('ft_admin_fullname') || 'Admin';
const parts     = fullname.trim().split(' ');
const initials  = (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
document.getElementById('topbar-fullname').textContent = fullname;
document.getElementById('topbar-avatar').textContent   = initials.toUpperCase();
initPendingRequestNotifications();

/* ============================================================
   FULLSCREEN / EXPAND FUNCTIONALITY
   ============================================================ */
const topbarExpand   = document.getElementById('topbar-expand');
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
   TOAST NOTIFICATION FUNCTION
   ============================================================ */
function showToast(message, type = 'success') {
  const existingToast = document.querySelector('.usr-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `usr-toast usr-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   SKELETON LOADING FUNCTIONS
   ============================================================ */
function showSkeletonSummaryCards() {
  document.querySelectorAll('.usr-summary-card').forEach(card => {
    const numSpan = card.querySelector('.usr-summary-num');
    if (numSpan) {
      numSpan.innerHTML = '<div class="skeleton skeleton-summary-num" style="width:60px;height:32px;margin:0 auto;"></div>';
    }
  });
}

function showSkeletonActiveGrid() {
  const grid = document.getElementById('active-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const card = document.createElement('div');
    card.className = 'usr-card-skeleton';
    card.innerHTML = `
      <div class="skeleton skeleton-avatar"></div>
      <div class="skeleton skeleton-text-name"></div>
      <div class="skeleton skeleton-text-id"></div>
      <div class="skeleton skeleton-text-position"></div>
    `;
    grid.appendChild(card);
  }
}

function showSkeletonPendingList() {
  const list = document.getElementById('pending-list');
  if (!list) return;
  list.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const item = document.createElement('div');
    item.className = 'usr-pending-skeleton';
    item.innerHTML = `
      <div class="usr-pending-left">
        <div class="skeleton-pending-dot"></div>
        <div>
          <div class="skeleton skeleton-pending-text"></div>
          <div class="skeleton skeleton-pending-text" style="width:100px;margin-top:4px;"></div>
        </div>
      </div>
      <div class="skeleton skeleton-pending-badge"></div>
    `;
    list.appendChild(item);
  }
}

function hideSkeletons() {
  document.querySelectorAll('.usr-card-skeleton, .usr-pending-skeleton').forEach(el => el.remove());
}

function showButtonLoading(button, text) {
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.classList.add('btn-loading');
  button.textContent = text;
  return original;
}

function hideButtonLoading(button, originalText) {
  if (!button) return;
  button.disabled = false;
  button.classList.remove('btn-loading');
  if (originalText) button.textContent = originalText;
}

function animateCounter(elementId, targetValue) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const startValue = parseInt(element.textContent) || 0;
  if (startValue === targetValue) return;
  const duration = 500;
  const stepTime  = 20;
  const steps     = duration / stepTime;
  const increment = (targetValue - startValue) / steps;
  let currentStep = 0;
  const interval = setInterval(() => {
    currentStep++;
    if (currentStep >= steps) {
      element.textContent = targetValue;
      clearInterval(interval);
    } else {
      element.textContent = Math.round(startValue + increment * currentStep);
    }
  }, stepTime);
}

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
document.getElementById('modal-cancel').addEventListener('click',  () => logoutModal.classList.add('hidden'));
document.getElementById('modal-overlay').addEventListener('click', () => logoutModal.classList.add('hidden'));
document.getElementById('modal-confirm').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.replace('../Auth/auth.login.html');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') logoutModal.classList.add('hidden');
});

/* ============================================================
   VIEW SWITCHING — User List ↔ Register Form
   ============================================================ */
const viewUsers    = document.getElementById('view-users');
const viewRegister = document.getElementById('view-register');

function showUserList() {
  viewUsers.classList.remove('hidden');
  viewRegister.classList.add('hidden');
}

function showRegisterForm() {
  viewUsers.classList.add('hidden');
  viewRegister.classList.remove('hidden');
  document.getElementById('reg-id').value       = '';
  document.getElementById('reg-password').value = '';
  hideRegStatus();
}

document.getElementById('btn-add-user').addEventListener('click', showRegisterForm);
document.getElementById('btn-back').addEventListener('click', showUserList);

/* ============================================================
   TABS — Active Users / Pending Accounts
   ============================================================ */
const tabActive    = document.getElementById('tab-active');
const tabPending   = document.getElementById('tab-pending');
const panelActive  = document.getElementById('panel-active');
const panelPending = document.getElementById('panel-pending');
const tabUnderline = document.getElementById('tab-underline');

let currentTab = 'active';
let allActive  = [];
let allPending = [];
let searchTerm = '';
let isLoading  = true;
let firstLoad  = true;

function positionUnderline(tabEl) {
  tabUnderline.style.left  = tabEl.offsetLeft + 'px';
  tabUnderline.style.width = tabEl.offsetWidth + 'px';
}

function switchTab(tab) {
  currentTab = tab;
  tabActive.classList.toggle('active',  tab === 'active');
  tabPending.classList.toggle('active', tab === 'pending');
  panelActive.classList.toggle('hidden',  tab !== 'active');
  panelPending.classList.toggle('hidden', tab !== 'pending');
  positionUnderline(tab === 'active' ? tabActive : tabPending);
  applySearch();
}

tabActive.addEventListener('click',  () => switchTab('active'));
tabPending.addEventListener('click', () => switchTab('pending'));

requestAnimationFrame(() => positionUnderline(tabActive));
window.addEventListener('resize', () => positionUnderline(currentTab === 'active' ? tabActive : tabPending));

function updateRequestsBadge() {
  const badge = document.getElementById('requests-badge');
  if (!badge) return;

  const q = query(collection(db, 'requests'), where('status', '==', 'Pending'));
  onSnapshot(q, snapshot => {
    const count = snapshot.size;
    if (count > 0) {
      badge.textContent      = count > 99 ? '99+' : count;
      badge.style.display    = 'inline-flex';
      badge.style.animation  = 'pulse 1.5s ease-in-out infinite';
    } else {
      badge.style.display   = 'none';
      badge.style.animation = 'none';
    }
  }, err => {
    console.error('Error fetching pending requests for badge:', err);
  });
}

updateRequestsBadge();

document.getElementById('usr-search').addEventListener('input', function () {
  searchTerm = this.value.toLowerCase().trim();
  applySearch();
});

function applySearch() {
  if (isLoading) return;

  if (currentTab === 'active') {
    const filtered = !searchTerm ? allActive : allActive.filter(u =>
      (u.fullName  || '').toLowerCase().includes(searchTerm) ||
      (u.UserID    || '').toLowerCase().includes(searchTerm) ||
      (u.Username  || '').toLowerCase().includes(searchTerm) ||
      (u.Position  || '').toLowerCase().includes(searchTerm)
    );
    renderActive(filtered);
  } else {
    const filtered = !searchTerm ? allPending : allPending.filter(u =>
      (u.UserID || '').toLowerCase().includes(searchTerm)
    );
    renderPending(filtered);
  }
}

/* ============================================================
   FIRESTORE — Real-time listener on Registered_User
   ============================================================ */
showSkeletonSummaryCards();
showSkeletonActiveGrid();

onSnapshot(collection(db, COLLECTIONS.REGISTERED_USERS), snapshot => {
  allActive  = [];
  allPending = [];

  snapshot.forEach(docSnap => {
    const data = { id: docSnap.id, ...docSnap.data() };

    const hasName   = !!(data.First_Name || data.firstName || data.first_name);
    const isActive  = hasName || data.status === 'active';

    if (isActive) {
      const fn = data.First_Name  || data.firstName  || '';
      const ln = data.Last_Name   || data.lastName   || '';
      const mn = data.Middle_Name || data.middleName || '';
      allActive.push({
        ...data,
        fullName:  `${fn}${mn ? ' ' + mn : ''} ${ln}`.trim() || data.fullName || data.UserID || docSnap.id,
        firstName: fn,
        lastName:  ln,
        UserID:    data.UserID || data.Employee_Id || docSnap.id,
        Username:  data.Username  || data.username  || '',
        Position:  data.Position  || data.position  || '',
        password:  data.password  || '—',
      });
    } else {
      allPending.push({
        ...data,
        UserID: data.UserID || data.Employee_Id || docSnap.id,
        password: data.password || '—',
      });
    }
  });

  allActive.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  allPending.sort((a, b) => {
    const ta = a.registeredAt?.toDate?.() || new Date(0);
    const tb = b.registeredAt?.toDate?.() || new Date(0);
    return tb - ta;
  });

  animateCounter('count-approved', allActive.length);
  animateCounter('count-pending',  allPending.length);
  animateCounter('count-total',    allActive.length + allPending.length);

  isLoading = false;
  hideSkeletons();
  applySearch();

  if (firstLoad) {
    firstLoad = false;
    showToast(`${allActive.length + allPending.length} user(s) loaded`, 'success');
  }

}, err => {
  console.error('Firestore listener error:', err);
  isLoading = false;
  firstLoad = false;
  hideSkeletons();
  showToast('Error loading users: ' + err.message, 'error');
});

/* ============================================================
   SHOW USER ACCOUNT MODAL (WITH PASSWORD - NO EMAIL)
   ============================================================ */
function createShowAccountModal() {
  if (document.getElementById('show-account-modal')) return;
  
  const modalHTML = `
    <div id="show-account-modal" class="modal hidden">
      <div class="modal-overlay" id="show-account-overlay"></div>
      <div class="modal-container credentials-container" style="max-width: 480px;">
        <div class="credentials-header">
          <button class="credentials-close-btn" id="show-account-close" aria-label="Close">←</button>
          <h3>User Account Details</h3>
        </div>
        <div class="modal-body">
          <div class="cred-row"><strong>Full Name:</strong> <span id="account-fullname">—</span></div>
          <div class="cred-row"><strong>ID Number:</strong> <span id="account-id">—</span></div>
          <div class="cred-row"><strong>Position:</strong> <span id="account-position">—</span></div>
          <div class="cred-row"><strong>Status:</strong> <span id="account-status">—</span></div>
          <div class="cred-row" style="align-items: center;">
            <strong>Password:</strong> 
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
              <span id="account-password" data-password="">••••••••</span>
              <button id="toggle-password-visibility" class="toggle-password-btn" title="Show password" style="background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; color: var(--blue-main);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer credentials-footer">
          <button class="modal-btn confirm-btn creds-copy-btn" id="account-copy">Copy Details</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Add event listeners
  document.getElementById('show-account-close')?.addEventListener('click', () => {
    document.getElementById('show-account-modal')?.classList.add('hidden');
  });
  document.getElementById('show-account-overlay')?.addEventListener('click', () => {
    document.getElementById('show-account-modal')?.classList.add('hidden');
  });
  document.getElementById('account-copy')?.addEventListener('click', copyAccountDetails);
}

function copyAccountDetails() {
  const fullname = document.getElementById('account-fullname')?.textContent || '';
  const id = document.getElementById('account-id')?.textContent || '';
  const position = document.getElementById('account-position')?.textContent || '';
  const status = document.getElementById('account-status')?.textContent || '';
  const passwordSpan = document.getElementById('account-password');
  const password = passwordSpan?.getAttribute('data-password') || passwordSpan?.textContent || '••••••••';
  
  const text = `Full Name: ${fullname}\nID Number: ${id}\nPosition: ${position}\nStatus: ${status}\nPassword: ${password}`;
  
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Account details copied to clipboard', 'success'))
      .catch(() => fallbackCopyAccount(text));
  } else {
    fallbackCopyAccount(text);
  }
}

function fallbackCopyAccount(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Account details copied to clipboard', 'success');
  } catch {
    showToast('Copy failed — please copy manually', 'error');
  }
  ta.remove();
}

async function showUserAccount(userId, userData) {
  createShowAccountModal();
  
  const modal = document.getElementById('show-account-modal');
  if (!modal) return;
  
  // Show loading state
  document.getElementById('account-fullname').textContent = 'Loading...';
  document.getElementById('account-id').textContent = userId || '—';
  document.getElementById('account-position').textContent = '—';
  document.getElementById('account-status').textContent = '—';
  const passwordSpan = document.getElementById('account-password');
  if (passwordSpan) {
    passwordSpan.textContent = '••••••••';
    passwordSpan.setAttribute('data-password', '');
  }
  
  modal.classList.remove('hidden');
  
  try {
    let fullUserData = userData;
    
    // If userData is incomplete, fetch from Firestore
    if (!userData || (!userData.First_Name && !userData.firstName && !userData.password)) {
      const docRef = doc(db, COLLECTIONS.REGISTERED_USERS, userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        fullUserData = { id: docSnap.id, ...docSnap.data() };
      }
    }
    
    if (fullUserData) {
      const fn = fullUserData.First_Name || fullUserData.firstName || '';
      const ln = fullUserData.Last_Name || fullUserData.lastName || '';
      const mn = fullUserData.Middle_Name || fullUserData.middleName || '';
      const fullName = `${fn}${mn ? ' ' + mn : ''} ${ln}`.trim() || fullUserData.fullName || '—';
      
      document.getElementById('account-fullname').textContent = fullName || '—';
      document.getElementById('account-id').textContent = fullUserData.UserID || fullUserData.Employee_Id || userId || '—';
      document.getElementById('account-position').textContent = fullUserData.Position || fullUserData.position || '—';
      
      const hasName = !!(fullUserData.First_Name || fullUserData.firstName);
      const status = hasName || fullUserData.status === 'active' ? 'Active' : 'Pending';
      document.getElementById('account-status').textContent = status;
      
      // Set password
      const password = fullUserData.password || '—';
      if (passwordSpan) {
        passwordSpan.textContent = '••••••••';
        passwordSpan.setAttribute('data-password', password);
      }
      
      // Setup password visibility toggle
      const toggleBtn = document.getElementById('toggle-password-visibility');
      if (toggleBtn && password !== '—') {
        // Remove old listener if exists
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode?.replaceChild(newToggleBtn, toggleBtn);
        
        let isVisible = false;
        newToggleBtn.addEventListener('click', () => {
          isVisible = !isVisible;
          if (isVisible) {
            passwordSpan.textContent = password;
            newToggleBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            `;
            newToggleBtn.title = "Hide password";
          } else {
            passwordSpan.textContent = '••••••••';
            newToggleBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            `;
            newToggleBtn.title = "Show password";
          }
        });
      }
    }
  } catch (err) {
    console.error('Error fetching user details:', err);
    showToast('Failed to load user details', 'error');
  }
}

/* ============================================================
   RENDER — Active Users Grid (WITH SHOW ACCOUNT BUTTON)
   ============================================================ */
function renderActive(users) {
  const grid = document.getElementById('active-grid');
  grid.innerHTML = '';

  if (!users.length) {
    grid.innerHTML = `
      <div class="usr-empty">
        <div class="usr-empty-icon">☁️</div>
        <div class="usr-empty-title">Ooops....</div>
        <div class="usr-empty-sub">No Active User Found</div>
      </div>`;
    return;
  }

  users.forEach(u => {
    const fn  = u.firstName || u.First_Name || '';
    const ln  = u.lastName  || u.Last_Name  || '';
    const av  = ((fn[0] || '') + (ln[0] || '')).toUpperCase() || '??';
    const card = document.createElement('div');
    card.className = 'usr-card';
    card.innerHTML = `
      <div class="usr-card-avatar">${escHtml(av)}</div>
      <div class="usr-card-name">${escHtml(u.fullName || u.UserID)}</div>
      <div class="usr-card-id">ID: ${escHtml(u.UserID)}</div>
      ${u.Position ? `<div class="usr-card-position">${escHtml(u.Position)}</div>` : ''}
      <button class="usr-show-account-btn" data-id="${escHtml(u.id)}" data-userid="${escHtml(u.UserID)}" style="margin-top: 10px; padding: 6px 12px; background: var(--blue-light); color: var(--blue-main); border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;">
        Show User Account
      </button>
    `;
    grid.appendChild(card);
    
    // Add event listener for show account button
    const showBtn = card.querySelector('.usr-show-account-btn');
    showBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await showUserAccount(showBtn.dataset.id, u);
    });
  });
}

/* ============================================================
   RENDER — Pending List (ONLY DISTRIBUTE BUTTON)
   ============================================================ */
function renderPending(users) {
  const list = document.getElementById('pending-list');
  list.innerHTML = '';

  if (!users.length) {
    list.innerHTML = `
      <div class="usr-empty">
        <div class="usr-empty-icon">☁️</div>
        <div class="usr-empty-title">Ooops....</div>
        <div class="usr-empty-sub">No Pending User</div>
      </div>`;
    return;
  }

  users.forEach(u => {
    const date = u.registeredAt?.toDate?.()
      ? u.registeredAt.toDate().toLocaleDateString('en-PH', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : '—';

    const item = document.createElement('div');
    item.className = 'usr-pending-item';
    item.innerHTML = `
      <div class="usr-pending-left">
        <div class="usr-pending-dot"></div>
        <div>
          <div class="usr-pending-id">${escHtml(u.UserID)}</div>
          <div class="usr-pending-date">Registered: ${date}</div>
        </div>
      </div>
      <div class="usr-pending-actions">
        <button class="usr-distribute-btn" data-id="${escHtml(u.id)}">Distribute</button>
        <div class="usr-pending-badge">Pending...</div>
      </div>
    `;
    list.appendChild(item);

    // Only distribute button - removed show account button
    item.querySelector('.usr-distribute-btn').addEventListener('click', async e => {
      e.stopPropagation();
      await showCredentialsForUser(u.id, u.UserID, u.password);
    });
  });
}

/* ============================================================
   REGISTER NEW USER
   ============================================================ */
const regIdInput  = document.getElementById('reg-id');
const regPwInput  = document.getElementById('reg-password');
const regStatus   = document.getElementById('reg-status');
const btnGenerate = document.getElementById('btn-generate-pw');
const btnRegister = document.getElementById('btn-register-user');
const toggleRegPw = document.getElementById('toggle-reg-pw');
const eyeRegPw    = document.getElementById('eye-reg-pw');

const EYE_OPEN = `
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
`;
const EYE_CLOSED = `
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
           a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8
           a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
`;

eyeRegPw.innerHTML = EYE_CLOSED;
let pwVisible = false;

toggleRegPw.addEventListener('click', () => {
  pwVisible          = !pwVisible;
  regPwInput.type    = pwVisible ? 'text' : 'password';
  eyeRegPw.innerHTML = pwVisible ? EYE_OPEN : EYE_CLOSED;
});

btnGenerate.addEventListener('click', () => {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  regPwInput.value   = password;
  pwVisible          = true;
  regPwInput.type    = 'text';
  eyeRegPw.innerHTML = EYE_OPEN;
  hideRegStatus();
  showToast('Password generated successfully!', 'success');
});

function showRegStatus(msg, type) {
  regStatus.textContent   = msg;
  regStatus.className     = `usr-reg-status ${type}`;
  regStatus.style.display = 'block';
}
function hideRegStatus() {
  regStatus.style.display = 'none';
  regStatus.textContent   = '';
}

regIdInput.addEventListener('input', hideRegStatus);
regPwInput.addEventListener('input', hideRegStatus);

btnRegister.addEventListener('click', handleRegisterUser);
regIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegisterUser(); });

async function handleRegisterUser() {
  hideRegStatus();

  const userId   = regIdInput.value.trim();
  const password = regPwInput.value;

  if (!userId) {
    showRegStatus('Please enter an ID Number.', 'error');
    regIdInput.focus();
    showToast('Please enter an ID Number.', 'error');
    return;
  }
  if (!password) {
    showRegStatus('Please enter or generate a password.', 'error');
    regPwInput.focus();
    showToast('Please enter or generate a password.', 'error');
    return;
  }
  if (password.length < 6) {
    showRegStatus('Password must be at least 6 characters.', 'error');
    regPwInput.focus();
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  const originalText = showButtonLoading(btnRegister, 'Registering...');

  try {
    const docRef  = doc(db, COLLECTIONS.REGISTERED_USERS, userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const existing = docSnap.data();
      const hasName  = !!(existing.First_Name || existing.firstName);
      const isActive = hasName || existing.status === 'active';

      if (isActive) {
        showRegStatus(`ID "${userId}" is already a registered active user.`, 'error');
        showToast(`ID "${userId}" is already a registered active user.`, 'error');
      } else {
        showRegStatus(`ID "${userId}" is already pending registration.`, 'error');
        showToast(`ID "${userId}" is already pending registration.`, 'error');
      }
      hideButtonLoading(btnRegister, originalText);
      return;
    }

    await setDoc(docRef, {
      UserID:       userId,
      password:     password,
      status:       'pending',
      registeredAt: serverTimestamp(),
    });

    showRegStatus(`User "${userId}" registered successfully! Status: Pending.`, 'success');
    showToast(`User "${userId}" registered successfully!`, 'success');

    populateAndShowCredentials(userId, password);

    setTimeout(() => {
      regIdInput.value   = '';
      regPwInput.value   = '';
      pwVisible          = false;
      regPwInput.type    = 'password';
      eyeRegPw.innerHTML = EYE_CLOSED;
      hideRegStatus();
      showUserList();
      switchTab('pending');
    }, 1800);

  } catch (err) {
    console.error('Register user error:', err);
    showRegStatus('Registration failed: ' + err.message, 'error');
    showToast('Registration failed: ' + err.message, 'error');
  } finally {
    hideButtonLoading(btnRegister, originalText);
  }
}

/* ============================================================
   HELPER
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}

/* ============================================================
   CREDENTIALS MODAL
   ============================================================ */
function populateAndShowCredentials(userId, password) {
  const modal  = document.getElementById('credentials-modal');
  const credId = document.getElementById('cred-id');
  const credPw = document.getElementById('cred-pw');
  if (!modal || !credId || !credPw) return;
  credId.textContent = userId;
  credPw.textContent = password;
  modal.classList.remove('hidden');
}

document.getElementById('cred-close')?.addEventListener('click', () => {
  document.getElementById('credentials-modal')?.classList.add('hidden');
});
document.getElementById('credentials-overlay')?.addEventListener('click', () => {
  document.getElementById('credentials-modal')?.classList.add('hidden');
});

document.getElementById('cred-copy')?.addEventListener('click', () => {
  const id  = document.getElementById('cred-id')?.textContent  || '';
  const pw  = document.getElementById('cred-pw')?.textContent  || '';
  const text = `ID: ${id}\nPassword: ${pw}`;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Credentials copied to clipboard', 'success'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
});

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Credentials copied to clipboard', 'success');
  } catch {
    showToast('Copy failed — please copy manually', 'error');
  }
  ta.remove();
}

async function showCredentialsForUser(docId, cachedUserId, cachedPassword) {
  if (cachedUserId && cachedPassword) {
    populateAndShowCredentials(cachedUserId, cachedPassword);
    return;
  }

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.REGISTERED_USERS, docId));
    if (!snap.exists()) {
      showToast('User not found', 'error');
      return;
    }
    const data = snap.data();
    populateAndShowCredentials(
      data.UserID   || snap.id,
      data.password || '—'
    );
  } catch (err) {
    console.error('Failed to load user credentials:', err);
    showToast('Failed to load credentials: ' + (err.message || 'Permission error'), 'error');
  }
}