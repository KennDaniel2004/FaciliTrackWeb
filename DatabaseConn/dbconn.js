

// Import Firebase SDKs via CDN (ES Module)
import { initializeApp }              from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import { getFirestore }               from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";
import { getAuth }                    from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { getAnalytics }               from "https://www.gstatic.com/firebasejs/11.7.1/firebase-analytics.js";

/* ---------- Firebase Configuration ---------- */
const firebaseConfig = {
  apiKey:            "AIzaSyAstx8iQgYFPrx1cpejdMu-PAC4UMBIDNc",
  authDomain:        "facilitrack2.firebaseapp.com",
  projectId:         "facilitrack2",
  storageBucket:     "facilitrack2.firebasestorage.app",
  messagingSenderId: "1033158293419",
  appId:             "1:1033158293419:web:bdf87e6f290a794d0c84ee",
  measurementId:     "G-YSCCZ89MC5"
};

/* ---------- Initialize Firebase ---------- */
const app       = initializeApp(firebaseConfig);
const db        = getFirestore(app);
const auth      = getAuth(app);
const analytics = getAnalytics(app);

/* ---------- Exports ---------- */
export { app, db, auth, analytics };