// modules/schools/schools.routes.js
// Etablissements : creation par l'administrateur de la plateforme, liste
// publique (pour l'inscription des parents), administrateur de chaque etablissement.
const express = require("express");
const router = express.Router();
const ctrl = require("./schools.controller");
const { authenticate, isPlatformAdmin } = require("../../middlewares/auth.middleware");

// Publique : etablissements actifs (choix a l'inscription)
router.get("/public", ctrl.listePublique);
router.get("/:id/structure", ctrl.structure);

// Administrateur de la plateforme
router.get("/statistiques", authenticate, isPlatformAdmin, ctrl.statistiques);
router.get("/", authenticate, isPlatformAdmin, ctrl.liste);
router.post("/", authenticate, isPlatformAdmin, ctrl.creer);
router.put("/:id", authenticate, isPlatformAdmin, ctrl.modifier);
router.post("/:id/administrateur", authenticate, isPlatformAdmin, ctrl.definirAdministrateur);

module.exports = router;
