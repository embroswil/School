// modules/comptabilite/routes.js
// Comptabilite de l'etablissement : budget previsionnel (postes de recettes et de depenses),
// journal des operations (depenses, autres recettes) et tableau de bord de l'annee.
// Les paiements de scolarite encaisses via Sùkûl sont comptes automatiquement comme recettes.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { assurerAnneeScolaire } = require("../../utils/annees");

router.use(authenticate);
router.use((req, res, next) => {
  if (!["principal", "admin"].includes(req.user.role)) return next(new ApiError(403, "Réservé à l'établissement"));
  next();
});

const texte = (v, max) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const entier = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const SENS = ["recette", "depense"];
const ecoleDe = (req) => {
  const id = req.user.role === "admin" ? parseInt(req.query.ecole, 10) : req.user.schoolId;
  if (!id) throw new ApiError(400, "Aucun établissement associé à votre compte");
  return id;
};
// annee scolaire en cours et ses bornes (aout -> juillet)
const contexte = async (req) => {
  const ecole = ecoleDe(req);
  const annee = await assurerAnneeScolaire(ecole);
  const y = parseInt(String(annee?.name || "").slice(0, 4), 10) || new Date().getFullYear();
  return { ecole, annee, debut: `${y}-08-01`, fin: `${y + 1}-08-01`, y };
};

// GET /api/comptabilite : tableau de bord de l'annee
router.get("/", async (req, res, next) => {
  try {
    const { ecole, annee, debut, fin, y } = await contexte(req);
    const scol = (
      await db.query(
        `SELECT to_char(COALESCE(confirme_le, created_at), 'YYYY-MM') AS mois, SUM(montant)::bigint AS total
         FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' AND COALESCE(confirme_le, created_at) >= $2 AND COALESCE(confirme_le, created_at) < $3
         GROUP BY 1`,
        [ecole, debut, fin]
      )
    ).rows;
    const ops = (
      await db.query(
        `SELECT to_char(date_op, 'YYYY-MM') AS mois, sens, etat, COALESCE(categorie, 'Autre') AS categorie, SUM(montant)::bigint AS total
         FROM compta_operations WHERE school_id = $1 AND date_op >= $2 AND date_op < $3 GROUP BY 1, 2, 3, 4`,
        [ecole, debut, fin]
      )
    ).rows;
    const n = (v) => Number(v || 0);
    const scolarite = scol.reduce((s, r) => s + n(r.total), 0);
    const payees = ops.filter((o) => o.etat === "paye");
    const autresRecettes = payees.filter((o) => o.sens === "recette").reduce((s, r) => s + n(r.total), 0);
    const depenses = payees.filter((o) => o.sens === "depense").reduce((s, r) => s + n(r.total), 0);
    const engagees = ops.filter((o) => o.etat === "engage" && o.sens === "depense").reduce((s, r) => s + n(r.total), 0);

    // mois de septembre jusqu'au mois en cours
    const mois = [];
    const maintenant = new Date().toISOString().slice(0, 7);
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(y, 8 + i, 1)).toISOString().slice(0, 7);
      if (d > maintenant && i > 0) break;
      const rec = scol.filter((r) => r.mois === d).reduce((s, r) => s + n(r.total), 0) + payees.filter((o) => o.mois === d && o.sens === "recette").reduce((s, r) => s + n(r.total), 0);
      const dep = payees.filter((o) => o.mois === d && o.sens === "depense").reduce((s, r) => s + n(r.total), 0);
      mois.push({ mois: d, recettes: rec, depenses: dep });
    }
    const parCategorie = {};
    for (const o of payees.filter((x) => x.sens === "depense")) parCategorie[o.categorie] = (parCategorie[o.categorie] || 0) + n(o.total);

    const postes = await postesAvecRealise(ecole, annee, debut, fin, scolarite);
    const dernieres = (
      await db.query(
        `SELECT id, date_op, sens, libelle, montant, categorie, tiers, etat FROM compta_operations
         WHERE school_id = $1 AND date_op >= $2 AND date_op < $3 ORDER BY date_op DESC, id DESC LIMIT 6`,
        [ecole, debut, fin]
      )
    ).rows;
    const somme = (l, k) => l.reduce((s, p) => s + n(p[k]), 0);
    res.json({
      success: true,
      data: {
        annee: annee?.name || "",
        recettes: { scolarite, autres: autresRecettes, total: scolarite + autresRecettes },
        depenses: { payees: depenses, engagees },
        solde: scolarite + autresRecettes - depenses,
        mois,
        categories: Object.entries(parCategorie).map(([nom, total]) => ({ nom, total })).sort((a, b) => b.total - a.total),
        budget: {
          recettesPrevues: somme(postes.filter((p) => p.sens === "recette"), "prevu"),
          depensesPrevues: somme(postes.filter((p) => p.sens === "depense"), "prevu"),
          postes: postes.length,
        },
        dernieres,
      },
    });
  } catch (e) {
    next(e);
  }
});

async function postesAvecRealise(ecole, annee, debut, fin, scolarite) {
  const { rows } = await db.query(
    `SELECT p.id, p.nom, p.sens, p.categorie, p.prevu::bigint AS prevu, p.scolarite,
            COALESCE((SELECT SUM(o.montant) FROM compta_operations o WHERE o.poste_id = p.id AND o.etat = 'paye' AND o.date_op >= $3 AND o.date_op < $4), 0)::bigint AS realise,
            COALESCE((SELECT SUM(o.montant) FROM compta_operations o WHERE o.poste_id = p.id AND o.etat = 'engage'), 0)::bigint AS engage
     FROM compta_postes p WHERE p.school_id = $1 AND (p.academic_year_id IS NULL OR p.academic_year_id = $2)
     ORDER BY p.sens DESC, p.categorie NULLS LAST, p.nom`,
    [ecole, annee?.id || null, debut, fin]
  );
  return rows.map((p) => ({ ...p, prevu: Number(p.prevu), realise: Number(p.realise) + (p.scolarite ? scolarite : 0), engage: Number(p.engage) }));
}

// GET /api/comptabilite/budget : postes du budget avec le realise
router.get("/budget", async (req, res, next) => {
  try {
    const { ecole, annee, debut, fin } = await contexte(req);
    const scolarite = Number(
      (await db.query("SELECT COALESCE(SUM(montant), 0)::bigint AS t FROM paiements_scolaires WHERE school_id = $1 AND statut = 'reussi' AND COALESCE(confirme_le, created_at) >= $2 AND COALESCE(confirme_le, created_at) < $3", [ecole, debut, fin])).rows[0].t
    );
    res.json({ success: true, data: await postesAvecRealise(ecole, annee, debut, fin, scolarite) });
  } catch (e) {
    next(e);
  }
});

const lirePoste = (b) => {
  const nom = texte(b.nom, 150);
  const sens = SENS.includes(b.sens) ? b.sens : null;
  const prevu = parseInt(String(b.prevu ?? "").replace(/[^\d]/g, ""), 10) || 0;
  if (!nom || !sens) throw new ApiError(400, "Indiquez le nom du poste et s'il s'agit d'une recette ou d'une dépense");
  return { nom, sens, prevu, categorie: texte(b.categorie, 60) || null, scolarite: sens === "recette" && Boolean(b.scolarite) };
};

router.post("/postes", async (req, res, next) => {
  try {
    const { ecole, annee } = await contexte(req);
    const p = lirePoste(req.body || {});
    const { rows } = await db.query(
      "INSERT INTO compta_postes (school_id, academic_year_id, nom, sens, categorie, prevu, scolarite) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      [ecole, annee?.id || null, p.nom, p.sens, p.categorie, p.prevu, p.scolarite]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    if (e.code === "23505") return next(new ApiError(409, "Ce poste existe déjà dans le budget"));
    next(e);
  }
});

router.put("/postes/:id", async (req, res, next) => {
  try {
    const { ecole } = await contexte(req);
    const p = lirePoste(req.body || {});
    const r = await db.query("UPDATE compta_postes SET nom = $1, sens = $2, categorie = $3, prevu = $4, scolarite = $5 WHERE id = $6 AND school_id = $7", [p.nom, p.sens, p.categorie, p.prevu, p.scolarite, entier(req.params.id), ecole]);
    if (!r.rowCount) throw new ApiError(404, "Poste introuvable");
    res.json({ success: true });
  } catch (e) {
    if (e.code === "23505") return next(new ApiError(409, "Ce poste existe déjà dans le budget"));
    next(e);
  }
});

router.delete("/postes/:id", async (req, res, next) => {
  try {
    const { ecole } = await contexte(req);
    const r = await db.query("DELETE FROM compta_postes WHERE id = $1 AND school_id = $2", [entier(req.params.id), ecole]);
    if (!r.rowCount) throw new ApiError(404, "Poste introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/comptabilite/operations?sens=depense : journal de l'annee
router.get("/operations", async (req, res, next) => {
  try {
    const { ecole, debut, fin } = await contexte(req);
    const sens = SENS.includes(req.query.sens) ? req.query.sens : null;
    const { rows } = await db.query(
      `SELECT o.id, o.date_op, o.sens, o.libelle, o.montant, o.categorie, o.tiers, o.mode, o.piece, o.etat, o.poste_id, p.nom AS poste
       FROM compta_operations o LEFT JOIN compta_postes p ON p.id = o.poste_id
       WHERE o.school_id = $1 AND o.date_op >= $2 AND o.date_op < $3 AND ($4::text IS NULL OR o.sens = $4)
       ORDER BY o.date_op DESC, o.id DESC LIMIT 1000`,
      [ecole, debut, fin, sens]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

const lireOperation = (b) => {
  const libelle = texte(b.libelle, 200);
  const sens = SENS.includes(b.sens) ? b.sens : null;
  const montant = parseInt(String(b.montant ?? "").replace(/[^\d]/g, ""), 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : null;
  if (!libelle || !sens || !(montant > 0) || !date) throw new ApiError(400, "Indiquez la date, le libellé, le montant et le sens de l'opération");
  return {
    libelle,
    sens,
    montant,
    date,
    categorie: texte(b.categorie, 60) || null,
    tiers: texte(b.tiers, 120) || null,
    mode: texte(b.mode, 40) || null,
    piece: texte(b.piece, 60) || null,
    etat: b.etat === "engage" ? "engage" : "paye",
    poste: entier(b.posteId),
  };
};

router.post("/operations", async (req, res, next) => {
  try {
    const { ecole, annee } = await contexte(req);
    const o = lireOperation(req.body || {});
    const { rows } = await db.query(
      `INSERT INTO compta_operations (school_id, academic_year_id, date_op, sens, libelle, poste_id, categorie, montant, tiers, mode, piece, etat, created_by)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM compta_postes WHERE id = $6 AND school_id = $1), $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [ecole, annee?.id || null, o.date, o.sens, o.libelle, o.poste, o.categorie, o.montant, o.tiers, o.mode, o.piece, o.etat, req.user.id]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    if (e.code === "23505") return next(new ApiError(409, "Une opération porte déjà ce numéro de pièce"));
    next(e);
  }
});

router.put("/operations/:id", async (req, res, next) => {
  try {
    const { ecole } = await contexte(req);
    const o = lireOperation(req.body || {});
    const r = await db.query(
      `UPDATE compta_operations SET date_op = $1, sens = $2, libelle = $3, poste_id = (SELECT id FROM compta_postes WHERE id = $4 AND school_id = $12), categorie = $5,
              montant = $6, tiers = $7, mode = $8, piece = $9, etat = $10 WHERE id = $11 AND school_id = $12`,
      [o.date, o.sens, o.libelle, o.poste, o.categorie, o.montant, o.tiers, o.mode, o.piece, o.etat, entier(req.params.id), ecole]
    );
    if (!r.rowCount) throw new ApiError(404, "Opération introuvable");
    res.json({ success: true });
  } catch (e) {
    if (e.code === "23505") return next(new ApiError(409, "Une opération porte déjà ce numéro de pièce"));
    next(e);
  }
});

router.delete("/operations/:id", async (req, res, next) => {
  try {
    const { ecole } = await contexte(req);
    const r = await db.query("DELETE FROM compta_operations WHERE id = $1 AND school_id = $2", [entier(req.params.id), ecole]);
    if (!r.rowCount) throw new ApiError(404, "Opération introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Paiements de scolarite lus dans un journal : eleve retrouve par son matricule, frais par son nom.
const cle = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").toLowerCase().trim();
const MODE = (m) => {
  const t = cle(m);
  if (/orange|mtn|momo|mobile/.test(t)) return "mobile_money";
  if (/espece|guichet|caisse|cash/.test(t)) return "especes";
  if (/banque|virement|cheque|bancaire/.test(t)) return "banque";
  return "autre";
};
async function preparerPaiements(ecole, annee, lus) {
  if (!lus.length) return { lignes: [], elevesInconnus: 0, exemples: [], fraisInconnus: [], deja: 0 };
  const eleves = new Map();
  for (const e of (await db.query("SELECT u.id, r.admission_number FROM users u JOIN student_records r ON r.student_id = u.id WHERE u.school_id = $1 AND u.role = 'student' AND r.admission_number IS NOT NULL", [ecole])).rows) {
    const m = cle(e.admission_number);
    eleves.set(m, e.id);
    eleves.set(m.replace(/^\d+-/, ""), e.id); // matricules enregistres avec le numero de l'etablissement (12-LAV00001)
  }
  const frais = new Map((await db.query("SELECT id, nom FROM frais_scolaires WHERE school_id = $1 AND (academic_year_id IS NULL OR academic_year_id = $2)", [ecole, annee?.id || null])).rows.map((f) => [cle(f.nom), f.id]));
  const recus = lus.map((p) => p.recu).filter(Boolean);
  const existants = new Set(recus.length ? (await db.query("SELECT numero_recu FROM paiements_scolaires WHERE numero_recu = ANY($1)", [recus])).rows.map((r) => r.numero_recu) : []);
  const lignes = [];
  const inconnus = new Set();
  const exemples = [];
  const fraisInconnus = new Set();
  let deja = 0;
  for (const p of lus) {
    if (p.recu && existants.has(p.recu)) {
      deja++;
      continue;
    }
    const eleve = eleves.get(cle(p.matricule));
    const f = frais.get(cle(p.frais));
    if (!f) fraisInconnus.add(p.frais);
    if (!eleve) {
      if (!inconnus.has(p.matricule) && exemples.length < 5) exemples.push(`${p.nom || ""} (${p.matricule})`.trim());
      inconnus.add(p.matricule);
    }
    if (eleve && f) lignes.push({ ...p, eleve, fraisId: f, modeDb: MODE(p.mode) });
  }
  return { lignes, elevesInconnus: inconnus.size, exemples, fraisInconnus: [...fraisInconnus], deja };
}

// POST /api/comptabilite/importer { texte, apercu } : budget et journal depuis un classeur (Excel, CSV).
// Les postes existants sont mis a jour, les operations deja importees (meme piece) sont ignorees.
router.post("/importer", async (req, res, next) => {
  try {
    const { ecole, annee } = await contexte(req);
    const lu = require("../../utils/tableur").comptabilite(String(req.body?.texte || ""));
    if (!lu) throw new ApiError(400, "Aucun tableau reconnu : il faut des colonnes « Poste » et « Montant » (budget), « Date », « Libellé » et « Montant » (dépenses), ou « Date », « Matricule », « Frais » et « Montant » (paiements de scolarité).");
    const existants = new Map((await db.query("SELECT id, lower(nom) AS cle FROM compta_postes WHERE school_id = $1 AND (academic_year_id IS NULL OR academic_year_id = $2)", [ecole, annee?.id || null])).rows.map((p) => [p.cle, p.id]));
    const pieces = new Set((await db.query("SELECT piece FROM compta_operations WHERE school_id = $1 AND piece IS NOT NULL", [ecole])).rows.map((r) => r.piece));
    const nouvellesOps = lu.operations.filter((o) => !o.piece || !pieces.has(o.piece));
    const paie = await preparerPaiements(ecole, annee, lu.paiements || []);
    const resume = {
      paiements: paie.lignes.length,
      paiementsTotal: paie.lignes.reduce((t, p) => t + p.montant, 0),
      paiementsLus: (lu.paiements || []).length,
      paiementsDeja: paie.deja,
      elevesInconnus: paie.elevesInconnus,
      exemplesInconnus: paie.exemples,
      fraisInconnus: paie.fraisInconnus,
      postesNouveaux: lu.postes.filter((p) => !existants.has(p.nom.toLowerCase())).length,
      postesMaj: lu.postes.filter((p) => existants.has(p.nom.toLowerCase())).length,
      operations: nouvellesOps.length,
      dejaImportees: lu.operations.length - nouvellesOps.length,
      depenses: nouvellesOps.filter((o) => o.sens === "depense").reduce((s, o) => s + o.montant, 0),
      recettes: nouvellesOps.filter((o) => o.sens === "recette").reduce((s, o) => s + o.montant, 0),
      prevuRecettes: lu.postes.filter((p) => p.sens === "recette").reduce((s, p) => s + p.prevu, 0),
      prevuDepenses: lu.postes.filter((p) => p.sens === "depense").reduce((s, p) => s + p.prevu, 0),
    };
    if (req.body?.apercu) return res.json({ success: true, data: resume });

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const p of lu.postes) {
        const id = existants.get(p.nom.toLowerCase());
        if (id) await client.query("UPDATE compta_postes SET prevu = $1, sens = $2, categorie = COALESCE($3, categorie), scolarite = $4 WHERE id = $5", [p.prevu, p.sens, p.categorie, p.scolarite, id]);
        else {
          const r = await client.query("INSERT INTO compta_postes (school_id, academic_year_id, nom, sens, categorie, prevu, scolarite) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id", [ecole, annee?.id || null, p.nom, p.sens, p.categorie, p.prevu, p.scolarite]);
          existants.set(p.nom.toLowerCase(), r.rows[0].id);
        }
      }
      for (const o of nouvellesOps) {
        await client.query(
          `INSERT INTO compta_operations (school_id, academic_year_id, date_op, sens, libelle, poste_id, categorie, montant, tiers, mode, piece, etat, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING`,
          [ecole, annee?.id || null, o.date, o.sens, o.libelle.slice(0, 200), existants.get(o.libelle.toLowerCase()) || null, o.categorie, o.montant, o.tiers, o.mode, o.piece, o.etat, req.user.id]
        );
      }
      // paiements de scolarite : par lots, sans notification (historique)
      for (let i = 0; i < paie.lignes.length; i += 1000) {
        const lot = paie.lignes.slice(i, i + 1000);
        await client.query(
          `INSERT INTO paiements_scolaires (school_id, frais_id, student_id, montant, mode, statut, reference, enregistre_par, created_at, confirme_le, numero_recu)
           SELECT $1, f, e, m, mo, 'reussi', NULLIF(r, ''), $2, d, d, NULLIF(n, '')
           FROM unnest($3::int[], $4::int[], $5::int[], $6::text[], $7::text[], $8::timestamp[], $9::text[]) AS t(f, e, m, mo, r, d, n)
           ON CONFLICT DO NOTHING`,
          [ecole, req.user.id, lot.map((p) => p.fraisId), lot.map((p) => p.eleve), lot.map((p) => p.montant), lot.map((p) => p.modeDb), lot.map((p) => p.reference || ""), lot.map((p) => `${p.date} 12:00:00`), lot.map((p) => p.recu || "")]
        );
      }
      // numero de recu pour les paiements importes sans numero
      await client.query("UPDATE paiements_scolaires SET numero_recu = 'REC-' || to_char(created_at, 'YYYY') || '-' || lpad(id::text, 6, '0') WHERE school_id = $1 AND numero_recu IS NULL AND statut = 'reussi'", [ecole]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    res.json({ success: true, data: resume });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
