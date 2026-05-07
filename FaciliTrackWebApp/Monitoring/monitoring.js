/* =============================================
   FaciliTrack – Monitoring Panel Logic
   Monitoring/monitoring.js

   Analytics Dashboard with Charts
   ============================================= */

import { db } from "../DatabaseConn/dbconn.js";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot
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
const parts = fullname.trim().split(' ');
const initials = (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
document.getElementById('topbar-fullname').textContent = fullname;
document.getElementById('topbar-avatar').textContent = initials.toUpperCase();

/* ============================================================
   FULLSCREEN FUNCTIONALITY
   ============================================================ */
const topbarExpand = document.getElementById('topbar-expand');
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
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const dashLayout = document.getElementById('dash-layout');
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
   LOGOUT
   ============================================================ */
const logoutModal = document.getElementById('logout-modal');
const profileTrigger = document.getElementById('profile-trigger');
const dropdownMenu = document.getElementById('dropdown-menu');
const logoutBtn = document.getElementById('logout-btn');

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
document.getElementById('modal-confirm').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.replace('../Auth/auth.login.html');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') logoutModal.classList.add('hidden');
});

/* ============================================================
   REQUESTS BADGE
   ============================================================ */
function updateRequestsBadge() {
  const badge = document.getElementById('requests-badge');
  if (!badge) return;
  
  const pendingQuery = query(collection(db, 'requests'), where('status', '==', 'Pending'));
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

/* ============================================================
   MONITORING LOGIC
   ============================================================ */
let currentPeriod = 'week';
let currentYear = 2026;
let currentMonth = new Date().getMonth();
let allRequests = [];
let charts = {};

// Chart instances
let trendChart = null;
let venueChart = null;
let statusChart = null;

// DOM Elements
const periodBtns = document.querySelectorAll('.period-btn');
const yearSelect = document.getElementById('year-select');
const monthSelect = document.getElementById('month-select');
const monthSelectGroup = document.getElementById('month-select-group');

// Event Listeners
periodBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    periodBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    
    // Show/hide month selector
    if (currentPeriod === 'month') {
      monthSelectGroup.style.display = 'flex';
    } else {
      monthSelectGroup.style.display = 'none';
    }
    
    loadData();
  });
});

yearSelect.addEventListener('change', (e) => {
  currentYear = parseInt(e.target.value);
  loadData();
});

monthSelect.addEventListener('change', (e) => {
  currentMonth = parseInt(e.target.value);
  loadData();
});

// Load all requests from Firestore
async function loadRequests() {
  const requestsQuery = query(collection(db, 'requests'));
  const snapshot = await getDocs(requestsQuery);
  allRequests = [];
  snapshot.forEach(doc => {
    allRequests.push({ id: doc.id, ...doc.data() });
  });
  return allRequests;
}

// Filter requests by date range
function filterRequestsByDate(requests, period, year, month = null) {
  const now = new Date();
  let startDate, endDate;
  
  if (period === 'week') {
    // Last 7 days
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    // Specific month of specific year
    startDate = new Date(year, month, 1);
    endDate = new Date(year, month + 1, 0);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Full year
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
    endDate.setHours(23, 59, 59, 999);
  }
  
  return requests.filter(req => {
    if (!req.date) return false;
    let reqDate;
    if (typeof req.date === 'string') {
      reqDate = new Date(req.date);
    } else if (req.date.toDate) {
      reqDate = req.date.toDate();
    } else {
      return false;
    }
    return reqDate >= startDate && reqDate <= endDate;
  });
}

// Get monthly data for trend chart
function getMonthlyData(requests, year) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const counts = new Array(12).fill(0);
  
  requests.forEach(req => {
    if (!req.date) return;
    let reqDate;
    if (typeof req.date === 'string') {
      reqDate = new Date(req.date);
    } else if (req.date.toDate) {
      reqDate = req.date.toDate();
    } else {
      return;
    }
    if (reqDate.getFullYear() === year) {
      counts[reqDate.getMonth()]++;
    }
  });
  
  return { months, counts };
}

// Get weekly data for trend chart
function getWeeklyData(requests) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = new Array(7).fill(0);
  
  requests.forEach(req => {
    if (!req.date) return;
    let reqDate;
    if (typeof req.date === 'string') {
      reqDate = new Date(req.date);
    } else if (req.date.toDate) {
      reqDate = req.date.toDate();
    } else {
      return;
    }
    counts[reqDate.getDay()]++;
  });
  
  return { days, counts };
}

// Get venue usage data
function getVenueData(requests) {
  const venueStats = {};
  
  requests.forEach(req => {
    const venue = req.venue || 'Unknown';
    const status = req.status || 'Pending';
    
    if (!venueStats[venue]) {
      venueStats[venue] = { total: 0, approved: 0, rejected: 0, pending: 0 };
    }
    
    venueStats[venue].total++;
    if (status === 'Approved' || status === 'approved') {
      venueStats[venue].approved++;
    } else if (status === 'Rejected' || status === 'rejected') {
      venueStats[venue].rejected++;
    } else {
      venueStats[venue].pending++;
    }
  });
  
  return venueStats;
}

// Get status breakdown
function getStatusData(requests) {
  let approved = 0, rejected = 0, pending = 0;
  
  requests.forEach(req => {
    const status = req.status || 'Pending';
    if (status === 'Approved' || status === 'approved') {
      approved++;
    } else if (status === 'Rejected' || status === 'rejected') {
      rejected++;
    } else {
      pending++;
    }
  });
  
  return { approved, rejected, pending, total: requests.length };
}

// Get top requesters
function getTopRequesters(requests) {
  const requesterStats = {};
  
  requests.forEach(req => {
    const name = req.fullname || req.requestedBy || 'Unknown';
    const userId = req.userId || req.idNumber || 'N/A';
    
    if (!requesterStats[name]) {
      requesterStats[name] = { count: 0, userId: userId, name: name };
    }
    requesterStats[name].count++;
  });
  
  return Object.values(requesterStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// Update all charts
function updateCharts(filteredRequests, period, year, month) {
  const statusData = getStatusData(filteredRequests);
  const venueStats = getVenueData(filteredRequests);
  const topRequesters = getTopRequesters(filteredRequests);
  
  // Update stat cards
  document.getElementById('total-requests').textContent = statusData.total;
  document.getElementById('approved-requests').textContent = statusData.approved;
  document.getElementById('rejected-requests').textContent = statusData.rejected;
  document.getElementById('pending-requests').textContent = statusData.pending;
  const approvalRate = statusData.total > 0 ? Math.round((statusData.approved / statusData.total) * 100) : 0;
  document.getElementById('approval-rate').textContent = `${approvalRate}%`;
  
  // Update trend chart based on period
  let trendLabels, trendCounts;
  if (period === 'week') {
    const weeklyData = getWeeklyData(filteredRequests);
    trendLabels = weeklyData.days;
    trendCounts = weeklyData.counts;
  } else {
    const monthlyData = getMonthlyData(filteredRequests, year);
    trendLabels = monthlyData.months;
    trendCounts = monthlyData.counts;
  }
  
  if (trendChart) {
    trendChart.destroy();
  }
  
  const ctx1 = document.getElementById('trend-chart').getContext('2d');
  trendChart = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'Number of Requests',
        data: trendCounts,
        borderColor: '#1e3aab',
        backgroundColor: 'rgba(30, 58, 171, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#1e3aab',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#e2e6f0' } },
        x: { grid: { display: false } }
      }
    }
  });
  
  // Update venue bar chart
  const venues = Object.keys(venueStats).slice(0, 8);
  const venueCounts = venues.map(v => venueStats[v].total);
  
  if (venueChart) {
    venueChart.destroy();
  }
  
  const ctx2 = document.getElementById('venue-chart').getContext('2d');
  venueChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: venues,
      datasets: [{
        label: 'Total Requests',
        data: venueCounts,
        backgroundColor: 'rgba(30, 58, 171, 0.7)',
        borderColor: '#1e3aab',
        borderWidth: 1,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#e2e6f0' } },
        x: { ticks: { rotation: -45, autoSkip: true, maxRotation: 45, minRotation: 45 } }
      }
    }
  });
  
  // Update status doughnut chart
  if (statusChart) {
    statusChart.destroy();
  }
  
  const ctx3 = document.getElementById('status-chart').getContext('2d');
  statusChart = new Chart(ctx3, {
    type: 'doughnut',
    data: {
      labels: ['Approved', 'Rejected', 'Pending'],
      datasets: [{
        data: [statusData.approved, statusData.rejected, statusData.pending],
        backgroundColor: ['#22c55e', '#ef4444', '#f97316'],
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (context) => `${context.label}: ${context.raw} (${Math.round((context.raw / statusData.total) * 100)}%)` } }
      }
    }
  });
  
  // Update top requesters list
  const topRequestersDiv = document.getElementById('top-requesters');
  if (topRequesters.length === 0) {
    topRequestersDiv.innerHTML = '<div class="skeleton-list">No data available</div>';
  } else {
    topRequestersDiv.innerHTML = topRequesters.map((requester, index) => `
      <div class="requester-item">
        <div class="requester-info">
          <div class="requester-avatar">${requester.name.charAt(0).toUpperCase()}</div>
          <div class="requester-details">
            <span class="requester-name">${escapeHtml(requester.name)}</span>
            <span class="requester-id">ID: ${escapeHtml(requester.userId)}</span>
          </div>
        </div>
        <div class="requester-count">${requester.count} requests</div>
      </div>
    `).join('');
  }
  
  // Update venue table
  const tableBody = document.getElementById('venue-table-body');
  const sortedVenues = Object.entries(venueStats)
    .sort((a, b) => b[1].total - a[1].total);
  
  if (sortedVenues.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="loading-row">No venue data available</td></tr>';
  } else {
    tableBody.innerHTML = sortedVenues.map(([venue, stats]) => {
      const usagePercent = statusData.total > 0 ? Math.round((stats.total / statusData.total) * 100) : 0;
      return `
        <tr>
          <td><strong>${escapeHtml(venue)}</strong></td>
          <td>${stats.total}</td>
          <td style="color: #22c55e;">${stats.approved}</td>
          <td style="color: #ef4444;">${stats.rejected}</td>
          <td style="color: #f97316;">${stats.pending}</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${usagePercent}%"></div>
            </div>
            <span class="percentage-text">${usagePercent}%</span>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// Main load data function
async function loadData() {
  // Show loading states
  document.getElementById('total-requests').textContent = '...';
  document.getElementById('approved-requests').textContent = '...';
  document.getElementById('rejected-requests').textContent = '...';
  document.getElementById('pending-requests').textContent = '...';
  document.getElementById('approval-rate').textContent = '...%';
  document.getElementById('top-requesters').innerHTML = '<div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-avatar"></div><div class="skeleton-text"></div><div class="skeleton-badge"></div></div></div>';
  document.getElementById('venue-table-body').innerHTML = '<tr><td colspan="6" class="loading-row">Loading data...</td></tr>';
  
  await loadRequests();
  
  let filteredRequests = allRequests;
  
  if (currentPeriod === 'month') {
    filteredRequests = filterRequestsByDate(allRequests, 'month', currentYear, currentMonth);
  } else if (currentPeriod === 'week') {
    filteredRequests = filterRequestsByDate(allRequests, 'week', currentYear);
  } else {
    filteredRequests = filterRequestsByDate(allRequests, 'year', currentYear);
  }
  
  updateCharts(filteredRequests, currentPeriod, currentYear, currentMonth);
}

// Helper function
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// Initial load
loadData();