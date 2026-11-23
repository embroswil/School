// modules/boutique/routes.js
// Boutique de l'etablissement : tenues, fournitures et listes par niveau (kits).
// 1. le parent choisit les articles de son enfant (ou toute la liste de sa classe) ;
// 2. il paie par transfert direct au numero de l'etablissement (meme ordre de paiement que la scolarite) ;
// 3. l'etablissement confirme la reception, prepare la commande, puis la remet a l'eleve.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierUtilisateur } = require("../../utils/notifier");
const S = require("../scolarite/routes");
const O = require("../scolarite/ordres");

router.use(authenticate);

const entier = (v) => parseInt(String(v ?? "").replace(/\s/g, ""), 10);
const texte = (v, max) => String(v ?? "").trim().slice(0, max);
const fcfa = (n) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
const CATEGORIES = ["tenue", "fournitures", "livres", "autre"];
const liste = (v, max = 30) =>
  (Array.isArray(v) ? v : String(v ?? "").split(","))
    .map((x) => texte(x, 30))
    .filter(Boolean)
    .slice(0, max);

// Un article ou un kit vaut pour une classe si ses niveaux sont vides, ou si la classe commence par l'un d'eux
// (« 3e All » vaut pour « 3e All 1 », « 3e All 2 »…), comme pour les frais de scolarite
const SQL_NIVEAU = (col, param) =>
  `(cardinality(${col}) = 0 OR EXISTS (SELECT 1 FROM unnest(${col}) x WHERE lower(${param}) = lower(x) OR lower(${param}) LIKE lower(x) || ' %'))`;

const SQL_CLASSE = `COALESCE(
  (SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
   WHERE cs.student_id = u.id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1),
  (SELECT sr.declared_class FROM student_records sr WHERE sr.student_id = u.id))`;

const eleve = async (id) =>
  (
    await db.query(
      `SELECT u.id, u.first_name AS prenom, u.last_name AS nom, u.school_id, ${SQL_CLASSE} AS classe,
              s.name AS ecole, s.boutique_ouverte AS ouverte, s.orange_money AS orange, s.mtn_momo AS mtn
       FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = $1 AND u.role = 'student'`,
      [id]
    )
  ).rows[0];

const exigerGestion = (u) => {
  if (u.role !== "principal" || !u.schoolId) throw new ApiError(403, "Réservé à l’établissement");
  return u.schoolId;
};

// Une commande vue par l'utilisateur (null si pas d'acces)
const chargerCommande = async (u, id) => {
  const c = (
    await db.query(
      `SELECT c.*, u.first_name AS prenom, u.last_name AS nom, ${SQL_CLASSE} AS classe, s.name AS ecole,
              s.orange_money AS orange, s.mtn_momo AS mtn,
              pp.first_name AS parent_prenom, pp.last_name AS parent_nom, pp.phone AS parent_tel
       FROM boutique_commandes c JOIN users u ON u.id = c.student_id JOIN schools s ON s.id = c.school_id
       LEFT JOIN users pp ON pp.id = c.cree_par WHERE c.id = $1`,
      [id]
    )
  ).rows[0];
  if (!c) return null;
  const role =
    u.role === "principal" && u.schoolId === c.school_id
      ? "etablissement"
      : c.cree_par === u.id || (await S.elevesAccessibles(u)).includes(c.student_id)
        ? "parent"
        : null;
  if (!role) return null;
  return { ...c, monRole: role };
};
const exigerCommande = async (u, id, roles) => {
  const c = await chargerCommande(u, id);
  if (!c) throw new ApiError(404, "Commande introuvable");
  if (roles && !roles.includes(c.monRole)) throw new ApiError(403, "Action non autorisée");
  return c;
};
// Ordre de paiement en cours (a payer et non expire, ou signale, ou en litige)
const ordreEnCours = async (commandeId) =>
  (
    await db.query(
      `SELECT id, statut, code FROM ordres_paiement
       WHERE commande_id = $1 AND (statut IN ('paye', 'litige') OR (statut = 'a_payer' AND expire_le > NOW()))
       ORDER BY created_at DESC LIMIT 1`,
      [commandeId]
    )
  ).rows[0] || null;

// ================================================================ cote parent

// GET /api/boutique : enfants du parent (boutique ouverte ou non) et ses commandes
router.get("/", async (req, res, next) => {
  try {
    const ids = await S.elevesAccessibles(req.user);
    const eleves = [];
    for (const id of ids) {
      const e = await eleve(id);
      if (e) eleves.push({ id: e.id, prenom: e.prenom, nom: e.nom, classe: e.classe, ecole: e.ecole, ouverte: e.ouverte });
    }
    const commandes = (
      await db.query(
        `SELECT c.id, c.statut, c.montant, c.created_at, u.first_name AS prenom, u.last_name AS nom,
                (SELECT COALESCE(SUM(quantite), 0)::int FROM boutique_lignes l WHERE l.commande_id = c.id) AS articles
         FROM boutique_commandes c JOIN users u ON u.id = c.student_id
         WHERE (c.cree_par = $1 OR c.student_id = ANY($2)) AND c.statut <> 'annulee'
         ORDER BY c.created_at DESC LIMIT 30`,
        [req.user.id, ids]
      )
    ).rows;
    res.json({ success: true, data: { eleves, commandes } });
  } catch (e) {
    next(e);
  }
});

// GET /api/boutique/eleves/:id : catalogue pour la classe de l'eleve
router.get("/eleves/:id", async (req, res, next) => {
  try {
    const id = entier(req.params.id);
    if (!(await S.elevesAccessibles(req.user)).includes(id)) throw new ApiError(403, "Élève non relié à votre compte");
    const e = await eleve(id);
    if (!e) throw new ApiError(404, "Élève introuvable");
    if (!e.ouverte) return res.json({ success: true, data: { eleve: e, ouverte: false, articles: [], kits: [] } });
    const articles = (
      await db.query(
        `SELECT id, categorie, nom, description, prix, tailles, image FROM boutique_articles
         WHERE school_id = $1 AND actif AND ${SQL_NIVEAU("niveaux", "$2")} ORDER BY categorie, ordre, nom`,
        [e.school_id, e.classe || ""]
      )
    ).rows;
    const kits = (
      await db.query(
        `SELECT k.id, k.nom, k.description,
                COALESCE(json_agg(json_build_object('articleId', ka.article_id, 'quantite', ka.quantite) ORDER BY a.categorie DESC, a.ordre) FILTER (WHERE a.id IS NOT NULL), '[]') AS articles
         FROM boutique_kits k
         LEFT JOIN boutique_kit_articles ka ON ka.kit_id = k.id
         LEFT JOIN boutique_articles a ON a.id = ka.article_id AND a.actif
         WHERE k.school_id = $1 AND k.actif AND ${SQL_NIVEAU("k.niveaux", "$2")}
         GROUP BY k.id ORDER BY cardinality(k.niveaux) = 0, k.ordre, k.nom`,
        [e.school_id, e.classe || ""]
      )
    ).rows;
    // seuls les articles visibles pour cette classe comptent dans un kit
    const visibles = new Set(articles.map((a) => a.id));
    for (const k of kits) k.articles = k.articles.filter((x) => visibles.has(x.articleId));
    res.json({
      success: true,
      data: {
        eleve: { id: e.id, prenom: e.prenom, nom: e.nom, classe: e.classe, ecole: e.ecole, schoolId: e.school_id },
        ouverte: true,
        moyens: { orange: Boolean(e.orange), mtn: Boolean(e.mtn) },
        articles,
        kits: kits.filter((k) => k.articles.length),
      },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/boutique/commandes { studentId, moyen, lignes: [{ articleId, taille, quantite }] }
router.post("/commandes", async (req, res, next) => {
  try {
    const u = req.user;
    const studentId = entier(req.body?.studentId);
    if (!(await S.elevesAccessibles(u)).includes(studentId)) throw new ApiError(403, "Élève non relié à votre compte");
    const moyen = O.OPERATEURS[req.body?.moyen] ? req.body.moyen : null;
    if (!moyen) throw new ApiError(400, "Choisissez Orange Money ou MTN MoMo");
    const e = await eleve(studentId);
    if (!e?.ouverte) throw new ApiError(400, "La boutique de l’établissement est fermée");
    const demandees = (Array.isArray(req.body?.lignes) ? req.body.lignes : []).slice(0, 80);
    if (!demandees.length) throw new ApiError(400, "Votre panier est vide");
    const ids = [...new Set(demandees.map((l) => entier(l.articleId)).filter(Number.isFinite))];
    const articles = new Map(
      (
        await db.query(
          `SELECT id, nom, prix, tailles FROM boutique_articles WHERE id = ANY($1) AND school_id = $2 AND actif AND ${SQL_NIVEAU("niveaux", "$3")}`,
          [ids, e.school_id, e.classe || ""]
        )
      ).rows.map((a) => [a.id, a])
    );
    // Les prix viennent toujours de la base, jamais du telephone
    const lignes = [];
    for (const l of demandees) {
      const a = articles.get(entier(l.articleId));
      if (!a) throw new ApiError(400, "Un article n’est plus disponible : actualisez la boutique");
      const quantite = entier(l.quantite);
      if (!(quantite >= 1 && quantite <= 99)) throw new ApiError(400, `Quantité invalide pour ${a.nom}`);
      const taille = texte(l.taille, 30) || null;
      if (a.tailles.length && !a.tailles.includes(taille)) throw new ApiError(400, `Choisissez la taille : ${a.nom}`);
      lignes.push({ ...a, taille: a.tailles.length ? taille : null, quantite });
    }
    const montant = lignes.reduce((s, l) => s + l.prix * l.quantite, 0);
    if (montant < 100) throw new ApiError(400, "Montant trop faible");
    const client = await db.connect();
    let commandeId;
    try {
      await client.query("BEGIN");
      commandeId = (
        await client.query("INSERT INTO boutique_commandes (school_id, student_id, cree_par, montant) VALUES ($1, $2, $3, $4) RETURNING id", [e.school_id, studentId, u.id, montant])
      ).rows[0].id;
      for (const l of lignes) {
        await client.query("INSERT INTO boutique_lignes (commande_id, article_id, nom, taille, quantite, prix) VALUES ($1, $2, $3, $4, $5, $6)", [
          commandeId,
          l.id,
          l.nom,
          l.taille,
          l.quantite,
          l.prix,
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    try {
      const o = await O.creerOrdre({ studentId, commandeId, montant, moyen, userId: u.id, libelle: "d’articles" });
      res.status(201).json({ success: true, data: { commandeId, ordreId: o.id } });
    } catch (err) {
      await db.query("DELETE FROM boutique_commandes WHERE id = $1", [commandeId]);
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

// GET /api/boutique/commandes/:id : detail, lignes et paiement en cours
router.get("/commandes/:id", async (req, res, next) => {
  try {
    const c = await exigerCommande(req.user, entier(req.params.id));
    const lignes = (
      await db.query(
        `SELECT l.id, l.nom, l.taille, l.quantite, l.prix, a.categorie, a.image
         FROM boutique_lignes l LEFT JOIN boutique_articles a ON a.id = l.article_id WHERE l.commande_id = $1 ORDER BY l.id`,
        [c.id]
      )
    ).rows;
    const ordre = await ordreEnCours(c.id);
    const dernier = (await db.query("SELECT id FROM ordres_paiement WHERE commande_id = $1 ORDER BY created_at DESC LIMIT 1", [c.id])).rows[0];
    res.json({
      success: true,
      data: { ...c, orange: Boolean(c.orange), mtn: Boolean(c.mtn), lignes, ordre, dernierOrdre: dernier?.id || null },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/boutique/commandes/:id/payer { moyen } : nouveau paiement (le precedent a expire ou a ete annule)
router.post("/commandes/:id/payer", async (req, res, next) => {
  try {
    const c = await exigerCommande(req.user, entier(req.params.id), ["parent"]);
    if (c.statut !== "a_payer") throw new ApiError(400, "Cette commande n’attend plus de paiement");
    const enCours = await ordreEnCours(c.id);
    if (enCours) return res.json({ success: true, data: { ordreId: enCours.id } });
    const moyen = O.OPERATEURS[req.body?.moyen] ? req.body.moyen : null;
    if (!moyen) throw new ApiError(400, "Choisissez Orange Money ou MTN MoMo");
    const o = await O.creerOrdre({ studentId: c.student_id, commandeId: c.id, montant: c.montant, moyen, userId: req.user.id, libelle: "d’articles" });
    res.status(201).json({ success: true, data: { ordreId: o.id } });
  } catch (e) {
    next(e);
  }
});

// POST /api/boutique/commandes/:id/annuler : seulement tant que rien n'a ete envoye
router.post("/commandes/:id/annuler", async (req, res, next) => {
  try {
    const c = await exigerCommande(req.user, entier(req.params.id), ["parent", "etablissement"]);
    const enCours = await ordreEnCours(c.id);
    if (c.statut !== "a_payer" || (enCours && enCours.statut !== "a_payer")) throw new ApiError(400, "Cette commande ne peut plus être annulée");
    await db.query("UPDATE ordres_paiement SET statut = 'annule', motif = 'Commande annulée' WHERE commande_id = $1 AND statut = 'a_payer'", [c.id]);
    await db.query("UPDATE boutique_commandes SET statut = 'annulee' WHERE id = $1 AND statut = 'a_payer'", [c.id]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ================================================================ cote etablissement

// GET /api/boutique/gestion : etat de la boutique, articles, kits et commandes
router.get("/gestion", async (req, res, next) => {
  try {
    const ecole = exigerGestion(req.user);
    const ouverte = (await db.query("SELECT boutique_ouverte FROM schools WHERE id = $1", [ecole])).rows[0]?.boutique_ouverte || false;
    const articles = (await db.query("SELECT * FROM boutique_articles WHERE school_id = $1 ORDER BY categorie, ordre, nom", [ecole])).rows;
    const kits = (
      await db.query(
        `SELECT k.*, COALESCE(json_agg(json_build_object('articleId', ka.article_id, 'quantite', ka.quantite)) FILTER (WHERE ka.article_id IS NOT NULL), '[]') AS articles
         FROM boutique_kits k LEFT JOIN boutique_kit_articles ka ON ka.kit_id = k.id
         WHERE k.school_id = $1 GROUP BY k.id ORDER BY k.ordre, k.nom`,
        [ecole]
      )
    ).rows;
    const commandes = (
      await db.query(
        `SELECT c.id, c.statut, c.montant, c.created_at, c.payee_le, c.prete_le, c.remise_le,
                u.first_name AS prenom, u.last_name AS nom, ${SQL_CLASSE} AS classe,
                (SELECT COALESCE(SUM(quantite), 0)::int FROM boutique_lignes l WHERE l.commande_id = c.id) AS articles
         FROM boutique_commandes c JOIN users u ON u.id = c.student_id
         WHERE c.school_id = $1 AND (c.statut IN ('payee', 'prete') OR c.created_at > NOW() - INTERVAL '60 days')
         ORDER BY CASE c.statut WHEN 'payee' THEN 0 WHEN 'prete' THEN 1 WHEN 'a_payer' THEN 2 ELSE 3 END, c.created_at DESC LIMIT 200`,
        [ecole]
      )
    ).rows;
    res.json({ success: true, data: { ouverte, articles, kits, commandes } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/boutique/gestion/ouverte { ouverte }
router.put("/gestion/ouverte", async (req, res, next) => {
  try {
    const ecole = exigerGestion(req.user);
    await db.query("UPDATE schools SET boutique_ouverte = $2 WHERE id = $1", [ecole, req.body?.ouverte === true]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Photo de l'article : adresse du stockage (https) ou petite image integree (si le stockage n'est pas active)
const lireImage = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (/^https:\/\/[^\s"'<>]{8,600}$/.test(t)) return t;
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t) && t.length <= 400000) return t;
  throw new ApiError(400, "Photo invalide ou trop lourde");
};

const lireArticle = (b) => {
  const nom = texte(b?.nom, 120);
  const prix = entier(b?.prix);
  if (!nom) throw new ApiError(400, "Nom de l’article obligatoire");
  if (!(prix >= 0 && prix <= 5000000)) throw new ApiError(400, "Prix invalide");
  return {
    categorie: CATEGORIES.includes(b?.categorie) ? b.categorie : "fournitures",
    nom,
    description: texte(b?.description, 300) || null,
    prix,
    tailles: liste(b?.tailles),
    niveaux: liste(b?.niveaux),
    actif: b?.actif !== false,
    image: lireImage(b?.image),
  };
};

// POST /api/boutique/gestion/articles
router.post("/gestion/articles", async (req, res, next) => {
  try {
    const ecole = exigerGestion(req.user);
    const a = lireArticle(req.body);
    const { rows } = await db.query(
      `INSERT INTO boutique_articles (school_id, categorie, nom, description, prix, tailles, niveaux, actif, image, ordre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(MAX(ordre), 0) + 1 FROM boutique_articles WHERE school_id = $1)) RETURNING *`,
      [ecole, a.categorie, a.nom, a.description, a.prix, a.tailles, a.niveaux, a.actif, a.image]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

// PUT /api/boutique/gestion/articles/:id
router.put("/gestion/articles/:id", async (req, res, next) => {
  try {
    const ecole = exigerGestion(req.user);
    const a = lireArticle(req.body);
    const { rows } = await db.query(
      `UPDATE boutique_articles SET categorie = $3, nom = $4, description = $5, prix = $6, tailles = $7, niveaux = $8, actif = $9, image = $10
       WHERE id = $1 AND school_id = $2 RETURNING *`,
      [entier(req.params.id), ecole, a.categorie, a.nom, a.description, a.prix, a.tailles, a.niveaux, a.actif, a.image]
    );
    if (!rows[0]) throw new ApiError(404, "Article introuvable");
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/boutique/gestion/articles/:id (les commandes passees gardent le nom et le prix)
router.delete("/gestion/articles/:id", async (req, res, next) => {
  try {
    const ecole = exigerGestion(req.user);
    await db.query("DELETE FROM boutique_articles WHERE id = $1 AND school_id = $2", [entier(req.params.id), ecole]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// Enregistre un kit et sa liste d'articles
const ecrireKit = async (ecole, id, b) => {
  const nom = texte(b?.nom, 120);
  if (!nom) throw new ApiError(400, "Nom de la liste obligatoire");
  const items = (Array.isArray(b?.articles) ? b.articles : [])
    .map((x) => ({ articleId: entier(x.articleId), quantite: Math.min(99, Math.max(1, entier(x.quantite) || 1)) }))
    .filter((x) => Number.isFinite(x.articleId));
  const valides = new Set(
    (await db.query("SELECT id FROM boutique_articles WHERE school_id = $1 AND id = ANY($2)", [ecole, items.map((x) => x.articleId)])).rows.map((r) => r.id)
  );
  const vals = [ecole, nom, texte(b?.description, 300) || null, liste(b?.niveaux), b?.actif !== false];
  const kit = id
    ? (await db.query("UPDATE boutique_kits SET nom = $2, description = $3, niveaux = $4, actif = $5 WHERE id = $6 AND school_id = $1 RETURNING *", [...vals, id])).rows[0]
    : (
        await db.query(
          `INSERT INTO boutique_kits (school_id, nom, description, niveaux, actif, ordre)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(ordre), 0) + 1 FROM boutique_kits WHERE school_id = $1)) RETURNING *`,
          vals
        )
      ).rows[0];
  if (!kit) throw new ApiError(404, "Liste introuvable");
  await db.query("DELETE FROM boutique_kit_articles WHERE kit_id = $1", [kit.id]);
  for (const x of items.filter((i) => valides.has(i.articleId))) {
    await db.query("INSERT INTO boutique_kit_articles (kit_id, article_id, quantite) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [kit.id, x.articleId, x.quantite]);
  }
  return kit;
};

router.post("/gestion/kits", async (req, res, next) => {
  try {
    const kit = await ecrireKit(exigerGestion(req.user), null, req.body);
    res.status(201).json({ success: true, data: kit });
  } catch (e) {
    next(e);
  }
});
router.put("/gestion/kits/:id", async (req, res, next) => {
  try {
    const kit = await ecrireKit(exigerGestion(req.user), entier(req.params.id), req.body);
    res.json({ success: true, data: kit });
  } catch (e) {
    next(e);
  }
});
router.delete("/gestion/kits/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM boutique_kits WHERE id = $1 AND school_id = $2", [entier(req.params.id), exigerGestion(req.user)]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/boutique/commandes/:id/etat { etat: 'prete' | 'remise' }
router.post("/commandes/:id/etat", async (req, res, next) => {
  try {
    const c = await exigerCommande(req.user, entier(req.params.id), ["etablissement"]);
    const etat = req.body?.etat;
    const avant = { prete: ["payee"], remise: ["payee", "prete"] }[etat];
    if (!avant) throw new ApiError(400, "État invalide");
    const r = await db.query(
      `UPDATE boutique_commandes SET statut = $2, ${etat === "prete" ? "prete_le" : "remise_le"} = NOW(), traite_par = $3
       WHERE id = $1 AND statut = ANY($4)`,
      [c.id, etat, req.user.id, avant]
    );
    if (!r.rowCount) throw new ApiError(400, c.statut === "a_payer" ? "Confirmez d’abord la réception du paiement" : "Commande déjà traitée");
    if (c.cree_par) {
      await notifierUtilisateur(c.cree_par, {
        title: etat === "prete" ? "Commande prête" : "Commande remise",
        message:
          etat === "prete"
            ? `Commande n° ${c.id} de ${c.prenom} ${c.nom} (${fcfa(c.montant)}) : elle est prête, à retirer à l’établissement.`
            : `Commande n° ${c.id} de ${c.prenom} ${c.nom} : remise. Merci.`,
        type: "payment",
        data: { lien: `/boutique/commandes/${c.id}` },
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
