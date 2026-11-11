/**
 * Availability API – Firebase Authentication & Cloud Firestore Integration
 * =========================================================================
 *
 * Provides CRUD helpers and authentication wrappers using Cloud Firestore and Firebase Auth.
 * Operates on the `bookings` collection in Firestore.
 *
 * Document Schema in `bookings`:
 *   - id: Auto-generated document ID (string)
 *   - start_date: "YYYY-MM-DD" (string, UTC)
 *   - end_date: "YYYY-MM-DD" (string, UTC)
 *   - created_at: Firestore serverTimestamp / Date string
 *
 * All public functions are exposed on `window.AvailabilityAPI`.
 * All date handling uses UTC to prevent timezone shifts across systems.
 */

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Check whether Firebase is initialized with real configured values.
   */
  function isConfigured() {
    return (
      window.firebaseDb &&
      window.firebaseConfig &&
      window.firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
      window.firebaseConfig.projectId !== 'YOUR_FIREBASE_PROJECT_ID'
    );
  }

  /**
   * Return Firestore database instance or throw if uninitialized.
   */
  function getDb() {
    if (!window.firebaseDb) {
      throw new Error(
        '[AvailabilityAPI] Cloud Firestore is not initialized. ' +
        'Ensure firebase-config.js is loaded and properly configured.'
      );
    }
    return window.firebaseDb;
  }

  /**
   * Return Firebase Auth instance or throw if uninitialized.
   */
  function getAuth() {
    if (!window.firebaseAuth) {
      throw new Error(
        '[AvailabilityAPI] Firebase Auth is not initialized. ' +
        'Ensure firebase-config.js is loaded and properly configured.'
      );
    }
    return window.firebaseAuth;
  }

  /**
   * Format a Date (or date string) as 'YYYY-MM-DD' using UTC components.
   */
  function formatDateUTC(date) {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse a 'YYYY-MM-DD' string into a UTC Date (midnight UTC).
   */
  function parseDateUTC(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // -----------------------------------------------------------------------
  // Booking Data Operations (Firestore)
  // -----------------------------------------------------------------------

  /**
   * Fetch all bookings overlapping [startDate, endDate].
   * An overlap occurs when: start_date <= endDate AND end_date >= startDate.
   *
   * @param {Date|string} startDate
   * @param {Date|string} endDate
   * @returns {Promise<Array<{id: string, start_date: string, end_date: string, created_at: any}>>}
   */
  async function fetchBookings(startDate, endDate) {
    if (!isConfigured()) {
      return [];
    }

    const db = getDb();
    const startStr = formatDateUTC(startDate);
    const endStr = formatDateUTC(endDate);

    try {
      // Query bookings whose start_date <= endStr
      const snapshot = await db.collection('bookings')
        .where('start_date', '<=', endStr)
        .get();

      const results = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Filter in memory for end_date >= startStr (avoids composite index requirement)
        if (data.end_date >= startStr) {
          results.push({
            id: doc.id,
            start_date: data.start_date,
            end_date: data.end_date,
            created_at: data.created_at ? (data.created_at.toDate ? data.created_at.toDate().toISOString() : data.created_at) : null
          });
        }
      });

      return results;
    } catch (err) {
      console.warn('[AvailabilityAPI] fetchBookings warning/error:', err.message);
      return [];
    }
  }

  /**
   * Create a new booking in Firestore (requires admin authentication).
   *
   * @param {Date|string} startDate
   * @param {Date|string} endDate
   * @returns {Promise<{id: string, start_date: string, end_date: string}>}
   */
  async function createBooking(startDate, endDate) {
    const db = getDb();
    const startStr = formatDateUTC(startDate);
    const endStr = formatDateUTC(endDate);

    if (endStr < startStr) {
      throw new Error('End date cannot precede start date.');
    }

    const newBooking = {
      start_date: startStr,
      end_date: endStr,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('bookings').add(newBooking);
    return {
      id: docRef.id,
      start_date: startStr,
      end_date: endStr
    };
  }

  /**
   * Delete a booking by Firestore document ID (requires admin authentication).
   *
   * @param {string} bookingId
   * @returns {Promise<boolean>}
   */
  async function deleteBooking(bookingId) {
    const db = getDb();
    await db.collection('bookings').doc(bookingId).delete();
    return true;
  }

  /**
   * Expand booking ranges within [startDate, endDate] into a Set of 'YYYY-MM-DD' strings.
   *
   * @param {Date|string} startDate
   * @param {Date|string} endDate
   * @returns {Promise<Set<string>>}
   */
  async function getBookedDatesSet(startDate, endDate) {
    const bookings = await fetchBookings(startDate, endDate);
    const rangeStart = parseDateUTC(formatDateUTC(startDate));
    const rangeEnd = parseDateUTC(formatDateUTC(endDate));
    const bookedDates = new Set();

    for (const booking of bookings) {
      let cursor = parseDateUTC(booking.start_date);
      const bookingEnd = parseDateUTC(booking.end_date);

      if (cursor < rangeStart) cursor = new Date(rangeStart.getTime());
      const clampedEnd = bookingEnd > rangeEnd ? rangeEnd : bookingEnd;

      while (cursor <= clampedEnd) {
        bookedDates.add(formatDateUTC(cursor));
        cursor = new Date(Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate() + 1
        ));
      }
    }

    return bookedDates;
  }

  // -----------------------------------------------------------------------
  // Authentication Wrappers (Firebase Auth)
  // -----------------------------------------------------------------------

  /**
   * Check whether an administrator is currently signed in.
   * @returns {Promise<boolean>}
   */
  async function isAuthenticated() {
    if (!isConfigured()) return false;
    const auth = getAuth();
    return new Promise(resolve => {
      const unsubscribe = auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user !== null);
      }, () => resolve(false));
    });
  }

  /**
   * Get the current authenticated user (or null).
   * @returns {Promise<object|null>}
   */
  async function getSession() {
    if (!isConfigured()) return null;
    const auth = getAuth();
    return new Promise(resolve => {
      const unsubscribe = auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user);
      }, () => resolve(null));
    });
  }

  /**
   * Sign in using Stephen's email and password.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} User credential
   */
  async function signIn(email, password) {
    const auth = getAuth();
    return await auth.signInWithEmailAndPassword(email, password);
  }

  /**
   * Sign out the current administrator.
   * @returns {Promise<void>}
   */
  async function signOut() {
    if (!isConfigured()) return;
    const auth = getAuth();
    await auth.signOut();
  }

  // -----------------------------------------------------------------------
  // Public Surface
  // -----------------------------------------------------------------------
  window.AvailabilityAPI = {
    isConfigured,
    fetchBookings,
    createBooking,
    deleteBooking,
    getBookedDatesSet,
    isAuthenticated,
    getSession,
    signIn,
    signOut
  };
})();
