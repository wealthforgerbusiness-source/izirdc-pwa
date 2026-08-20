const { auth } = require("../config/firebase");

// Vérifie le token Firebase envoyé dans le header Authorization: Bearer <token>
async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split("Bearer ")[1]
      : null;

    if (!token) {
      return res.status(401).json({ error: "Token manquant" });
    }

    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    console.error("Erreur vérification token:", err.message);
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

module.exports = { verifyAuth };
