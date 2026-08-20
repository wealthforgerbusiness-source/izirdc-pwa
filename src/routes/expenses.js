const express = require("express");
const router = express.Router();
const { db, admin } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { checkSubscription } = require("../middleware/checkSubscription");

// Ajouter une dépense
router.post("/", verifyAuth, checkSubscription, async (req, res) => {
  try {
    const { amount, category, note, currency } = req.body;
    if (!amount || !category) {
      return res.status(400).json({ error: "Montant et catégorie requis" });
    }

    const expense = {
      amount: Number(amount),
      currency: currency || "USD", // USD ou CDF
      category,
      note: note || "",
      createdAt: admin.firestore.Timestamp.now(),
    };

    const ref = await db
      .collection("users")
      .doc(req.uid)
      .collection("expenses")
      .add(expense);

    res.json({ id: ref.id, ...expense });
  } catch (err) {
    console.error("Erreur POST /expenses:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Liste des dépenses (avec filtre optionnel par période)
router.get("/", verifyAuth, checkSubscription, async (req, res) => {
  try {
    const snap = await db
      .collection("users")
      .doc(req.uid)
      .collection("expenses")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Agrégation pour le dashboard : totaux par jour / semaine / mois
router.get("/summary", verifyAuth, checkSubscription, async (req, res) => {
  try {
    const snap = await db
      .collection("users")
      .doc(req.uid)
      .collection("expenses")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    const expenses = snap.docs.map((d) => d.data());
    const now = new Date();

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sumSince = (date) =>
      expenses
        .filter((e) => e.createdAt.toDate() >= date)
        .reduce((sum, e) => sum + e.amount, 0);

    // Regroupement par catégorie pour le graphique
    const byCategory = {};
    expenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    res.json({
      today: sumSince(startOfDay),
      week: sumSince(startOfWeek),
      month: sumSince(startOfMonth),
      byCategory,
    });
  } catch (err) {
    console.error("Erreur GET /expenses/summary:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Supprimer une dépense
router.delete("/:id", verifyAuth, checkSubscription, async (req, res) => {
  try {
    await db
      .collection("users")
      .doc(req.uid)
      .collection("expenses")
      .doc(req.params.id)
      .delete();
    res.json({ status: "deleted" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
