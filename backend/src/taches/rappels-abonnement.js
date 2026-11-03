// taches/rappels-abonnement.js
// Rappels de paiement de l'abonnement : J-30, J-15, J-7, jour J, J+7, puis
// avertissement de passage en lecture seule. Chaque rappel n'est envoye qu'une fois.
const db = require("../config/db");
const logger = require("../utils/logger");
const { notifierUtilisateur } = require("../utils/notifier");
const S = require("../modules/abonnement/service");

const fcfa = (n) => `${Number(n || 0).toLocaleString("fr-FR")} FCFA`;
const date = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const PALIERS = [
  { cle: "j-30", si: (j) => j <= 30 && j > 15, titre: "Abonnement School : échéance dans un mois" },
  { cle: "j-15", si: (j) => j <= 15 && j > 7, titre: "Abonnement School : échéance dans 15 jours" },
  { cle: "j-7", si: (j) => j <= 7 && j > 0, titre: "Abonnement School : échéance dans 7 jours" },
  { cle: "j0", si: (j) => j === 0, titre: "Abonnement School : échéance aujourd’hui" },
  { cle: "j+7", si: (j) => j < -6, titre: "Abonnement School en retard" },
];

const rappeler = async () => {
  const ecoles = (await db.query("SELECT id FROM schools WHERE is_active")).rows;
  for (const { id } of ecoles) {
    const e = await S.etat(id);
    if (!e || ["gratuit", "paye"].includes(e.statut)) continue;
    const palier = PALIERS.find((p) => p.si(e.joursRestants) && !e.rappels.includes(p.cle));
    const lectureSeule = e.statut === "lecture_seule" && !e.rappels.includes("lecture_seule");
    if (!palier && !lectureSeule) continue;
    const titre = lectureSeule ? "Établissement en lecture seule" : palier.titre;
    const message = lectureSeule
      ? `L’abonnement ${e.annee} n’est pas réglé (reste ${fcfa(e.reste)}). School est en lecture seule jusqu’au paiement.`
      : `Reste à payer : ${fcfa(e.reste)} pour l’année ${e.annee}, échéance le ${date(e.echeance)}.` +
        (e.joursRestants < 0 ? ` Sans paiement, School passera en lecture seule le ${date(e.finGrace)}.` : "");
    const chefs = await db.query("SELECT id FROM users WHERE school_id = $1 AND role = 'principal' AND is_active", [id]);
    for (const c of chefs.rows) {
      await notifierUtilisateur(c.id, { title: titre, message, type: "payment", priority: "high", data: { lien: "/abonnement" } }).catch(() => {});
    }
    await db.query("UPDATE abonnements SET rappels = rappels || $2::jsonb WHERE id = $1", [e.id, JSON.stringify([lectureSeule ? "lecture_seule" : palier.cle])]);
  }
};

const demarrer = () => {
  const lancer = () => {
    const h = new Date().getHours();
    if (h >= 8 && h < 18) rappeler().catch((e) => logger.error(`Rappels abonnement : ${e.message}`));
  };
  setTimeout(lancer, 3 * 60 * 1000);
  setInterval(lancer, 3 * 60 * 60 * 1000);
};

module.exports = { rappeler, demarrer };
