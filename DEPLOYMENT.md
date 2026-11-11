# Laurel Lodge – Firebase Deployment & Configuration Guide

This guide details how to set up **Google Firebase (Cloud Firestore & Firebase Authentication)** for the Laurel Lodge availability calendar and private administration system.

Using Firebase eliminates project pausing (unlike free Supabase instances that pause after periods of inactivity), ensuring the calendar remains perpetually active for guests and Stephen.

---

## Table of Contents

1. [Create Firebase Project](#1-create-firebase-project)
2. [Enable Firebase Authentication (Email/Password)](#2-enable-firebase-authentication)
3. [Create Stephen's Administrator Account](#3-create-stephens-administrator-account)
4. [Set Up Cloud Firestore](#4-set-up-cloud-firestore)
5. [Apply Firestore Security Rules](#5-apply-firestore-security-rules)
6. [Update Website Configuration](#6-update-website-configuration)
7. [Verify the Entire Workflow](#7-verify-the-entire-workflow)
8. [Production Deployment Checklist](#8-production-deployment-checklist)

---

## 1. Create Firebase Project

1. Visit the [Firebase Console](https://console.firebase.google.com/) and log in with your Google account.
2. Click **Add project** (or **Create a project**).
3. Name your project (e.g., `laurel-lodge-availability`).
4. Disable Google Analytics (optional, not required for this calendar) and click **Create project**.
5. Once your project is created, click the **Web icon (`</>`)** on the Project Overview page to register a Web App:
   - App nickname: `Laurel Lodge Web`
   - Leave "Firebase Hosting" unchecked for now (or enable if deploying to Firebase Hosting).
   - Click **Register app**.
6. Firebase will display your `firebaseConfig` snippet containing `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`. Keep this tab open or copy these values.

---

## 2. Enable Firebase Authentication

1. In the Firebase Console left-hand sidebar, navigate to **Build -> Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, click **Email/Password**.
4. Enable the first toggle: **Email/Password**.
5. Keep "Email link (passwordless sign-in)" disabled.
6. Click **Save**.

---

## 3. Create Stephen's Administrator Account

1. Still inside **Authentication**, switch to the **Users** tab.
2. Click **Add user**.
3. Enter Stephen's administrator email (e.g., `stephen@laurellodge.uk` or his preferred management email) and choose a secure password.
4. Click **Add user**.

Stephen will use this email and password to log in at `https://laurellodge.uk/admin/`.

---

## 4. Set Up Cloud Firestore

1. In the left-hand sidebar, navigate to **Build -> Firestore Database**.
2. Click **Create database**.
3. Choose a location closest to the UK (e.g., `eur3 (europe-west)` or `europe-west2 (London)`).
4. When prompted for security rules, choose **Start in production mode** (or test mode; we will paste the explicit rules in the next step).
5. Click **Create** and wait for database initialization.

---

## 5. Apply Firestore Security Rules

1. In **Firestore Database**, click the **Rules** tab at the top.
2. Replace all existing text with the exact contents of [`firestore.rules`](firestore.rules):

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Laurel Lodge Bookings Collection
    match /bookings/{bookingId} {

      // Anyone (public visitors) can read booking dates
      allow read: if true;

      // Only authenticated users (Stephen) can create new bookings
      allow create: if request.auth != null
                    && request.resource.data.start_date is string
                    && request.resource.data.end_date is string
                    && request.resource.data.end_date >= request.resource.data.start_date;

      // Only authenticated users can modify existing bookings
      allow update: if request.auth != null
                    && request.resource.data.start_date is string
                    && request.resource.data.end_date is string
                    && request.resource.data.end_date >= request.resource.data.start_date;

      // Only authenticated users can delete bookings
      allow delete: if request.auth != null;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**.

### Security Highlights
- **Public Protection**: Anonymous visitors have read-only access strictly to the `bookings` collection.
- **Administrative Lock**: Creation, alteration, and deletion requests from unauthenticated clients are rejected directly by Firestore's cloud rules engine, regardless of any frontend code.

---

## 6. Update Website Configuration

Open `assets/js/firebase-config.js` in your text editor and replace the placeholder keys with the values from your Firebase project:

```javascript
  const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "laurel-lodge-availability.firebaseapp.com",
    projectId: "laurel-lodge-availability",
    storageBucket: "laurel-lodge-availability.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef..."
  };
```

Save the file.

---

## 7. Verify the Entire Workflow

1. **Stephen Logs In**:
   - Navigate to `/admin/` (or `admin/index.html` locally).
   - Enter Stephen's email and password. Click **Sign In**.
   - The system validates credentials via Firebase Auth and redirects to `/admin/dashboard.html`.

2. **Selecting and Booking Dates**:
   - In the admin calendar, click a start date and shift-click an end date (or use the mobile "Range Selection Mode" toggle).
   - Click **Mark as Booked**.
   - A confirmation modal details the selected date range. Click **Confirm**.
   - The document is saved directly into Cloud Firestore under `bookings`.
   - The admin calendar instantly displays the date with a **red date number** and a **red cross indicator (&#10005;)**.

3. **Public Calendar Check**:
   - Open `/availability.html` in another browser window or incognito tab.
   - The booked date range immediately displays with a **red date number** and a **red cross (&#10005;)**.
   - Available dates remain standard and clean.
   - The legend displays the visual distinction.

4. **Reversing a Booking**:
   - Return to `/admin/dashboard.html`.
   - Click the booked date or date range.
   - Click **Make Available Again**.
   - Confirm the removal in the modal.
   - The Firestore document is deleted. Both the admin dashboard and public calendar refresh to show those dates as available.

---

## 8. Production Deployment Checklist

- [x] All Supabase scripts and references completely removed.
- [x] Firebase compatibility SDK loaded cleanly via Google CDN (`firebase-app`, `firebase-auth`, `firebase-firestore`).
- [x] Booked dates clearly indicated with red numbers and visible red crosses (&#10005;) without overlapping.
- [x] Clear legend explaining both available and booked date indicators.
- [x] Date handling strictly normalized to UTC (`Date.UTC`) to prevent timezone date shifts.
- [x] Navigation bar links on all pages retain identical order and styling.
- [x] Existing booking PDF (`booking_form_1.pdf`) remains functional.
- [ ] Add your live website domain (e.g. `laurellodge.uk`) to **Firebase Console -> Authentication -> Settings -> Authorized domains**.
