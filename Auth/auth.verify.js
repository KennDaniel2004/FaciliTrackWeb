/* =============================================
   FaciliTrack – Verify Code & Reset Password
   Auth/auth.verify.js
   ============================================= */

import { db } from "../DatabaseConn/dbconn.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

(function () {
  'use strict';

  /* ---------- Retrieve Gmail passed from forgot page ---------- */
  const resetGmail = sessionStorage.getItem('ft_reset_gmail');

  /* If no Gmail in session, send back to forgot page */
  if (!resetGmail) {
    window.location.replace('auth.forgot.html');
  }

  /* ---------- Element references — Step 1 (Verify) ---------- */
  const cardVerify  = document.getElementById('card-verify');
  const verifyBtn   = document.getElementById('verify-btn');
  const codeInput   = document.getElementById('verify-code');
  const verifyStatus = document.getElementById('verify-status');

  /* ---------- Element references — Step 2 (New Password) ---------- */
  const cardNewPw     = document.getElementById('card-newpw');
  const newPwInput    = document.getElementById('new-password');
  const confirmPwInput = document.getElementById('confirm-password');
  const savePwBtn     = document.getElementById('save-pw-btn');
  const newPwStatus   = document.getElementById('newpw-status');
  const toggleNewPw   = document.getElementById('toggle-newpw');
  const toggleConfirm = document.getElementById('toggle-confirmpw');
  const eyeNewPw      = document.getElementById('eye-newpw');
  const eyeConfirmPw  = document.getElementById('eye-confirmpw');
  const navRegister   = document.getElementById('nav-register');

  /* ---------- SVG Eye Icons ---------- */
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

  /* ---------- Eye toggle setup ---------- */
  let newPwVisible = false, confirmPwVisible = false;
  eyeNewPw.innerHTML    = EYE_OPEN;
  eyeConfirmPw.innerHTML = EYE_OPEN;

  toggleNewPw.addEventListener('click', function () {
    newPwVisible       = !newPwVisible;
    newPwInput.type    = newPwVisible ? 'text' : 'password';
    eyeNewPw.innerHTML = newPwVisible ? EYE_CLOSED : EYE_OPEN;
  });
  toggleConfirm.addEventListener('click', function () {
    confirmPwVisible        = !confirmPwVisible;
    confirmPwInput.type     = confirmPwVisible ? 'text' : 'password';
    eyeConfirmPw.innerHTML  = confirmPwVisible ? EYE_CLOSED : EYE_OPEN;
  });

  /* ---------- Hide Register nav (security) ---------- */
  async function checkRegistrationLock() {
    try {
      const snap = await getDocs(query(collection(db, 'Registered_Admin'), limit(1)));
      if (!snap.empty && navRegister) navRegister.style.display = 'none';
    } catch (_) {}
  }
  checkRegistrationLock();

  /* ---------- Status helpers ---------- */
  function showVerifyStatus(msg, type) {
    verifyStatus.textContent = msg;
    verifyStatus.className   = 'ft-status' + (type ? ' ' + type : '');
  }
  function showNewPwStatus(msg, type) {
    newPwStatus.textContent = msg;
    newPwStatus.className   = 'ft-status' + (type ? ' ' + type : '');
  }

  /* ---------- Verified admin doc ID (set after step 1 passes) ---------- */
  let verifiedAdminId = null;

  /* =============================================
     STEP 1 — Verify the 8-digit code
     ============================================= */
  async function handleVerify() {
    showVerifyStatus('');
    const enteredCode = codeInput.value.trim();

    if (!enteredCode || enteredCode.length !== 8) {
      showVerifyStatus('Please enter the 8-digit code sent to your Gmail.');
      codeInput.focus();
      return;
    }

    verifyBtn.disabled    = true;
    verifyBtn.textContent = 'Verifying…';

    try {
      /* --- Fetch the reset code document keyed by Gmail --- */
      const codeDoc  = await getDoc(doc(db, 'Password_Reset_Codes', resetGmail));

      if (!codeDoc.exists()) {
        showVerifyStatus('No verification code found. Please request a new one.');
        return;
      }

      const codeData = codeDoc.data();

      /* --- Check if already used --- */
      if (codeData.used) {
        showVerifyStatus('This code has already been used. Please request a new one.');
        return;
      }

      /* --- Check expiry (15 minutes) --- */
      const expiresAt = codeData.expiresAt?.toDate
        ? codeData.expiresAt.toDate()
        : new Date(codeData.expiresAt);

      if (new Date() > expiresAt) {
        showVerifyStatus('Your code has expired. Please request a new one.');
        return;
      }

      /* --- Match the code --- */
      if (codeData.code !== enteredCode) {
        showVerifyStatus('Incorrect code. Please check your Gmail and try again.');
        return;
      }

      /* --- Code is valid — store admin ID and show step 2 --- */
      verifiedAdminId = codeData.adminId;

      showVerifyStatus('Code verified! Set your new password below.', 'success');

      setTimeout(function () {
        cardVerify.style.display = 'none';
        cardNewPw.style.display  = 'block';
        newPwInput.focus();
      }, 900);

    } catch (err) {
      console.error('Verify error:', err);
      showVerifyStatus('Verification failed: ' + err.message);
    } finally {
      verifyBtn.disabled    = false;
      verifyBtn.textContent = 'Verify';
    }
  }

  /* =============================================
     STEP 2 — Save the new password
     ============================================= */
  async function handleSavePassword() {
    showNewPwStatus('');
    const newPw     = newPwInput.value;
    const confirmPw = confirmPwInput.value;

    if (!newPw) {
      showNewPwStatus('Please enter a new password.');
      newPwInput.focus();
      return;
    }
    if (newPw.length < 6) {
      showNewPwStatus('Password must be at least 6 characters.');
      newPwInput.focus();
      return;
    }
    if (!confirmPw) {
      showNewPwStatus('Please confirm your new password.');
      confirmPwInput.focus();
      return;
    }
    if (newPw !== confirmPw) {
      showNewPwStatus('Passwords do not match.');
      confirmPwInput.focus();
      return;
    }

    savePwBtn.disabled    = true;
    savePwBtn.textContent = 'Saving…';

    try {
      /* --- Update password in Registered_Admin --- */
      await updateDoc(doc(db, 'Registered_Admin', verifiedAdminId), {
        password: newPw,   // ⚠️ Hash in production
      });

      /* --- Mark the reset code as used so it can't be reused --- */
      await updateDoc(doc(db, 'Password_Reset_Codes', resetGmail), {
        used: true,
      });

      /* --- Clear session reset data --- */
      sessionStorage.removeItem('ft_reset_gmail');

      showNewPwStatus('Password updated successfully! Redirecting to login…', 'success');

      setTimeout(function () {
        window.location.href = 'auth.login.html';
      }, 1800);

    } catch (err) {
      console.error('Save password error:', err);
      showNewPwStatus('Failed to update password: ' + err.message);
    } finally {
      savePwBtn.disabled    = false;
      savePwBtn.textContent = 'Save New Password';
    }
  }

  /* ---------- Event listeners ---------- */
  verifyBtn.addEventListener('click', handleVerify);
  codeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleVerify();
    // Allow digits only
    if (!/[\d\b]/.test(e.key) && !['ArrowLeft','ArrowRight','Delete','Tab'].includes(e.key)) {
      e.preventDefault();
    }
  });
  codeInput.addEventListener('input', function () {
    verifyStatus.textContent = '';
    verifyStatus.className   = 'ft-status';
  });

  savePwBtn.addEventListener('click', handleSavePassword);
  [newPwInput, confirmPwInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSavePassword(); });
    el.addEventListener('input', function () {
      newPwStatus.textContent = '';
      newPwStatus.className   = 'ft-status';
    });
  });

})();