/* =============================================
   FaciliTrack – Login + Forgot Password Modal
   Auth/auth.login.js

   EmailJS Setup (free — https://emailjs.com):
   1. Create account → Add Gmail service → copy SERVICE_ID
   2. Create template with vars: {{to_email}} {{admin_name}} {{code}}
   3. Copy TEMPLATE_ID and PUBLIC_KEY
   4. Replace the three constants below
   ============================================= */

import { db } from "../DatabaseConn/dbconn.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

/* ── EmailJS credentials — replace with your own ── */
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';

const RESEND_COOLDOWN = 60; // seconds

/* ── Load EmailJS SDK ── */
(function () {
  const s   = document.createElement('script');
  s.src     = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  s.onload  = () => emailjs.init(EMAILJS_PUBLIC_KEY);
  s.onerror = () => console.error('EmailJS SDK failed to load');
  document.head.appendChild(s);
})();

/* ============================================================
   SVG Eye Icons
   ============================================================ */
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

function makeEyeToggle(btnId, inputId, svgId) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  const svg   = document.getElementById(svgId);
  if (!btn || !input || !svg) return;
  svg.innerHTML = EYE_OPEN;
  let visible   = false;
  btn.addEventListener('click', () => {
    visible      = !visible;
    input.type   = visible ? 'text' : 'password';
    svg.innerHTML = visible ? EYE_CLOSED : EYE_OPEN;
  });
}

/* ============================================================
   DOM References
   ============================================================ */
const loginBtn      = document.getElementById('login-btn');
const usernameInput = document.getElementById('login-username');
const passwordInput = document.getElementById('login-password');
const loginStatus   = document.getElementById('login-status');
const navRegister   = document.getElementById('nav-register');
const goRegister    = document.getElementById('go-register');
const goForgot      = document.getElementById('go-forgot');

/* Modal elements */
const overlay       = document.getElementById('ft-modal-overlay');
const modalVerify   = document.getElementById('modal-verify');
const modalReset    = document.getElementById('modal-reset');
const verifyStatus  = document.getElementById('verify-status');
const resetStatus   = document.getElementById('reset-status');
const verifyCodeIn  = document.getElementById('verify-code');
const verifyBtn     = document.getElementById('verify-btn');
const resendWrap    = document.getElementById('resend-wrap');
const resendTimer   = document.getElementById('resend-timer');
const resendLink    = document.getElementById('resend-link');
const resetUsername = document.getElementById('reset-username');
const resetPassword = document.getElementById('reset-password');
const resetConfirm  = document.getElementById('reset-confirm');
const changeBtn     = document.getElementById('change-btn');
const modalLoginBtn = document.getElementById('modal-login-btn');

/* ── Eye toggles ── */
makeEyeToggle('toggle-password',      'login-password',  'eye-icon');
makeEyeToggle('toggle-reset-pw',      'reset-password',  'eye-reset-pw');
makeEyeToggle('toggle-reset-confirm', 'reset-confirm',   'eye-reset-confirm');

/* ============================================================
   State
   ============================================================ */
let countdownInterval = null;
let verifiedAdminId   = null;   // set after code verified
let resetGmail        = null;   // Gmail of admin resetting

/* ============================================================
   Helpers
   ============================================================ */
function showLoginStatus(msg, type) {
  loginStatus.textContent = msg;
  loginStatus.className   = 'ft-status' + (type ? ' ' + type : '');
}

function setVerifyStatus(msg, type) {
  verifyStatus.textContent = msg;
  verifyStatus.className   = 'ft-modal-status ' + (type || '');
  verifyStatus.style.display = msg ? 'block' : 'none';
}

function setResetStatus(msg, type) {
  resetStatus.textContent = msg;
  resetStatus.className   = 'ft-modal-status ' + (type || '');
  resetStatus.style.display = msg ? 'block' : 'none';
}

function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

/* ============================================================
   SECURITY: Registration lock — hide Register if admin exists
   ============================================================ */
async function checkRegistrationLock() {
  try {
    const snap = await getDocs(query(collection(db, 'Registered_Admin'), limit(1)));
    if (!snap.empty) {
      if (navRegister) navRegister.style.display = 'none';
      if (goRegister && goRegister.closest('p')) {
        goRegister.closest('p').style.display = 'none';
      }
    }
  } catch (_) {}
}
checkRegistrationLock();

/* ============================================================
   LOGIN
   ============================================================ */
async function handleLogin() {
  loginStatus.textContent = '';
  loginStatus.className   = 'ft-status';

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username) { showLoginStatus('Please enter your username.'); usernameInput.focus(); return; }
  if (!password) { showLoginStatus('Please enter your password.'); passwordInput.focus(); return; }

  loginBtn.disabled    = true;
  loginBtn.textContent = 'Logging in…';

  try {
    const snap = await getDocs(
      query(collection(db, 'Registered_Admin'), where('username', '==', username))
    );

    if (snap.empty) { showLoginStatus('Invalid username or password.'); return; }

    const adminDoc  = snap.docs[0];
    const adminData = adminDoc.data();

    if (adminData.password !== password) { showLoginStatus('Invalid username or password.'); return; }
    if (adminData.status && adminData.status !== 'active') {
      showLoginStatus('Your account is inactive. Contact the administrator.');
      return;
    }

    sessionStorage.setItem('ft_admin_id',       adminDoc.id);
    sessionStorage.setItem('ft_admin_username',  adminData.username);
    sessionStorage.setItem('ft_admin_fullname',  adminData.fullName || '');
    sessionStorage.setItem('ft_admin_gmail',     adminData.gmail    || '');
    sessionStorage.setItem('ft_admin_role',      adminData.role     || 'admin');

    showLoginStatus('Login successful! Redirecting…', 'success');
    setTimeout(() => { window.location.href = '../HomeDashboard/dashboard.html'; }, 1200);

  } catch (err) {
    showLoginStatus('Login failed: ' + err.message);
  } finally {
    loginBtn.disabled    = false;
    loginBtn.textContent = 'Login';
  }
}

loginBtn.addEventListener('click', handleLogin);
[usernameInput, passwordInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  el.addEventListener('input',   () => { loginStatus.textContent = ''; loginStatus.className = 'ft-status'; });
});

/* ============================================================
   FORGOT PASSWORD — open modal & auto-send code
   ============================================================ */
goForgot.addEventListener('click', async function (e) {
  e.preventDefault();
  openModal();
  await sendVerificationCode();
});

function openModal() {
  overlay.style.display     = 'flex';
  modalVerify.style.display = 'block';
  modalReset.style.display  = 'none';
  verifyCodeIn.value        = '';
  setVerifyStatus('Sending Verification Code ….', 'sending');
}

function closeModal() {
  overlay.style.display = 'none';
  clearInterval(countdownInterval);
  verifiedAdminId = null;
  resetGmail      = null;
}

/* ── Modal Login button → go back to login ── */
modalLoginBtn.addEventListener('click', closeModal);

/* ============================================================
   SEND 8-DIGIT CODE TO REGISTERED GMAIL
   ============================================================ */
async function sendVerificationCode() {
  try {
    /* Get the ONE admin in Registered_Admin */
    const snap = await getDocs(query(collection(db, 'Registered_Admin'), limit(1)));

    if (snap.empty) {
      setVerifyStatus('No admin account found.', 'error');
      return;
    }

    const adminDoc  = snap.docs[0];
    const adminData = adminDoc.data();
    const gmail     = adminData.gmail;
    const code      = generateCode();

    resetGmail = gmail;

    /* Store / overwrite code in Firestore — keyed by Gmail so only ONE exists */
    await setDoc(doc(db, 'Password_Reset_Codes', gmail), {
      gmail:     gmail,
      adminId:   adminDoc.id,
      code:      code,
      used:      false,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min expiry
    });

    /* Send email via EmailJS */
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email:   gmail,
        admin_name: adminData.fullName || adminData.username,
        code:       code,
      },
      EMAILJS_PUBLIC_KEY
    );

    setVerifyStatus(
      'Verification Code was sent — please enter the code to reset your password',
      'success'
    );
    startResendCountdown();

  } catch (err) {
    console.error('Send code error:', err);
    setVerifyStatus('Failed to send code: ' + err.message, 'error');
  }
}

/* ============================================================
   RESEND COUNTDOWN
   ============================================================ */
function startResendCountdown() {
  let remaining = RESEND_COOLDOWN;
  resendWrap.style.display = 'block';
  resendLink.style.display = 'none';
  resendTimer.textContent  = `Resend code in ${remaining}s`;

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      resendTimer.textContent  = '';
      resendLink.style.display = 'inline';
    } else {
      resendTimer.textContent = `Resend code in ${remaining}s`;
    }
  }, 1000);
}

resendLink.addEventListener('click', async function (e) {
  e.preventDefault();
  resendLink.style.display = 'none';
  setVerifyStatus('Sending Verification Code ….', 'sending');
  await sendVerificationCode();
});

/* ============================================================
   VERIFY CODE
   ============================================================ */
verifyBtn.addEventListener('click', handleVerify);
verifyCodeIn.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleVerify();
  // digits only
  if (!/[\d\b]/.test(e.key) && !['ArrowLeft','ArrowRight','Delete','Tab','Backspace'].includes(e.key)) {
    e.preventDefault();
  }
});

async function handleVerify() {
  const entered = verifyCodeIn.value.trim();

  if (!entered || entered.length !== 8) {
    setVerifyStatus('Please enter the complete 8-digit code.', 'error');
    verifyCodeIn.focus();
    return;
  }

  verifyBtn.disabled    = true;
  verifyBtn.textContent = 'Verifying…';

  try {
    const codeDoc = await getDoc(doc(db, 'Password_Reset_Codes', resetGmail));

    if (!codeDoc.exists()) {
      setVerifyStatus('No code found. Please request a new one.', 'error');
      return;
    }

    const data = codeDoc.data();

    if (data.used) {
      setVerifyStatus('This code has already been used. Request a new one.', 'error');
      return;
    }

    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
    if (new Date() > expiresAt) {
      setVerifyStatus('Code expired. Click Resend to get a new one.', 'error');
      return;
    }

    if (data.code !== entered) {
      setVerifyStatus('Incorrect code. Please check your Gmail and try again.', 'error');
      return;
    }

    /* Code valid — store admin ID and show reset form */
    verifiedAdminId = data.adminId;
    clearInterval(countdownInterval);

    /* Switch to Reset Password modal */
    modalVerify.style.display = 'none';
    modalReset.style.display  = 'block';
    setResetStatus('', '');
    resetUsername.focus();

  } catch (err) {
    setVerifyStatus('Verification failed: ' + err.message, 'error');
  } finally {
    verifyBtn.disabled    = false;
    verifyBtn.textContent = 'Verify';
  }
}

/* ============================================================
   RESET PASSWORD (Change username + password)
   ============================================================ */
changeBtn.addEventListener('click', handleReset);
[resetPassword, resetConfirm].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleReset(); })
);

async function handleReset() {
  setResetStatus('', '');
  const newUsername = resetUsername.value.trim();
  const newPassword = resetPassword.value;
  const confirm     = resetConfirm.value;

  if (!newUsername) { setResetStatus('Please enter a new username.', 'error'); resetUsername.focus(); return; }
  if (newUsername.length < 4) { setResetStatus('Username must be at least 4 characters.', 'error'); resetUsername.focus(); return; }
  if (!newPassword) { setResetStatus('Please enter a new password.', 'error'); resetPassword.focus(); return; }
  if (newPassword.length < 6) { setResetStatus('Password must be at least 6 characters.', 'error'); resetPassword.focus(); return; }
  if (newPassword !== confirm) { setResetStatus('Passwords do not match.', 'error'); resetConfirm.focus(); return; }

  changeBtn.disabled    = true;
  changeBtn.textContent = 'Saving…';

  try {
    /* Check new username not already taken (by another account) */
    const dupSnap = await getDocs(
      query(collection(db, 'Registered_Admin'), where('username', '==', newUsername))
    );

    const takenByOther = dupSnap.docs.some(d => d.id !== verifiedAdminId);
    if (takenByOther) {
      setResetStatus('Username already taken. Please choose another.', 'error');
      resetUsername.focus();
      return;
    }

    /* Update Registered_Admin */
    await updateDoc(doc(db, 'Registered_Admin', verifiedAdminId), {
      username: newUsername,
      password: newPassword,  // ⚠️ Hash in production
    });

    /* Mark reset code as used */
    await updateDoc(doc(db, 'Password_Reset_Codes', resetGmail), { used: true });

    setResetStatus('Password changed successfully! Redirecting to login…', 'success');

    setTimeout(() => {
      closeModal();
      showLoginStatus('Password updated! Please log in with your new credentials.', 'success');
    }, 1800);

  } catch (err) {
    setResetStatus('Failed to update: ' + err.message, 'error');
  } finally {
    changeBtn.disabled    = false;
    changeBtn.textContent = 'Change';
  }
}