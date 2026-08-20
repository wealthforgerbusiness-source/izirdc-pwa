const express = require("express");
const router = express.Router();
const { db, admin, messaging } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { checkSubscription } = require("../middleware/checkSubscription");

// Clé secrète simple pour protéger les routes admin (à mettre dans les env vars Render)
function verifyAdmin(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  next();
}

// Lecture du taux actuel (accessible à tout user abonné/en essai)
router.get("/rate", verifyAuth, checkSubscription, async (req, res) => {
  try {
    const doc = await db.collection("rates").doc("current").get();
    if (!doc.exists) {
      return res.json({ usdToCdf: 2800, updatedAt: null }); // valeur par défaut si rien n'est encore configuré
    }
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Conversion CDF <-> USD
router.post("/convert", verifyAuth, checkSubscription, async (req, res) => {
  try {
    const { amount, from } = req.body; // from: "USD" ou "CDF"
    if (!amount || !from) return res.status(400).json({ error: "Paramètres manquants" });

    const doc = await db.collection("rates").doc("current").get();
    const usdToCdf = doc.exists ? doc.data().usdToCdf : 2800;

    let result;
    if (from === "USD") {
      result = amount * usdToCdf;
    } else if (from === "CDF") {
      result = amount / usdToCdf;
    } else {
      return res.status(400).json({ error: "Devise invalide" });
    }

    res.json({ result: Math.round(result * 100) / 100, rate: usdToCdf });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Mise à jour du taux depuis ton dashboard admin - envoie une notif push à tous les users
router.post("/rate", verifyAdmin, async (req, res) => {
  try {
    const { usdToCdf } = req.body;
    if (!usdToCdf || usdToCdf <= 0) {
      return res.status(400).json({ error: "Taux invalide" });
    }

    await db.collection("rates").doc("current").set({
      usdToCdf,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Récupère tous les tokens FCM enregistrés pour notifier
    const usersSnap = await db.collection("users").get();
    const tokens = [];
    usersSnap.forEach((doc) => {
      const data = doc.data();
      if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
    });

    if (tokens.length > 0) {
      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "Le taux vient de changer 💱",
          body: `Nouveau taux : 1 USD = ${usdToCdf} CDF`,
        },
      });
    }

    res.json({ status: "ok", notifiedUsers: tokens.length });
  } catch (err) {
    console.error("Erreur POST /rate:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
