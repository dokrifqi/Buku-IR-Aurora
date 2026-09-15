// ISI dengan config dari Firebase Console kamu sendiri.
// Cara dapatnya: console.firebase.google.com -> buat project baru (gratis) ->
// klik ikon "</>" (Web app) -> kasih nama -> copy config yang muncul ke sini.
//
// Setelah itu, di menu Firestore Database -> buat database -> pilih "test mode"
// dulu (biar cepat), lalu di tab Rules pakai aturan dari FIRESTORE_SETUP.md
// yang saya sertakan di paket ini.

window.FIREBASE_CONFIG = {
  apiKey: "GANTI_DENGAN_API_KEY_KAMU",
  authDomain: "GANTI.firebaseapp.com",
  projectId: "GANTI_PROJECT_ID",
  storageBucket: "GANTI.appspot.com",
  messagingSenderId: "GANTI_SENDER_ID",
  appId: "GANTI_APP_ID"
};

// Set ke true otomatis oleh app.js kalau config di atas sudah diisi.
window.FIREBASE_READY = window.FIREBASE_CONFIG.apiKey !== "GANTI_DENGAN_API_KEY_KAMU";
