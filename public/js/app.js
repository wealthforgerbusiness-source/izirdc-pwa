// ============================================================
// Logique principale du frontend : connexion Google + affichage
// ============================================================
// Dépend de : firebase-app-compat.js, firebase-auth-compat.js,
// firebase-config.js (chargés avant ce fichier dans index.html).

const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfoEl = document.getElementById("userInfo");
const appContentEl = document.getElementById("appContent");
const authScreenEl = document.getElementById("authScreen");

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (err) {
      console.error("Erreur connexion Google:", err);
      alert("Connexion impossible : " + err.message);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => auth.signOut());
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    authScreenEl.style.display = "none";
    appContentEl.style.display = "block";
    userInfoEl.textContent = `Connecté : ${user.email}`;

    try {
      const idToken = await user.getIdToken();

      await fetch("/api/user/init", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const res = await fetch("/api/user/me", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Profil utilisateur backend:", data);
      }
    } catch (err) {
      console.error("Erreur appel API backend:", err);
    }
  } else {
    authScreenEl.style.display = "block";
    appContentEl.style.display = "none";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => console.error("Erreur service worker:", err));
  });
}
