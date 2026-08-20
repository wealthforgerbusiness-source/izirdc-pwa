const express = require("express");
const router = express.Router();
const { db, admin } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");

// Appelé juste après la connexion Google côté client (première fois)
// Crée le doc user avec 3 jours d'essai gratuit s'il n'existe pas encore
router.post("/init", verifyAuth, async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.uid);
    const existing = await userRef.get();

    if (existing.exists) {
      return res.json({ status: "existing", user: existing.data() });
    }

    const now = admin.firestore.Timestamp.now();
    const trialEndsAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 3 * 24 * 60 * 60 * 1000 // 3 jours
    );

    const newUser = {
      email: req.userEmail,
      createdAt: now,
      trialEndsAt,
      subscriptionStatus: "trial", // trial | active | expired
      subscriptionExpiresAt: null,
      acceptedTerms: true,
      fcmTokens: [],
    };

    await userRef.set(newUser);
    return res.json({ status: "created", user: newUser });
  } catch (err) {
    console.error("Erreur /user/init:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Récupère le statut du compte (trial restant, abonnement, etc.)
router.get("/me", verifyAuth, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.uid).get();
    if (!doc.exists) return res.status(404).json({ error: "Compte introuvable" });
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Enregistre le token FCM pour recevoir les notifications push
router.post("/fcm-token", verifyAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token manquant" });

    await db.collection("users").doc(req.uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
    });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
