// modules/parent-requests/parent-requests.routes.js
// Inscription des parents et validation par l'etablissement.
const express = require("express");
const router = express.Router();
const ctrl = require("./parent-requests.controller");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

// Publique : un parent cree son compte et demande a etre relie a son enfant
router.post("/inscription", ctrl.inscription);

// Administrateur de l'etablissement (ou de la plateforme)
router.get("/", authenticate, authorize("admin"), ctrl.liste);
router.post("/:id/valider", authenticate, authorize("admin"), ctrl.valider);
router.post("/:id/refuser", authenticate, authorize("admin"), ctrl.refuser);

module.exports = router;
