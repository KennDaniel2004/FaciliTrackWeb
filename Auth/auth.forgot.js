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

const EMAILJS_SERVICE_ID  = 'service_d5ozvmc';
const EMAILJS_TEMPLATE_ID = 'template_j6l5len';
const EMAILJS_PUBLIC_KEY  = 'pRi3_fVBj_qdIcz_j';

const RESEND_COOLDOWN = 60;

// Load EmailJS
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
script.onload = () => emailjs.init(EMAILJS_PUBLIC_KEY);
script.onerror = () => console.error('[EmailJS] Failed to load');
document.head.appendChild(script);

(function () {
  'use strict';

  const sendBtn     = document.getElementById('send-code-btn');
  const gmailInput  = document.getElementById('forgot-gmail');
  const statusEl    = document.getElementById('forgot-status');
  const resendWrap  = document.getElementById('resend-wrap');
  const resendTimer = document.getElementById('resend-timer');
  const resendLink  = document.getElementById('resend-link');
  const navRegister = document.getElementById('nav-register');

  let countdownInterval = null;
  let lastGmail         = '';

  async function checkRegistrationLock() {
    try {
      const snap = await getDocs(query(collection(db, 'Registered_Admin')));
      if (!snap.empty && navRegister) navRegister.style.display = 'none';
    } catch (_) {}
  }
  checkRegistrationLock();

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className   = 'ft-status' + (type ? ' ' + type : '');
  }
  function clearStatus() {
    statusEl.textContent = '';
    statusEl.className   = 'ft-status';
  }

  function generateCode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

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

      console.log('Generated code:', code);
      console.log('Sending to email:', gmail);

      await setDoc(doc(db, 'Password_Reset_Codes', gmail), {
        gmail:      gmail,
        adminId:    adminDoc.id,
        code:       code,
        used:       false,
        createdAt:  serverTimestamp(),
        expiresAt:  new Date(Date.now() + 15 * 60 * 1000),
      });

      console.log('✓ Code stored in Firestore');

      // Wait for EmailJS
      let retries = 0;
      while (!window.emailjs && retries < 20) {
        await new Promise(r => setTimeout(r, 500));
        retries++;
      }

      if (!window.emailjs) {
        showStatus('Email service not ready. Please refresh.', 'error');
        return;
      }

      emailjs.init(EMAILJS_PUBLIC_KEY);

      // IMPORTANT: Using 'email' not 'to_email' to match template
      const templateParams = {
        email:      gmail,
        admin_name: adminData.fullName || adminData.username || 'Admin',
        code:       code,
      };

      const emailResponse = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams
      );

      console.log('✓ Email sent successfully:', emailResponse);

      lastGmail = gmail;
      showStatus('Verification code sent! Check your Gmail inbox.', 'success');
      
      const codeModal = document.getElementById('code-modal');
      const codeValue = document.getElementById('code-value');
      if (codeModal && codeValue) {
        codeValue.textContent = code;
        codeModal.style.display = 'flex';
      }
      
      startCountdown();

      setTimeout(function () {
        sessionStorage.setItem('ft_reset_gmail', gmail);
        window.location.href = 'auth.verify.html';
      }, 1800);

    } catch (err) {
      console.error('Send code error:', err);
      showStatus('Failed to send code: ' + (err.message || err.text || 'Unknown error'), 'error');
    } finally {
      sendBtn.disabled    = false;
      sendBtn.textContent = 'Send Verification Code';
    }
  }

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

  // Reset code modal handlers
  const codeModal = document.getElementById('code-modal');
  const codeModalClose = document.getElementById('code-modal-close');
  const codeCopyBtn = document.getElementById('code-copy-btn');
  const codeModalContinue = document.getElementById('code-modal-continue');
  const codeValue = document.getElementById('code-value');
  const codeModalOverlay = document.querySelector('.ft-code-modal__overlay');

  function closeCodeModal() {
    if (codeModal) codeModal.style.display = 'none';
  }

  if (codeModalClose) {
    codeModalClose.addEventListener('click', closeCodeModal);
  }

  if (codeModalOverlay) {
    codeModalOverlay.addEventListener('click', closeCodeModal);
  }

  if (codeCopyBtn) {
    codeCopyBtn.addEventListener('click', function () {
      const code = codeValue.textContent;
      if (code && code !== '••••••••') {
        navigator.clipboard.writeText(code).then(() => {
          const originalText = codeCopyBtn.textContent;
          codeCopyBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            codeCopyBtn.textContent = originalText;
          }, 2000);
        }).catch(err => {
          console.error('Copy failed:', err);
        });
      }
    });
  }

  if (codeModalContinue) {
    codeModalContinue.addEventListener('click', function () {
      sessionStorage.setItem('ft_reset_gmail', lastGmail);
      window.location.href = 'auth.verify.html';
    });
  }
})();