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

// Routes
app.use("/api/user", userRoutes);
app.use("/api/chariow", chariowRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/currency", currencyRoutes);
app.use("/api/expenses", expensesRoutes);

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
