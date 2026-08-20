const { db } = require("../config/firebase");

// À utiliser APRÈS verifyAuth (a besoin de req.uid)
async function checkSubscription(req, res, next) {
  try {
    const userDoc = await db.collection("users").doc(req.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Compte introuvable" });
    }

    const user = userDoc.data();
    const now = Date.now();

    const trialActive =
      user.trialEndsAt && user.trialEndsAt.toMillis() > now;

    const subscriptionActive =
      user.subscriptionStatus === "active" &&
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt.toMillis() > now;

    if (trialActive || subscriptionActive) {
      req.userData = user;
      return next();
    }

    return res.status(402).json({
      error: "subscription_required",
      message: "Votre essai gratuit ou abonnement a expiré. Abonnez-vous pour continuer.",
    });
  } catch (err) {
    console.error("Erreur checkSubscription:", err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = { checkSubscription };
