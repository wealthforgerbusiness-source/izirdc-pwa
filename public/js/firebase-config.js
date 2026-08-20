// ============================================================
// CONFIG FIREBASE WEB (frontend) — safe à commiter sur GitHub.
// ============================================================
// Ces valeurs ne sont PAS des secrets : Firebase les protège via
// les règles de sécurité Firestore/Auth, pas en les cachant.

const firebaseConfig = {
  apiKey: "AIzaSyBu-2Fu2NXzfXN8gdIL7nYV_UgNMOJBw7k",
  authDomain: "izirdc-1d5ce.firebaseapp.com",
  projectId: "izirdc-1d5ce",
  storageBucket: "izirdc-1d5ce.firebasestorage.app",
  messagingSenderId: "280213311410",
  appId: "1:280213311410:web:e5c8f34982d2faab7f5eab",
};

firebase.initializeApp(firebaseConfig);
