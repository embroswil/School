// utils/contexte.js
// Etablissement de l'utilisateur connecte, disponible pendant toute la requete
// (sans le passer de fonction en fonction). Les requetes SQL des listes
// l'utilisent pour ne montrer que les donnees de cet etablissement.
// - administrateur de la plateforme (role "admin") : aucun filtre ;
// - tous les autres (administrateur d'etablissement, enseignant, parent) :
//   uniquement leur etablissement.
const { AsyncLocalStorage } = require("async_hooks");

const stockage = new AsyncLocalStorage();

const executerAvec = (contexte, fn) => stockage.run(contexte, fn);

/** Identifiant de l'etablissement a appliquer comme filtre, ou null (pas de filtre). */
const ecoleFiltre = () => {
  const c = stockage.getStore();
  if (!c || c.role === "admin") return null;
  return c.schoolId || -1; // sans etablissement : ne voit rien
};

/** Etablissement de l'utilisateur connecte (null pour l'admin de la plateforme). */
const ecoleCourante = () => {
  const c = stockage.getStore();
  return c && c.role !== "admin" ? c.schoolId || null : null;
};

module.exports = { executerAvec, ecoleFiltre, ecoleCourante };
