// modules/inscriptions/inscriptions.routes.js
// Inscription libre : parents et eleves (actifs tout de suite), enseignants
// (en attente de validation par l'administrateur de leur etablissement).
const express = require("express");
const router = express.Router();
const ctrl = require("./inscriptions.controller");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

router.post("/", ctrl.inscription); // publique

// Parent : enfants declares a l'inscription (relies ou pas encore retrouves)
router.get("/mes-enfants", authenticate, authorize("parent"), ctrl.mesEnfants);

// Enseignant : rejoindre un etablissement une fois connecte
router.get("/mes-etablissements", authenticate, authorize("teacher"), ctrl.mesEtablissements);
router.post("/rejoindre", authenticate, authorize("teacher"), ctrl.rejoindre);
router.delete("/mes-etablissements/:schoolId", authenticate, authorize("teacher"), ctrl.quitter);
// Etablissements pas encore sur Sukul
router.post("/declarer", authenticate, authorize("teacher"), ctrl.declarer);
router.delete("/declares/:id", authenticate, authorize("teacher"), ctrl.retirerDeclare);

// Validation des enseignants (administrateur de l'etablissement ou de la plateforme)
router.get("/enseignants", authenticate, authorize("admin"), ctrl.listeEnseignants);
router.post("/enseignants/:id/valider", authenticate, authorize("admin"), ctrl.validerEnseignant);
router.post("/enseignants/:id/refuser", authenticate, authorize("admin"), ctrl.refuserEnseignant);

module.exports = router;
