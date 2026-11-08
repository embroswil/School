// utils/langue.js
// Traduction en anglais des notifications, alertes et emails envoyes par le serveur,
// pour les utilisateurs qui ont choisi l'anglais (colonne users.langue).
const TITRES = {
  "Absence d’un enseignant": "Teacher absence",
  "Absence signalée": "Absence reported",
  "Demande de rattachement d’un parent": "Parent link request",
  "Décision sur votre paiement": "Decision on your payment",
  "Litige de paiement à arbitrer": "Payment dispute to arbitrate",
  "Litige ouvert par un parent": "Dispute opened by a parent",
  "Nouveau message": "New message",
  "Nouvel enseignant à valider": "New teacher to approve",
  "Paiement confirmé": "Payment confirmed",
  "Paiement contesté": "Payment disputed",
  "Paiement de l’abonnement confirmé": "Subscription payment confirmed",
  "Paiement de l’abonnement non retrouvé": "Subscription payment not found",
  "Paiement de scolarité": "School fee payment",
  "Paiement d’abonnement à confirmer": "Subscription payment to confirm",
  "Paiement en attente de votre confirmation": "Payment awaiting your confirmation",
  "Paiement non reconnu": "Payment not recognised",
  "Paiement reçu": "Payment received",
  "Paiement à confirmer": "Payment to confirm",
  "Professeur principal": "Class teacher",
  "Rappel : frais de scolarité": "Reminder: school fees",
  "Réponse de l'établissement": "Reply from the school",
  "Rattachement accepté": "Link approved",
  "Rattachement refusé": "Link refused",
  "Abonnement School : échéance dans un mois": "School subscription: due in one month",
  "Abonnement School : échéance dans 15 jours": "School subscription: due in 15 days",
  "Abonnement School : échéance dans 7 jours": "School subscription: due in 7 days",
  "Abonnement School : échéance aujourd’hui": "School subscription: due today",
  "Abonnement School en retard": "School subscription overdue",
  "Établissement en lecture seule": "School in read-only mode",
  "Compte validé": "Account approved",
  "Compte refusé": "Account refused",
}
// Debuts de titres variables
const DEBUTS = [
  [/^Nouvelle note : (.+)$/, "New mark: $1"],
  [/^Devoir de (.+)$/, "Homework: $1"],
  [/^Décision sur le paiement (.+)$/, "Decision on payment $1"],
  [/^Message sur (?:le|votre) paiement (.+)$/, "Message about payment $1"],
  [/^Annonce : (.+)$/, "Announcement: $1"],
  [/^Événement : (.+)$/, "Event: $1"],
  [/^Résultats : (.+)$/, "Results: $1"],
  [/^Conseil de discipline : (.+)$/, "Disciplinary council: $1"],
  [/^Observation : (.+)$/, "Observation: $1"],
  [/^Avertissement : (.+)$/, "Warning: $1"],
  [/^Blâme : (.+)$/, "Reprimand: $1"],
  [/^Retenue : (.+)$/, "Detention: $1"],
  [/^Exclusion temporaire : (.+)$/, "Temporary exclusion: $1"],
  [/^Exclusion définitive : (.+)$/, "Permanent exclusion: $1"],
]
// Expressions courantes dans les messages (remplacees dans l'ordre)
const EXPRESSIONS = [
  ["était absent(e) le", "was absent on"],
  [" au cours de ", " during the lesson at "],
  ["sera absent(e) le", "will be absent on"],
  ["restent à payer, dont des frais dont l’échéance est passée.", "left to pay, including overdue fees."],
  ["reçus pour l’année", "received for the year"],
  ["Votre reçu est disponible.", "Your receipt is available."],
  ["vérifiez votre compte Mobile Money et confirmez la réception.", "check your Mobile Money account and confirm receipt."],
  ["l'établissement n'a pas retrouvé cette transaction", "the school did not find this transaction"],
  ["a créé un compte enseignant.", "created a teacher account."],
  ["demande à suivre", "asks to follow"],
  ["Vous êtes professeur principal de la", "You are the class teacher of"],
  ["Vous suivez maintenant", "You are now following"],
  ["L’établissement n’a pas validé votre demande pour", "The school did not approve your request for"],
  ["Contactez-le si besoin.", "Contact it if needed."],
  ["Reste à payer :", "Left to pay:"],
  ["pour l’année", "for the year"],
  [", échéance le", ", due on"],
  ["Sans paiement, School passera en lecture seule le", "Without payment, School will become read-only on"],
  ["School est en lecture seule jusqu’au paiement.", "School is read-only until payment."],
  [" · Séquence ", " · Sequence "],
  [" · pour le ", " · due "],
  [" · transaction ", " · transaction "],
  ["Paiement non confirmé après 24 heures", "Payment not confirmed after 24 hours"],
  ["Montant non reçu sur le compte", "Amount not received on the account"],
  ["Décision de l’arbitrage School", "School arbitration decision"],
  [" par Orange Money", " via Orange Money"],
  [" par MTN MoMo", " via MTN MoMo"],
]
const JOURS = { lundi: "Monday", mardi: "Tuesday", mercredi: "Wednesday", jeudi: "Thursday", vendredi: "Friday", samedi: "Saturday", dimanche: "Sunday" }
const MOIS = {
  janvier: "January", février: "February", mars: "March", avril: "April", mai: "May", juin: "June",
  juillet: "July", août: "August", septembre: "September", octobre: "October", novembre: "November", décembre: "December",
}

const traduireTexte = (t) => {
  if (!t) return t
  let s = String(t)
  for (const [fr, en] of EXPRESSIONS) s = s.split(fr).join(en)
  s = s.replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g, (m) => JOURS[m])
  s = s.replace(/\b(\d{1,2}) (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/g, (_, j, m) => `${j} ${MOIS[m]}`)
  return s
}

const traduireTitre = (t) => {
  if (!t) return t
  if (TITRES[t]) return TITRES[t]
  for (const [motif, rempl] of DEBUTS) if (motif.test(t)) return t.replace(motif, rempl)
  return traduireTexte(t)
}

/** Traduit une notification { title, message } selon la langue ('fr' : inchangee). */
const traduireNotification = (n, langue) =>
  langue === "en" ? { ...n, title: traduireTitre(n.title), message: traduireTexte(n.message) } : n

module.exports = { traduireNotification, traduireTitre, traduireTexte }
