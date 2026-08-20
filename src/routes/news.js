const express = require("express");
const router = express.Router();
const axios = require("axios");
const Parser = require("rss-parser");
const { db, admin } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { checkSubscription } = require("../middleware/checkSubscription");

const parser = new Parser();

const KEYWORDS = ["RDC", "Congo", "Kinshasa", "Katanga", "Lubumbashi", "Goma", "Tshisekedi"];

// Flux RSS de médias congolais connus - à compléter/ajuster selon ce qui fonctionne
const RSS_SOURCES = [
  { name: "Actualite.cd", url: "https://actualite.cd/feed" },
  { name: "7sur7.cd", url: "https://7sur7.cd/rss" },
];

function matchesRDC(text = "") {
  const lower = text.toLowerCase();
  return KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

async function fetchFromNewsAPI() {
  if (!process.env.NEWSAPI_KEY) return [];
  try {
    const { data } = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: "RDC OR Congo-Kinshasa OR Kinshasa",
        language: "fr",
        sortBy: "publishedAt",
        pageSize: 20,
        apiKey: process.env.NEWSAPI_KEY,
      },
    });
    return (data.articles || []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source?.name || "NewsAPI",
      image: a.urlToImage || null,
      publishedAt: a.publishedAt,
    }));
  } catch (err) {
    console.error("Erreur NewsAPI:", err.message);
    return [];
  }
}

async function fetchFromRSS() {
  let results = [];
  for (const source of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = (feed.items || [])
        .filter((item) => matchesRDC(item.title + " " + (item.contentSnippet || "")))
        .slice(0, 15)
        .map((item) => ({
          title: item.title,
          url: item.link,
          source: source.name,
          image: item.enclosure?.url || null,
          publishedAt: item.isoDate || item.pubDate,
        }));
      results = results.concat(items);
    } catch (err) {
      console.error(`Erreur RSS ${source.name}:`, err.message);
    }
  }
  return results;
}

// Appelé par le cron (voir server.js) - rafraîchit le cache Firestore
async function refreshNewsCache() {
  const [apiNews, rssNews] = await Promise.all([fetchFromNewsAPI(), fetchFromRSS()]);

  const combined = [...apiNews, ...rssNews]
    .filter((item) => item.title && item.url)
    .filter((item, index, arr) => arr.findIndex((x) => x.url === item.url) === index) // dédoublonnage
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 50);

  const batch = db.batch();
  const newsRef = db.collection("news_cache").doc("latest");
  batch.set(newsRef, {
    items: combined,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  await batch.commit();

  console.log(`Cache news mis à jour: ${combined.length} articles`);
  return combined;
}

// Route consultée par le client - lit simplement le cache (rapide, pas d'appel API à chaque requête)
router.get("/", verifyAuth, checkSubscription, async (req, res) => {
  try {
    const doc = await db.collection("news_cache").doc("latest").get();
    if (!doc.exists) {
      const items = await refreshNewsCache();
      return res.json({ items });
    }
    res.json(doc.data());
  } catch (err) {
    console.error("Erreur GET /news:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = { router, refreshNewsCache };
