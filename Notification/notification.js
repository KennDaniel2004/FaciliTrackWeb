/* ============================================================
   notification.js
   FaciliTrack – Web Admin Notification Helper
   
   PURPOSE: Writes notification documents to Firestore so the
   mobile app's Firestore real-time listener picks them up and
   shows an in-app / system notification to the user.
   
   Called from request.js after approve / reject actions.
   ============================================================ */

import { db, COLLECTIONS } from "../DatabaseConn/dbconn.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

/**
 * createNotificationForRequest
 *
 * Writes one document to the root "Notification" collection.
 * The mobile app listens to this collection filtered by userId + read==false,
 * so it will detect the new document immediately while the app is open (foreground).
 *
 * @param {string} userId    - The mobile user's ID (matches Firestore userId field)
 * @param {string} title     - Notification title  e.g. "Request Approved"
 * @param {string} body      - Notification body   e.g. "Your request has been approved."
 * @param {object} extra     - Additional fields: { type, requestId, status, rejectedReason }
 * @returns {string|null}    - The new notification document ID, or null on error
 */
export async function createNotificationForRequest(userId, title, body, extra = {}) {
  try {
    if (!userId) {
      console.warn("[Notification] createNotificationForRequest: userId is empty — skipping");
      return null;
    }

    // Build the notification document payload.
    // Field names must match exactly what the Android app reads:
    //   title, body, status, requestId, userId, read, createdAt
    const payload = {
      userId:         userId,
      title:          title  || "FaciliTrack Update",
      body:           body   || "You have a new notification",
      status:         extra.status         || "",
      type:           extra.type           || "request_update",
      requestId:      extra.requestId      || "",
      rejectedReason: extra.rejectedReason || "",
      read:           false,                // mobile marks true when user opens bell
      createdAt:      serverTimestamp(),
    };

    // 1️⃣  Write to root "Notification" collection
    //     NotificationDisplayService listens here with:
    //       .whereEqualTo("userId", currentUserId)
    //       .whereEqualTo("read", false)
    const notifRef  = doc(collection(db, "Notification"));
    const notifId   = notifRef.id;
    await setDoc(notifRef, { ...payload, notificationId: notifId });

    console.log("[Notification] ✅ Written to Notification collection:", notifId);

    // 2️⃣  Also write under Registered_User/{userId}/Notification (subcollection)
    //     BadgeManager and NotificationController also query the root collection,
    //     but this keeps per-user history clean for any future subcollection queries.
    try {
      await addDoc(
        collection(db, COLLECTIONS.REGISTERED_USERS, userId, "Notification"),
        { ...payload, notificationId: notifId }
      );
      console.log("[Notification] ✅ Also written to Registered_User subcollection");
    } catch (subErr) {
      // Non-fatal — root collection write already succeeded
      console.warn("[Notification] Subcollection write failed (non-fatal):", subErr.message);
    }

    return notifId;

  } catch (err) {
    console.error("[Notification] ❌ createNotificationForRequest error:", err);
    return null;
  }
}