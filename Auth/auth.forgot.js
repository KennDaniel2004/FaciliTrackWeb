

import { db } from "../DatabaseConn/dbconn.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";


const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';  
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; 
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';

/* ── Resend cooldown in seconds ── */
const RESEND_COOLDOWN = 60;

(function () {
  'use strict';

  /* ---------- Element references ---------- */
  const sendBtn     = document.getElementById('send-code-btn');
  const gmailInput  = document.getElementById('forgot-gmail');
  const statusEl    = document.getElementById('forgot-status');
  const resendWrap  = document.getElementById('resend-wrap');
  const resendTimer = document.getElementById('resend-timer');
  const resendLink  = document.getElementById('resend-link');
  const navRegister = document.getElementById('nav-register');

  let countdownInterval = null;
  let lastGmail         = '';

  /* ---------- Hide Register nav (security) ---------- */
  async function checkRegistrationLock() {
    try {
      const { getDocs: gd, query: q, collection: col, limit: lim } =
        await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js");
      const snap = await getDocs(query(collection(db, 'Registered_Admin'), lim ? lim(1) : undefined));
      if (!snap.empty && navRegister) navRegister.style.display = 'none';
    } catch (_) {}
  }
  checkRegistrationLock();

  /* ---------- Status helpers ---------- */
  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className   = 'ft-status' + (type ? ' ' + type : '');
  }
  function clearStatus() {
    statusEl.textContent = '';
    statusEl.className   = 'ft-status';
  }

  /* ---------- Generate 8-digit code ---------- */
  function generateCode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  /* ---------- Start resend countdown ---------- */
  function startCountdown() {
    let remaining = RESEND_COOLDOWN;
    resendWrap.style.display = 'block';
    resendLink.style.display = 'none';
    resendTimer.textContent  = `Resend code in ${remaining}s`;

    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
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

  /* ---------- Send code handler ---------- */
  async function sendCode() {
    clearStatus();
    const gmail = gmailInput.value.trim();

    if (!gmail) {
      showStatus('Please enter your Gmail address.');
      gmailInput.focus();
      return;
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(gmail)) {
      showStatus('Please enter a valid Gmail address.');
      gmailInput.focus();
      return;
    }

    sendBtn.disabled    = true;
    sendBtn.textContent = 'Sending…';

    try {
      /* --- Look up admin by Gmail in Firestore --- */
      const snapshot = await getDocs(
        query(collection(db, 'Registered_Admin'), where('gmail', '==', gmail))
      );

      if (snapshot.empty) {
        showStatus('No account found with this Gmail address.');
        return;
      }

      const adminDoc  = snapshot.docs[0];
      const adminData = adminDoc.data();
      const code      = generateCode();

      /* --- Store / overwrite code in Firestore (auto-refresh on new request) ---
         Collection : Password_Reset_Codes
         Document   : keyed by Gmail so there is always only ONE active code per user
      ----------------------------------------------------------------- */
      await setDoc(doc(db, 'Password_Reset_Codes', gmail), {
        gmail:      gmail,
        adminId:    adminDoc.id,
        code:       code,
        used:       false,
        createdAt:  serverTimestamp(),
        expiresAt:  new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      });

      /* --- Send email via EmailJS --- */
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

      lastGmail = gmail;
      showStatus('Verification code sent! Check your Gmail inbox.', 'success');
      startCountdown();

      /* Redirect to verify page after short delay */
      setTimeout(function () {
        sessionStorage.setItem('ft_reset_gmail', gmail);
        window.location.href = 'auth.verify.html';
      }, 1800);

    } catch (err) {
      console.error('Send code error:', err);
      showStatus('Failed to send code: ' + err.message);
    } finally {
      sendBtn.disabled    = false;
      sendBtn.textContent = 'Send Verification Code';
    }
  }

  /* ---------- Event listeners ---------- */
  sendBtn.addEventListener('click', sendCode);
  gmailInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendCode();
  });
  gmailInput.addEventListener('input', clearStatus);

  resendLink.addEventListener('click', function (e) {
    e.preventDefault();
    resendLink.style.display = 'none';
    sendCode();
  });

  /* ---------- Load EmailJS SDK ---------- */
  (function loadEmailJS() {
    if (window.emailjs) return;
    const script   = document.createElement('script');
    script.src     = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload  = function () { emailjs.init(EMAILJS_PUBLIC_KEY); };
    script.onerror = function () { console.error('EmailJS SDK failed to load.'); };
    document.head.appendChild(script);
  })();

})();