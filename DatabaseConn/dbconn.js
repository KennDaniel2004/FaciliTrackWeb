import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp,
  onSnapshot,
  setDoc,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyAstx8iQgYFPrx1cpejdMu-PAC4UMBIDNc",
  authDomain: "facilitrack2.firebaseapp.com",
  projectId: "facilitrack2",
  storageBucket: "facilitrack2.firebasestorage.app",
  messagingSenderId: "1033158293419",
  appId: "1:1033158293419:web:bdf87e6f290a794d0c84ee",
  measurementId: "G-YSCCZ89MC5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Collection names constant
const COLLECTIONS = {
  REQUESTS: 'requests',
  REGISTERED_ADMIN: 'Registered_Admin',
  REGISTERED_USERS: 'Registered_User',
  ADMIN_LOGS: 'Admin_Logs',
  PASSWORD_RESET_CODES: 'Password_Reset_Codes',
  ONE_TIME_PASSCODE: 'One_Time_Passcode',
  NOTIFICATION: 'Notification'
};

// Helper function to get current admin from sessionStorage
function getCurrentAdmin() {
  const adminId = sessionStorage.getItem('ft_admin_id');
  const username = sessionStorage.getItem('ft_admin_username');
  const fullName = sessionStorage.getItem('ft_admin_fullname');
  const gmail = sessionStorage.getItem('ft_admin_gmail');
  const role = sessionStorage.getItem('ft_admin_role');
  
  if (!adminId) return null;
  
  return {
    id: adminId,
    username: username,
    fullName: fullName,
    gmail: gmail,
    role: role
  };
}

// Format timestamp to readable string
function formatTimestamp(timestamp) {
  if (!timestamp) return '—';
  
  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }
  
  if (isNaN(date.getTime())) return '—';
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Format date only
function formatDate(dateValue) {
  if (!dateValue) return '—';
  
  let date;
  if (dateValue.toDate) {
    date = dateValue.toDate();
  } else if (typeof dateValue === 'string') {
    date = new Date(dateValue);
  } else {
    date = new Date(dateValue);
  }
  
  if (isNaN(date.getTime())) return '—';
  
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Log admin actions
async function logAdminAction({ actionType, requestId, adminId, adminName, details }) {
  try {
    await addDoc(collection(db, COLLECTIONS.ADMIN_LOGS), {
      actionType: actionType,
      requestId: requestId || null,
      adminId: adminId || null,
      adminName: adminName || 'Unknown',
      details: details || '',
      timestamp: serverTimestamp(),
      date: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to log admin action:', error);
  }
}

// Check if user is authenticated
function requireAuth() {
  const adminId = sessionStorage.getItem('ft_admin_id');
  if (!adminId) {
    window.location.href = '../Auth/auth.login.html';
    return false;
  }
  return true;
}

export {
  app,
  db,
  auth,
  analytics,
  COLLECTIONS,
  getCurrentAdmin,
  formatTimestamp,
  formatDate,
  logAdminAction,
  requireAuth,
  // Firestore functions
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  setDoc,
  arrayUnion,
  arrayRemove,
  onAuthStateChanged,
  signOut
};