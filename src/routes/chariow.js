const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const { db, admin } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");

const SUBSCRIPTION_DAYS = 30;
const CHARIOW_API_BASE = "https://api.chariow.com/v1";

// ============================================================
// 1) CRÉATION DU CHECKOUT — appelé par le bouton "S'abonner" côté client
// ============================================================
// L'email utilisé est TOUJOURS celui du compte Firebase connecté (req.userEmail),
// jamais un champ libre tapé par l'utilisateur -> élimine le risque de faute de frappe.
router.post("/create-checkout", verifyAuth, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, phoneCountryCode } = req.body;

    if (!firstName || !lastName || !phoneNumber || !phoneCountryCode) {
      return res.status(400).json({
        error: "Prénom, nom et téléphone (numéro + indicatif pays) requis",
      });
    }

    const response = await axios.post(
      `${CHARIOW_API_BASE}/checkout`,
      {
        product_id: process.env.CHARIOW_LICENSE_PRODUCT_ID,
        email: req.userEmail, // email du compte IziRDC connecté - non modifiable par le client
        first_name: firstName,
        last_name: lastName,
        phone: {
          number: phoneNumber,
          country_code: phoneCountryCode,
        },
        // le uid est renvoyé tel quel dans le webhook Pulse -> matching fiable, pas juste par email
        custom_metadata: {
          izirdc_uid: req.uid,
        },
        redirect_url: `${process.env.APP_URL}/dashboard?subscription=success`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHARIOW_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = response.data.data;

    if (result.step === "payment") {
      return res.json({ checkoutUrl: result.payment.checkout_url });
    }

    if (result.step === "already_purchased") {
      // Ne devrait jamais arriver avec un produit Licence (achat répété toujours autorisé)
      return res.status(409).json({ error: "already_purchased" });
    }

    // step "completed" (produit gratuit) - non pertinent ici puisque le produit est payant
    return res.json({ status: result.step });
  } catch (err) {
    const chariowError = err.response?.data;
    console.error("Erreur création checkout Chariow:", chariowError || err.message);
    res.status(500).json({
      error: "Impossible de créer la session de paiement",
      details: chariowError?.message,
    });
  }
});

// ============================================================
// 2) WEBHOOK PULSE — reçoit "successful.sale" quand le paiement passe
// ============================================================

// Vérifie la signature HMAC-SHA256 sur le corps BRUT (voir server.js: req.rawBody)
function verifyPulseSignature(req) {
  const received = req.headers["x-chariow-signature"] || "";
  const secret = process.env.CHARIOW_PULSE_SECRET; // whsec_...

  if (!received.startsWith("sha256=") || !secret || !req.rawBody) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

// Dédoublonnage sur x-pulse-delivery-id (un même événement peut être réessayé jusqu'à 5 fois)
async function alreadyProcessed(deliveryId) {
  if (!deliveryId) return false; // les events de test n'ont pas cet en-tête, on les laisse passer
  const doc = await db.collection("processed_pulse_deliveries").doc(deliveryId).get();
  return doc.exists;
}

async function markProcessed(deliveryId) {
  if (!deliveryId) return;
  await db.collection("processed_pulse_deliveries").doc(deliveryId).set({
    processedAt: admin.firestore.Timestamp.now(),
  });
}

router.post("/webhook", async (req, res) => {
  try {
    if (!verifyPulseSignature(req)) {
      console.warn("Pulse Chariow: signature invalide, requête rejetée");
      return res.status(401).send("Invalid signature");
    }

    const deliveryId = req.headers["x-pulse-delivery-id"];

    if (await alreadyProcessed(deliveryId)) {
      // Déjà traité lors d'un essai précédent -> on confirme sans retraiter
      return res.status(200).send("OK");
    }

    // On répond 200 tout de suite (bonne pratique Chariow), puis on traite
    res.status(200).send("OK");

    const payload = JSON.parse(req.rawBody.toString("utf8"));
    const event = payload.event;

    if (event === "successful.sale") {
      await handleSuccessfulSale(payload.sale);
    }
    // Les événements license.* ne sont pas utilisés ici (on utilise la Licence
    // uniquement pour autoriser le rachat répété, pas ses fonctionnalités d'activation)

    await markProcessed(deliveryId);
  } catch (err) {
    console.error("Erreur traitement webhook Chariow:", err.message);
    // La réponse 200 a déjà été envoyée, on log seulement
  }
});

async function handleSuccessfulSale(sale) {
  const uid = sale.custom_metadata?.izirdc_uid;

  let userRef = null;

  if (uid) {
    // Matching fiable par uid (méthode principale)
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) userRef = doc.ref;
  }

  if (!userRef) {
    // Repli : matching par email si jamais le metadata est absent (event de test manuel, etc.)
    const email = (sale.customer_email || "").toLowerCase().trim();
    if (!email) {
      console.warn("Pulse successful.sale: ni uid ni email exploitable, ignoré");
      return;
    }
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (snap.empty) {
      console.warn(`Pulse successful.sale: aucun compte IziRDC trouvé pour ${email}`);
      return;
    }
    userRef = snap.docs[0].ref;
  }

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000
  );

  await userRef.update({
    subscriptionStatus: "active",
    subscriptionExpiresAt: expiresAt,
    lastPaymentAt: now,
    lastSaleId: sale.id,
  });

  console.log(`Abonnement activé pour uid=${userRef.id}, vente ${sale.id}`);
}

module.exports = router;
