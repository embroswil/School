// modules/scolarite/verifier.js
// Verification publique d'un recu de scolarite (sans compte) : QR code ou numero + code du recu.
// Ne renvoie que ce qui figure deja sur le recu.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { codeRecu } = require("../../utils/recus");

// GET /api/verifier/recus/:numero?c=CODE
router.get("/recus/:numero", async (req, res, next) => {
  try {
    const numero = String(req.params.numero || "").trim().toUpperCase().slice(0, 30);
    const code = String(req.query.c || "").trim().toUpperCase();
    const { rows } = await db.query(
      `SELECT p.numero_recu, p.montant, p.mode, p.created_at, p.confirme_le, f.nom AS frais, u.first_name, u.last_name, s.name AS ecole, s.city
       FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id JOIN schools s ON s.id = p.school_id
       WHERE upper(p.numero_recu) = $1 AND p.statut = 'reussi'`,
      [numero]
    );
    const r = rows[0];
    if (!r || !code || codeRecu(r.numero_recu, r.montant) !== code) throw new ApiError(404, "Reçu introuvable : ce reçu n’a pas été émis par Sùkûl ou ses informations ont été modifiées.");
    res.json({
      success: true,
      data: {
        numero: r.numero_recu,
        ecole: r.ecole,
        ville: r.city,
        eleve: `${r.first_name} ${String(r.last_name || "").charAt(0)}.`,
        frais: r.frais,
        montant: r.montant,
        mode: r.mode,
        date: r.confirme_le || r.created_at,
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
