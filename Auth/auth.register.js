

import { db } from "../DatabaseConn/dbconn.js";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

(function () {
  'use strict';


  const registerBtn      = document.getElementById('register-btn');
  const statusEl         = document.getElementById('register-status');

  const firstNameInput   = document.getElementById('reg-firstname');
  const lastNameInput    = document.getElementById('reg-lastname');
  const middleNameInput  = document.getElementById('reg-middlename');
  const gmailInput       = document.getElementById('reg-gmail');
  const usernameInput    = document.getElementById('reg-username');
  const passwordInput    = document.getElementById('reg-password');
  const confirmInput     = document.getElementById('reg-confirm');

  const togglePwBtn      = document.getElementById('toggle-password');
  const toggleConfirmBtn = document.getElementById('toggle-confirm');
  const eyeIconPw        = document.getElementById('eye-icon-pw');
  const eyeIconConfirm   = document.getElementById('eye-icon-confirm');



// toggle pass

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

  let pwVisible = false, confirmVisible = false;

  eyeIconPw.innerHTML      = EYE_OPEN;
  eyeIconConfirm.innerHTML = EYE_OPEN;

  togglePwBtn.addEventListener('click', function () {
    pwVisible              = !pwVisible;
    passwordInput.type     = pwVisible ? 'text' : 'password';
    eyeIconPw.innerHTML    = pwVisible ? EYE_CLOSED : EYE_OPEN;
    togglePwBtn.setAttribute('aria-label', pwVisible ? 'Hide password' : 'Show password');
  });

  toggleConfirmBtn.addEventListener('click', function () {
    confirmVisible           = !confirmVisible;
    confirmInput.type        = confirmVisible ? 'text' : 'password';
    eyeIconConfirm.innerHTML = confirmVisible ? EYE_CLOSED : EYE_OPEN;
    toggleConfirmBtn.setAttribute('aria-label', confirmVisible ? 'Hide confirm password' : 'Show confirm password');
  });


  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className   = 'ft-status' + (type ? ' ' + type : '');
  }

  function clearStatus() {
    statusEl.textContent = '';
    statusEl.className   = 'ft-status';
  }



//  One Time Register Functionality


  async function enforceOneTimeRegistration() {
    try {
      const snapshot = await getDocs(
        query(collection(db, 'Registered_Admin'), limit(1))
      );

      if (!snapshot.empty) {
        console.warn('Registration is locked. Redirecting to login.');
        window.location.replace('auth.login.html');
      }
    } catch (err) {
      console.error('Registration guard failed:', err);
      window.location.replace('auth.login.html');
    }
  }

  enforceOneTimeRegistration();


  function isValidGmail(email) {
    return /^[^\s@]+@gmail\.com$/i.test(email.trim());
  }

  function validateForm() {
    const firstName = firstNameInput.value.trim();
    const lastName  = lastNameInput.value.trim();
    const gmail     = gmailInput.value.trim();
    const username  = usernameInput.value.trim();
    const password  = passwordInput.value;
    const confirm   = confirmInput.value;

    if (!firstName)           { showStatus('Please enter your first name.');            firstNameInput.focus(); return false; }
    if (!lastName)            { showStatus('Please enter your last name.');             lastNameInput.focus();  return false; }
    if (!gmail)               { showStatus('Please enter your Gmail account.');         gmailInput.focus();     return false; }
    if (!isValidGmail(gmail)) { showStatus('Please enter a valid Gmail address.');      gmailInput.focus();     return false; }
    if (!username)            { showStatus('Please choose a username.');                usernameInput.focus();  return false; }
    if (username.length < 4)  { showStatus('Username must be at least 4 characters.'); usernameInput.focus();  return false; }
    if (!password)            { showStatus('Please create a password.');               passwordInput.focus();  return false; }
    if (password.length < 6)  { showStatus('Password must be at least 6 characters.'); passwordInput.focus();  return false; }
    if (!confirm)             { showStatus('Please confirm your password.');            confirmInput.focus();   return false; }
    if (password !== confirm)  { showStatus('Passwords do not match.');                confirmInput.focus();   return false; }

    return true;
  }

  async function isDuplicate(field, value) {
    const snapshot = await getDocs(
      query(collection(db, 'Registered_Admin'), where(field, '==', value))
    );
    return !snapshot.empty;
  }

  async function handleRegister() {
    clearStatus();
    if (!validateForm()) return;

    const firstName  = firstNameInput.value.trim();
    const lastName   = lastNameInput.value.trim();
    const middleName = middleNameInput.value.trim();
    const gmail      = gmailInput.value.trim();
    const username   = usernameInput.value.trim();
    const password   = passwordInput.value;

    registerBtn.disabled    = true;
    registerBtn.textContent = 'Registering…';

    try {


      const lockSnapshot = await getDocs(
        query(collection(db, 'Registered_Admin'), limit(1))
      );
      if (!lockSnapshot.empty) {
        showStatus('Registration is no longer available.');
        setTimeout(() => window.location.replace('auth.login.html'), 1500);
        return;
      }



      
//   Douplicate name checking 



      if (await isDuplicate('username', username)) {
        showStatus('Username is already taken. Please choose another.');
        usernameInput.focus();
        return;
      }

     
      if (await isDuplicate('gmail', gmail)) {
        showStatus('This Gmail is already registered.');
        gmailInput.focus();
        return;
      }


      const docRef = await addDoc(collection(db, 'Registered_Admin'), {
        firstName:  firstName,
        lastName:   lastName,
        middleName: middleName,
        fullName:   `${firstName}${middleName ? ' ' + middleName : ''} ${lastName}`.trim(),
        gmail:      gmail,
        username:   username,
        password:   password,       
        role:       'admin',
        status:     'active',
        createdAt:  serverTimestamp(),
      });

      console.log('Registered_Admin document ID:', docRef.id);
      showStatus('Account created successfully! Redirecting to login…', 'success');

      setTimeout(function () {
        window.location.href = 'auth.login.html';
      }, 1800);

    } catch (err) {
      console.error('Firestore error:', err);
      showStatus('Registration failed: ' + err.message);
    } finally {
      registerBtn.disabled    = false;
      registerBtn.textContent = 'Register';
    }
  }


  registerBtn.addEventListener('click', handleRegister);

  [firstNameInput, lastNameInput, middleNameInput, gmailInput,
   usernameInput, passwordInput, confirmInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleRegister(); });
    el.addEventListener('input', clearStatus);
  });

})();