// modules/scolarite/verifier.js
// Verification d'un recu de scolarite par l'administration de l'etablissement : QR code ou code-barres
// du recu Sukul (numero + code), ou numero tape a la main (recu Sukul ou recu papier / bordereau).
// Reserve a l'etablissement qui a emis le recu (et a l'administrateur de la plateforme).
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { codeRecu } = require("../../utils/recus");

router.use(authenticate);

// GET /api/verifier/eleves/:matricule : l'eleve a-t-il paye ? ce qui est paye et ce qui reste, frais par frais.
// Le matricule est celui du dossier de l'etablissement (enregistre avec le numero de l'etablissement devant).
router.get("/eleves/:matricule", async (req, res, next) => {
  try {
    const u = req.user;
    if (!["principal", "admin"].includes(u.role)) throw new ApiError(403, "La vérification est réservée à l’administration de l’établissement.");
    const m = String(req.params.matricule || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 60);
    if (!m) throw new ApiError(400, "Saisissez le matricule de l’élève");
    const { rows } = await db.query(
      `SELECT u.id, sr.admission_number FROM users u JOIN student_records sr ON sr.student_id = u.id
       WHERE u.role = 'student' AND ($2::int IS NULL OR u.school_id = $2)
         AND (upper(replace(sr.admission_number, ' ', '')) = $1
              OR upper(replace(regexp_replace(sr.admission_number, '^\\d+-', ''), ' ', '')) = $1)
       ORDER BY (upper(sr.admission_number) = $1) DESC LIMIT 2`,
      [m, u.role === "admin" ? null : u.schoolId]
    );
    if (!rows[0]) throw new ApiError(404, "Aucun élève de l’établissement n’a ce matricule.");
    const { situationEleve } = require("./routes");
    const s = await situationEleve(rows[0].id);
    res.json({ success: true, data: { ...s, matricule: String(rows[0].admission_number || "").replace(/^\d+-/, "") } });
  } catch (e) {
    next(e);
  }
});

// GET /api/verifier/recus/:numero[?c=CODE]
router.get("/recus/:numero", async (req, res, next) => {
  try {
    const u = req.user;
    if (!["principal", "admin"].includes(u.role)) throw new ApiError(403, "La vérification des reçus est réservée à l’administration de l’établissement.");
    const numero = String(req.params.numero || "").trim().toUpperCase().slice(0, 80);
    const code = String(req.query.c || "").trim().toUpperCase();
    const { rows } = await db.query(
      `SELECT p.id, p.numero_recu, p.recu_externe, p.montant, p.mode, p.created_at, p.confirme_le, p.student_id, p.school_id, p.frais_id,
              f.nom AS frais, f.montant AS frais_montant, u.first_name, u.last_name, sr.admission_number AS matricule,
              COALESCE((SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = u.id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1), sr.declared_class) AS classe,
              e.first_name AS par_prenom, e.last_name AS par_nom
       FROM paiements_scolaires p JOIN frais_scolaires f ON f.id = p.frais_id JOIN users u ON u.id = p.student_id
       LEFT JOIN student_records sr ON sr.student_id = u.id LEFT JOIN users e ON e.id = COALESCE(p.enregistre_par, p.paye_par)
       WHERE p.statut = 'reussi' AND (upper(p.numero_recu) = $1 OR upper(p.recu_externe) = $1)
         AND ($2::int IS NULL OR p.school_id = $2)
       ORDER BY (upper(p.numero_recu) = $1) DESC LIMIT 1`,
      [numero, u.role === "admin" ? null : u.schoolId]
    );
    const r = rows[0];
    if (!r) {
      const ailleurs = u.role !== "admin" && (await db.query("SELECT 1 FROM paiements_scolaires WHERE upper(numero_recu) = $1 AND statut = 'reussi'", [numero])).rows[0];
      throw new ApiError(404, ailleurs ? "Ce reçu a été émis par un autre établissement." : "Aucun paiement ne correspond à ce numéro.");
    }
    // le code imprime sur le recu doit correspondre au numero et au montant enregistres
    const attendu = codeRecu(r.numero_recu, r.montant);
    const codeOk = code ? code === attendu : null;
    const paye = Number(
      (await db.query("SELECT COALESCE(SUM(montant), 0)::bigint AS t FROM paiements_scolaires WHERE student_id = $1 AND frais_id = $2 AND statut = 'reussi'", [r.student_id, r.frais_id])).rows[0].t
    );
    res.json({
      success: true,
      data: {
        id: r.id,
        numero: r.numero_recu,
        recuExterne: r.recu_externe,
        codeOk,
        eleve: { id: r.student_id, nom: `${r.last_name} ${r.first_name}`, classe: r.classe, matricule: r.matricule },
        frais: r.frais,
        montant: r.montant,
        mode: r.mode,
        date: r.confirme_le || r.created_at,
        enregistrePar: r.par_nom ? `${r.par_prenom} ${r.par_nom}` : null,
        fraisMontant: r.frais_montant,
        fraisPaye: Math.min(paye, r.frais_montant),
        fraisReste: Math.max(0, r.frais_montant - paye),
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
