require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { messaging, db, admin } = require("./src/config/firebase");
const userRoutes = require("./src/routes/user");
const chariowRoutes = require("./src/routes/chariow");
const { router: newsRoutes, refreshNewsCache } = require("./src/routes/news");
const currencyRoutes = require("./src/routes/currency");
const expensesRoutes = require("./src/routes/expenses");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// IMPORTANT: pour le webhook Chariow on a besoin du body BRUT pour vérifier la signature HMAC.
// On le capture ici avant que express.json() ne le parse.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Sert le frontend statique (index.html, admin.html, manifest.json, service-worker.js, js/, images/)
app.use(express.static("public"));

// Routes
app.use("/api/user", userRoutes);
app.use("/api/chariow", chariowRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/currency", currencyRoutes);
app.use("/api/expenses", expensesRoutes);

// Middleware simple pour protéger les routes admin (même clé que /notify)
function requireAdminKey(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  next();
}

const SUBSCRIPTION_PRICE_USD = 5; // garde en phase avec chariow.js si le prix change un jour

// Stats globales pour le dashboard admin (MRR, users, essais, etc.)
app.get("/api/admin/stats", requireAdminKey, async (req, res) => {
  try {
    const now = Date.now();
    const usersSnap = await db.collection("users").get();

    let totalUsers = 0;
    let activeSubscribers = 0;
    let trialUsers = 0;
    let expiredUsers = 0;
    let newSignups7d = 0;
    let newSignups30d = 0;

    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    usersSnap.forEach((doc) => {
      const u = doc.data();
      totalUsers++;

      const expiresAtMs = u.subscriptionExpiresAt ? u.subscriptionExpiresAt.toMillis() : 0;
      const trialEndsAtMs = u.trialEndsAt ? u.trialEndsAt.toMillis() : 0;
      const createdAtMs = u.createdAt ? u.createdAt.toMillis() : 0;

      if (u.subscriptionStatus === "active" && expiresAtMs > now) {
        activeSubscribers++;
      } else if (u.subscriptionStatus === "trial" && trialEndsAtMs > now) {
        trialUsers++;
      } else {
        expiredUsers++;
      }

      if (createdAtMs >= sevenDaysAgo) newSignups7d++;
      if (createdAtMs >= thirtyDaysAgo) newSignups30d++;
    });

    const mrr = activeSubscribers * SUBSCRIPTION_PRICE_USD;

    res.json({
      totalUsers,
      activeSubscribers,
      trialUsers,
      expiredUsers,
      mrr,
      arr: mrr * 12,
      newSignups7d,
      newSignups30d,
      conversionRate: totalUsers > 0 ? Number(((activeSubscribers / totalUsers) * 100).toFixed(1)) : 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Erreur /admin/stats:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Notification manuelle depuis ton dashboard admin (annonce générale, actu importante, etc.)
app.post("/api/admin/notify", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ error: "Titre et message requis" });
    const usersSnap = await db.collection("users").get();
    const tokens = [];
    usersSnap.forEach((doc) => {
      const data = doc.data();
      if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
    });
    if (tokens.length === 0) {
      return res.json({ status: "ok", notifiedUsers: 0 });
    }
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
    });
    res.json({ status: "ok", notifiedUsers: tokens.length, success: result.successCount });
  } catch (err) {
    console.error("Erreur /admin/notify:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Note : express.static intercepte déjà GET "/" en servant public/index.html,
// donc cette route JSON ne répond plus que si public/index.html est absent.
app.get("/", (req, res) => {
  res.json({ status: "IziRDC API en ligne 🇨🇩" });
});

// Rafraîchit le cache news toutes les 2 heures
cron.schedule("0 */2 * * *", () => {
  console.log("Cron: rafraîchissement des news...");
  refreshNewsCache().catch((err) => console.error("Erreur cron news:", err.message));
});

app.listen(PORT, () => {
  console.log(`IziRDC API démarrée sur le port ${PORT}`);
  // Premier chargement du cache news au démarrage
  refreshNewsCache().catch((err) => console.error("Erreur chargement initial news:", err.message));
});
