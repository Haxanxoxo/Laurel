/**
 * Firebase Configuration for Laurel Lodge Availability Calendar
 * ==============================================================
 *
 * This file initialises Firebase App, Firebase Authentication, and Cloud Firestore
 * using the CDN-loaded Firebase Compatibility / Modular SDK.
 *
 * Replace the placeholder values in `firebaseConfig` with your actual Firebase project
 * settings found in the Firebase Console:
 * Project Overview -> Project Settings -> General -> Your apps -> Web app.
 *
 * Prerequisites:
 *   The Firebase compatibility libraries must be loaded BEFORE this file:
 *   - https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js
 *   - https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js
 *   - https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Firebase Credentials – Replace with your Firebase Project config
  // ---------------------------------------------------------------------------
  const firebaseConfig = {
  apiKey: "AIzaSyDm2daOGSjlpuWNnt547kmrZ6f8_LdAqxk",
  authDomain: "laurel-lodge-availability.firebaseapp.com",
  projectId: "laurel-lodge-availability",
  storageBucket: "laurel-lodge-availability.firebasestorage.app",
  messagingSenderId: "609464060312",
  appId: "1:609464060312:web:cb7ff5ed2fcf63718503ed"
};

  // Check if Firebase SDK is loaded
  if (typeof window.firebase === 'undefined') {
    console.warn(
      '[firebase-config] Firebase SDK is not loaded. ' +
      'Please ensure the Firebase CDN scripts are included before this file.'
    );
    window.firebaseConfig = firebaseConfig;
    window.firebaseApp = null;
    window.firebaseAuth = null;
    window.firebaseDb = null;
    return;
  }

  // Initialize Firebase (guard against multiple initializations)
  let app;
  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
  } else {
    app = firebase.app();
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  // Expose instances globally
  window.firebaseConfig = firebaseConfig;
  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseDb = db;
})();

