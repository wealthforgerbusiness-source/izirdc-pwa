// Exemple d'intégration du paiement Chariow côté client.
// À adapter dans ta vraie UI (React, HTML pur, etc.) une fois le frontend démarré.
//
// Flow :
// 1. L'utilisateur clique "S'abonner - $5/mois"
// 2. On affiche un petit formulaire (prénom, nom, téléphone) — PAS l'email, il est déjà connu
// 3. On appelle notre backend /api/chariow/create-checkout (avec le token Firebase)
// 4. On ouvre l'URL retournée dans un nouvel onglet/popup (page de paiement Chariow)

async function startSubscriptionCheckout({ firstName, lastName, phoneNumber, phoneCountryCode }) {
  const user = firebase.auth().currentUser;
  if (!user) {
    alert("Vous devez être connecté.");
    return;
  }

  const idToken = await user.getIdToken();

  const response = await fetch("/api/chariow/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ firstName, lastName, phoneNumber, phoneCountryCode }),
  });

  const data = await response.json();

  if (!response.ok) {
    alert("Erreur : " + (data.error || "impossible de démarrer le paiement"));
    return;
  }

  // Ouvre la page de paiement sécurisée Chariow dans un nouvel onglet.
  // (Un iframe/popup modal ne fonctionne pas ici : la page de paiement de Chariow
  // n'autorise pas l'affichage en iframe pour des raisons de sécurité.)
  window.open(data.checkoutUrl, "_blank");
}

// Exemple de rendu du petit formulaire avec l'avertissement en rouge sur l'email
// (l'email lui-même n'est PAS un champ du formulaire : il est pris automatiquement
// depuis le compte connecté, donc aucune erreur de frappe possible)
function renderSubscribeForm(containerEl, userEmail) {
  containerEl.innerHTML = `
    <p style="color:red;font-weight:bold;">
      Votre abonnement sera lié à l'email de votre compte IziRDC : ${userEmail}.
      En cas d'erreur d'email de votre part, le réabonnement ne sera pas reconnu
      et IziRDC ne pourra pas être tenu responsable.
    </p>
    <input id="firstName" placeholder="Prénom" />
    <input id="lastName" placeholder="Nom" />
    <input id="phoneNumber" placeholder="Numéro de téléphone" />
    <input id="phoneCountryCode" placeholder="Code pays (ex: CD, FR)" />
    <button id="subscribeBtn">S'abonner - $5/mois</button>
  `;

  containerEl.querySelector("#subscribeBtn").addEventListener("click", () => {
    startSubscriptionCheckout({
      firstName: containerEl.querySelector("#firstName").value,
      lastName: containerEl.querySelector("#lastName").value,
      phoneNumber: containerEl.querySelector("#phoneNumber").value,
      phoneCountryCode: containerEl.querySelector("#phoneCountryCode").value,
    });
  });
}
