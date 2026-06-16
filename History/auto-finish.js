// ============================================================
// auto-finish.js  —  Automatic Status Update for Finished Schedules
// Runs as a background service to check and update finished events
// ============================================================

import { 
  db, 
  COLLECTIONS,
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  where
} from "../DatabaseConn/dbconn.js";

// Configuration
const CHECK_INTERVAL = 60000; // Check every minute (60000 ms)
let isRunning = false;
let intervalId = null;

/**
 * Check if an event is finished based on date and end time
 */
function isEventFinished(dateStr, endTimeStr) {
  if (!dateStr) return false;
  
  try {
    let year, month, day;
    
    // Handle "Month Day, Year" format (e.g., "June 16, 2026")
    const longDateMatch = String(dateStr).match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (longDateMatch) {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                          'july', 'august', 'september', 'october', 'november', 'december'];
      month = monthNames.indexOf(longDateMatch[1].toLowerCase()) + 1;
      day = parseInt(longDateMatch[2], 10);
      year = parseInt(longDateMatch[3], 10);
    } 
    // Handle "YYYY-MM-DD" format
    else if (String(dateStr).includes('-')) {
      [year, month, day] = String(dateStr).split('-').map(Number);
    } 
    else {
      return false;
    }
    
    if (!year || !month || !day) return false;
    
    let endHour = 23, endMin = 59;
    
    if (endTimeStr) {
      const clean = String(endTimeStr).trim().toUpperCase();
      const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const period = match[3];
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        endHour = h;
        endMin = m;
      }
    }
    
    const eventEnd = new Date(year, month - 1, day, endHour, endMin, 0);
    const now = new Date();
    
    return now > eventEnd;
  } catch (error) {
    console.error('Error checking event finish status:', error);
    return false;
  }
}

/**
 * Update a single request to Finished status
 */
async function updateToFinished(request) {
  try {
    const requestRef = doc(db, COLLECTIONS.REQUESTS, request.id);
    
    await updateDoc(requestRef, {
      status: 'Finished',
      finishedAt: serverTimestamp(),
      autoFinished: true,
      autoFinishedAt: new Date().toISOString()
    });
    
    // Also copy to completed_schedules
    const completedRef = doc(db, 'completed_schedules', request.id);
    await setDoc(completedRef, {
      ...request,
      status: 'Finished',
      finishedAt: serverTimestamp(),
      sourceRequestId: request.id,
      movedAt: serverTimestamp(),
      autoFinished: true
    }, { merge: true });
    
    console.log(`✅ Auto-finished: ${request.fullname} - ${request.event} (${request.id})`);
    return true;
  } catch (error) {
    console.error(`Failed to auto-finish request ${request.id}:`, error);
    return false;
  }
}

/**
 * Check all Approved requests and update those that are finished
 */
async function checkAndUpdateFinishedRequests() {
  if (isRunning) {
    console.log('Auto-finish check already running, skipping...');
    return;
  }
  
  isRunning = true;
  
  try {
    console.log('🔍 Checking for finished events...', new Date().toLocaleString());
    
    // Get all requests with status 'Approved' (not finished yet)
    const q = query(collection(db, COLLECTIONS.REQUESTS));
    const snap = await getDocs(q);
    
    const finishedRequests = [];
    
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      
      // Skip if already finished or archived
      if (data.status === 'Finished' || data.archived === true) {
        continue;
      }
      
      // Only process Approved or Rescheduled events that might be finished
      if (data.status === 'Approved' || data.status === 'Rescheduled') {
        const isFinished = isEventFinished(data.date, data.endTime || data.endtime || data.end_time || data.timeEnd || data.timeend);
        
        if (isFinished) {
          finishedRequests.push({
            id: docSnap.id,
            ...data
          });
        }
      }
    }
    
    if (finishedRequests.length > 0) {
      console.log(`Found ${finishedRequests.length} finished event(s) to update`);
      
      // Update each finished request
      for (const request of finishedRequests) {
        await updateToFinished(request);
      }
      
      console.log(`✅ Successfully updated ${finishedRequests.length} request(s) to Finished`);
    } else {
      console.log('No finished events found at this time');
    }
    
  } catch (error) {
    console.error('Error in auto-finish check:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the automatic finish checker
 */
export function startAutoFinishChecker() {
  if (intervalId) {
    console.log('Auto-finish checker is already running');
    return;
  }
  
  console.log('🚀 Starting auto-finish checker service...');
  
  // Run immediately on start
  checkAndUpdateFinishedRequests();
  
  // Then run at regular intervals
  intervalId = setInterval(checkAndUpdateFinishedRequests, CHECK_INTERVAL);
}

/**
 * Stop the automatic finish checker
 */
export function stopAutoFinishChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 Auto-finish checker stopped');
  }
}

/**
 * Manually trigger a check (useful for testing or on-demand)
 */
export async function manualCheckAndUpdate() {
  console.log('Manual check triggered');
  await checkAndUpdateFinishedRequests();
}

// Auto-start when this module is imported (for background service)
if (typeof window !== 'undefined') {
  // Start the checker when the page loads
  startAutoFinishChecker();
  
  // Optional: Stop checker when page unloads
  window.addEventListener('beforeunload', () => {
    stopAutoFinishChecker();
  });
}