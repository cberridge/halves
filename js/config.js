// Paste your Firebase web app config here (Firebase console → Project settings → Your apps → Web app).
// These values are not secrets: access is controlled by Firebase Auth + firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyB56-00zbRTs2JP86gP_VKgmOHaeRzx9oE",
  authDomain: "halves-27d51.firebaseapp.com",
  projectId: "halves-27d51",
  storageBucket: "halves-27d51.firebasestorage.app",
  messagingSenderId: "110183822196",
  appId: "1:110183822196:web:2ae12934cce8bebd03f221"
};

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).includes('REPLACE_ME'));
