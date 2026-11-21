// modules/actualites/routes.js
// Fil d'actualites de l'etablissement : annonces, evenements, conseils de
// discipline, resultats… Publie par l'administrateur de l'etablissement,
// visible par les utilisateurs de l'etablissement des la connexion.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

const TYPES = ["annonce", "evenement", "conseil_discipline", "resultats", "autre"];
// « interne » : document garde par l'etablissement (jamais affiche dans le fil)
const PUBLICS = ["tous", "parents", "eleves", "enseignants", "interne"];
const PUBLIC_DU_ROLE = { parent: "parents", student: "eleves", teacher: "enseignants" };
const LIBELLES = {
  annonce: "Annonce",
  evenement: "Événement",
  conseil_discipline: "Conseil de discipline",
  resultats: "Résultats",
  autre: "Information",
};
const texte = (v, max) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));

// GET /api/actualites/:id/image : l'image d'une publication, servie a part et
// gardee en cache par le telephone (elle n'est telechargee qu'une seule fois).
router.get("/:id/image", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT image FROM publications WHERE id = $1", [parseInt(req.params.id, 10) || 0]);
    const m = String(rows[0]?.image || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) throw new ApiError(404, "Image introuvable");
    res.set("Content-Type", m[1]);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(m[2], "base64"));
  } catch (e) {
    next(e);
  }
});

// GET /api/actualites/ecoles/:id/photo : photo de l'etablissement (mise en cache)
router.get("/ecoles/:id/photo", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT photo FROM schools WHERE id = $1 AND is_active", [parseInt(req.params.id, 10) || 0]);
    const m = String(rows[0]?.photo || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) throw new ApiError(404, "Photo introuvable");
    res.set("Content-Type", m[1]);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(m[2], "base64"));
  } catch (e) {
    next(e);
  }
});

router.use(authenticate);

const ecoleDe = (req) => {
  const id = req.user.role === "admin" ? parseInt(req.query.ecole, 10) : req.user.schoolId;
  if (!id) throw new ApiError(400, "Aucun établissement associé à votre compte");
  return id;
};
const peutPublier = (u) => u.role === "principal" || u.role === "admin";
// Les enseignants publient aussi dans le fil de leur etablissement (sauf les conseils de discipline)
const peutPoster = (u) => peutPublier(u) || u.role === "teacher";
const lireMedias = (liste) => {
  const { prefixePublic } = require("../medias/routes");
  const pre = prefixePublic();
  return (Array.isArray(liste) ? liste : [])
    .slice(0, 10)
    .filter((m) => ["image", "video", "document"].includes(m?.type) && typeof m.url === "string" && pre.length > 40 && m.url.startsWith(pre))
    .map((m) => ({
      type: m.type,
      url: m.url,
      ...(m.nom ? { nom: String(m.nom).slice(0, 120) } : {}),
      ...(m.type === "document" && typeof m.apercu === "string" && m.apercu.startsWith(pre) ? { apercu: m.apercu } : {}),
    }));
};

// Classes vues par un parent (celles de ses enfants) ou un eleve (la sienne) ; null pour le personnel (tout est visible)
const classesVues = async (u) => {
  if (u.role === "parent")
    return (
      await db.query(
        "SELECT DISTINCT cs.class_id FROM parent_student_links l JOIN class_students cs ON cs.student_id = l.student_id AND cs.status = 'active' WHERE l.parent_id = $1",
        [u.id]
      )
    ).rows.map((r) => r.class_id);
  if (u.role === "student")
    return (await db.query("SELECT class_id FROM class_students WHERE student_id = $1 AND status = 'active'", [u.id])).rows.map((r) => r.class_id);
  return null;
};

// Accuse de lecture : les parents et eleves qui ont vu une information (fil ou detail ouverts)
const marquerVues = (u, ids) => {
  if (!["parent", "student"].includes(u.role) || !ids.length) return;
  db.query(
    "INSERT INTO publication_vues (publication_id, user_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING",
    [ids, u.id]
  ).catch(() => {});
};

// GET /api/actualites?limite=20
router.get("/", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 30));
    const publicRole = PUBLIC_DU_ROLE[req.user.role];
    const { rows } = await db.query(
      `SELECT p.id, p.type, p.title, p.body, p.event_date, p.event_place, p.students, (p.image IS NOT NULL) AS a_image, p.audience,
              p.pinned, p.created_at, s.name AS school_name, p.medias
       FROM publications p JOIN schools s ON s.id = p.school_id
       WHERE p.school_id = $1 AND p.audience <> 'interne' AND ($2::text IS NULL OR p.audience IN ('tous', $2))
         AND ($4::int[] IS NULL OR p.class_id IS NULL OR p.class_id = ANY($4))
       ORDER BY p.pinned DESC, p.created_at DESC LIMIT $3`,
      [ecole, peutPublier(req.user) ? null : publicRole || "tous", limite, await classesVues(req.user)]
    );
    // L'image n'est plus recopiee dans la liste : seulement son adresse
    res.json({ success: true, data: rows.map(({ a_image, ...p }) => ({ ...p, image: a_image ? `/api/actualites/${p.id}/image` : null })) });
  } catch (e) {
    next(e);
  }
});

// Etablissements « a moi » : ceux de mes enfants, ou le mien
const mesEcoles = async (u) => {
  if (u.role === "parent") {
    const { rows } = await db.query(
      "SELECT DISTINCT e.school_id AS id FROM parent_student_links l JOIN users e ON e.id = l.student_id WHERE l.parent_id = $1 AND e.school_id IS NOT NULL",
      [u.id]
    );
    return rows.map((r) => r.id);
  }
  return u.schoolId ? [u.schoolId] : [];
};

// GET /api/actualites/fil?ecoles=1,2&avant=ISO : fil des etablissements DE L'UTILISATEUR seulement
// (ceux de ses enfants pour un parent, le sien pour le personnel et les eleves).
// Un etablissement ne voit jamais les documents d'un autre etablissement.
router.get("/fil", async (req, res, next) => {
  try {
    const miennes = await mesEcoles(req.user);
    const choisies = String(req.query.ecoles || "")
      .split(",")
      .map((x) => parseInt(x, 10))
      .filter((x) => x > 0)
      .slice(0, 30);
    const avant = /^\d{4}-\d{2}-\d{2}T/.test(req.query.avant || "") ? req.query.avant : null;
    const publicRole = PUBLIC_DU_ROLE[req.user.role] || "tous";
    const { rows } = await db.query(
      `SELECT p.id, p.type, p.title, p.body, p.event_date, p.event_place, p.students, (p.image IS NOT NULL) AS a_image, p.audience,
              p.pinned, p.created_at, p.school_id, s.name AS school_name, s.city AS school_city, (s.photo IS NOT NULL) AS a_photo,
              p.medias, p.categorie, p.source, CASE WHEN a.role = 'teacher' THEN a.first_name || ' ' || a.last_name END AS enseignant
       FROM publications p JOIN schools s ON s.id = p.school_id AND s.is_active LEFT JOIN users a ON a.id = p.author_id
       WHERE (cardinality($1::int[]) = 0 OR p.school_id = ANY($1))
         AND ($3::timestamp IS NULL OR p.created_at < $3)
         AND p.school_id = ANY($2) AND p.audience IN ('tous', $4)
         AND ($5::int[] IS NULL OR p.class_id IS NULL OR p.class_id = ANY($5))
       ORDER BY p.created_at DESC LIMIT 20`,
      [choisies, miennes, avant, publicRole, await classesVues(req.user)]
    );
    marquerVues(req.user, rows.map((r) => r.id));
    const noms = miennes.length
      ? (await db.query("SELECT id, name FROM schools WHERE id = ANY($1) AND is_active ORDER BY name", [miennes])).rows
      : [];
    res.json({
      success: true,
      data: {
        mesEcoles: miennes,
        ecoles: noms,
        publications: rows.map(({ a_image, a_photo, ...p }) => ({
          ...p,
          image: a_image ? `/api/actualites/${p.id}/image` : null,
          logo: a_photo ? `/api/actualites/ecoles/${p.school_id}/photo` : null,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/actualites/documents { titre, categorie, description, audience, fichiers: [{ type, url, nom }] }
// Etablissement et enseignants : tout document televerse (communique, emploi du temps,
// resultats, calendrier…) apparait automatiquement dans le fil d'informations.
router.post("/documents", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Réservé à l’établissement et aux enseignants");
    const { categorieDe, devinerCategorie } = require("../../utils/fil");
    const b = req.body || {};
    const medias = lireMedias(b.fichiers);
    if (!medias.length) throw new ApiError(400, "Ajoutez au moins un fichier");
    const titre = texte(b.titre, 200) || texte(medias[0].nom, 200) || "Document";
    const [cle, libelle, type] = categorieDe(b.categorie || devinerCategorie(`${titre} ${medias[0].nom || ""}`));
    const audience = PUBLICS.includes(b.audience) ? b.audience : "tous";
    const date = /^\d{4}-\d{2}-\d{2}/.test(b.dateEvenement || "") ? b.dateEvenement : null;
    // Le recapitulatif des absences (nominatif) est reserve aux familles de l'etablissement, et a l'administration
    if (cle === "absences" && req.user.role !== "principal") throw new ApiError(403, "Le récapitulatif des absences est publié par l’administration");
    // Classe visee : seuls ses parents et ses eleves voient le document (un enseignant : une de ses classes)
    let classe = null;
    if (b.classeId) {
      classe = (
        await db.query(
          `SELECT c.id FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id WHERE c.id = $1 AND ay.school_id = $2
             AND ($3::int IS NULL OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $3) OR c.class_teacher_id = $3)`,
          [parseInt(b.classeId, 10) || 0, req.user.schoolId, req.user.role === "teacher" ? req.user.id : null]
        )
      ).rows[0];
      if (!classe) throw new ApiError(404, "Classe introuvable");
    }
    const { rows } = await db.query(
      `INSERT INTO publications (school_id, author_id, type, title, body, audience, medias, categorie, source, event_date, event_place, class_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [req.user.schoolId, req.user.id, type, titre, texte(b.description, 2000) || null, audience, JSON.stringify(medias), libelle,
       cle === "absences" ? "prive" : "document", date, texte(b.lieu, 200) || null, classe?.id || null]
    );
    res.status(201).json({ success: true, data: { id: rows[0].id, categorie: cle } });
  } catch (e) {
    next(e);
  }
});

// POST /api/actualites/documents/analyser { url, mime, nom }
// Lecture du document par l'IA : categorie, titre, resume, date d'evenement ; et detection des
// documents qui n'ont pas leur place dans le fil (listes d'eleves, discipline, notes nominatives).
// Sans cle IA : categorie devinee d'apres le nom du fichier.
router.post("/documents/analyser", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Accès réservé");
    const { CATEGORIES, devinerCategorie } = require("../../utils/fil");
    const { prefixePublic } = require("../medias/routes");
    const url = String(req.body?.url || "");
    const nom = texte(req.body?.nom, 120);
    const repli = { categorie: devinerCategorie(nom), titre: nom.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim(), resume: "", ia: false };
    const mimeLu = String(req.body?.mime || "");
    // Seuls les PDF et les photos sont lus ; Word, Excel, PowerPoint : classes d'apres leur nom
    // L'IA ne lit que les photos et les PDF scannes : un document dont le texte a ete lu sur l'appareil (lu) est classe d'apres son nom
    if (req.body?.lu || !process.env.ANTHROPIC_API_KEY || !url.startsWith(prefixePublic()) || !(mimeLu === "application/pdf" || mimeLu.startsWith("image/"))) return res.json({ success: true, data: repli });
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || buf.length > 15 * 1024 * 1024) return res.json({ success: true, data: repli });
    const mime = String(req.body?.mime || "");
    const b64 = buf.toString("base64");
    const { lireDocument } = require("../../utils/ia");
    const liste = CATEGORIES.map((c) => c[0]).join(", ");
    const j = await require("../../utils/quota-ia").lireAvecQuota(req, "document", {
      images: mime.startsWith("image/") ? [`data:${mime === "image/png" ? "image/png" : mime === "image/webp" ? "image/webp" : "image/jpeg"};base64,${b64}`] : [],
      pdfs: mime === "application/pdf" ? [b64] : [],
      maxTokens: 800,
      consigne: `Tu aides un établissement scolaire camerounais. Ce document vient d'être téléversé pour être affiché aux familles.
Renvoie : {"nature": "information" | "absences" | "cahier_appel" | "liste_eleves" | "liste_enseignants" | "emploi_du_temps" | "frais" | "discipline" | "notes_nominatives" | "interne", "categorie": une valeur parmi [${liste}],
"titre": titre court et clair (max 80 caractères), "resume": 1 à 2 phrases utiles aux parents (max 250 caractères),
"date_evenement": "AAAA-MM-JJ" ou null, "lieu": texte ou null}.
"absences" : un récapitulatif des absences d'élèves (par mois, par séquence…) : categorie "absences".
"cahier_appel" : un cahier d'appel ou une feuille de présence d'une classe (élèves absents jour par jour, à reporter dans les absences).
"liste_enseignants" : liste du personnel enseignant (noms, matières, classes). "emploi_du_temps" : emploi du temps d'une ou plusieurs classes.
"frais" : liste ou barème des frais de scolarité avec montants. "interne" : document administratif réservé à l'établissement (budget, comptabilité, registre, service des enseignants, procès-verbal interne…) : categorie "administration".
"liste_eleves" : une liste nominative d'élèves sans autre information (liste de classe, effectifs nominatifs). "discipline" : sanctions, conseil de discipline,
exclusions. "notes_nominatives" : relevé de notes ou bulletins d'élèves nommés. Sinon "information".`,
    });
    res.json({
      success: true,
      data: {
        nature: ["liste_eleves", "liste_enseignants", "emploi_du_temps", "frais", "discipline", "notes_nominatives", "cahier_appel", "interne"].includes(j.nature) ? j.nature : "information",
        categorie: j.nature === "absences" ? "absences" : j.nature === "interne" ? "administration" : CATEGORIES.some((c) => c[0] === j.categorie) ? j.categorie : repli.categorie,
        titre: texte(j.titre, 200) || repli.titre,
        resume: texte(j.resume, 500),
        dateEvenement: /^\d{4}-\d{2}-\d{2}$/.test(j.date_evenement || "") ? j.date_evenement : null,
        lieu: texte(j.lieu, 120) || null,
        ia: true,
      },
    });
  } catch (e) {
    // En cas d'echec de la lecture, on retombe sur le nom du fichier
    const { devinerCategorie } = require("../../utils/fil");
    const nom = texte(req.body?.nom, 120);
    res.json({ success: true, data: { categorie: devinerCategorie(nom), titre: nom.replace(/\.[a-z0-9]+$/i, ""), resume: "", ia: false } });
  }
});

// POST /api/actualites/infos { genre: 'info'|'cours'|'evenement', titre, texte, classeId, date, heure, lieu, photos: [{type,url}], image }
// Une information a faire passer (cours supplementaire, changement de salle, reunion…), avec photos.
// Les cours supplementaires ne concernent que l'etablissement : visibles de ses seules familles.
router.post("/infos", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Réservé à l’établissement et aux enseignants");
    const b = req.body || {};
    const genre = ["info", "cours", "evenement"].includes(b.genre) ? b.genre : "info";
    const corps = texte(b.texte, 3000);
    if (!corps) throw new ApiError(400, "Écrivez l’information à faire passer");
    let classe = null;
    if (b.classeId) {
      classe = (
        await db.query(
          "SELECT c.id, c.name FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id WHERE c.id = $1 AND ay.school_id = $2",
          [parseInt(b.classeId, 10) || 0, req.user.schoolId]
        )
      ).rows[0];
      if (!classe) throw new ApiError(404, "Classe introuvable");
    }
    if (genre === "cours" && !classe) throw new ApiError(400, "Choisissez la classe du cours");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : null;
    const heure = /^\d{2}:\d{2}$/.test(b.heure || "") ? b.heure : null;
    const quand = date ? `${date}T${heure || "08:00"}:00` : null;
    const titre =
      texte(b.titre, 200) ||
      (genre === "cours" ? `Cours supplémentaire · ${classe.name}` : genre === "evenement" ? "Événement" : "Information") +
        (genre !== "cours" && classe ? ` · ${classe.name}` : "");
    const photos = lireMedias(b.photos).filter((m) => m.type === "image");
    const image = typeof b.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.image) && b.image.length < 700000 ? b.image : null;
    const { rows } = await db.query(
      `INSERT INTO publications (school_id, author_id, type, title, body, event_date, event_place, audience, medias, image, categorie, source, class_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'tous', $8, $9, $10, $11, $12) RETURNING id`,
      [
        req.user.schoolId,
        req.user.id,
        genre === "evenement" || genre === "cours" ? "evenement" : "annonce",
        titre,
        corps,
        quand,
        texte(b.lieu, 200) || null,
        JSON.stringify(photos),
        image,
        genre === "cours" ? "Cours supplémentaire" : genre === "evenement" ? "Événement" : "Information",
        genre === "cours" ? "prive" : "info",
        classe?.id || null,
      ]
    );
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (e) {
    next(e);
  }
});

// GET /api/actualites/documents : documents de l'etablissement (gestion)
router.get("/documents", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Accès réservé");
    const { rows } = await db.query(
      `SELECT p.id, p.title, p.categorie, p.audience, p.medias, p.created_at, p.author_id, u.first_name, u.last_name, p.class_id, c.name AS classe,
              (SELECT COUNT(*)::int FROM publication_vues v WHERE v.publication_id = p.id) AS vues
       FROM publications p LEFT JOIN users u ON u.id = p.author_id LEFT JOIN classes c ON c.id = p.class_id
       WHERE p.school_id = $1 AND p.source IN ('document', 'info', 'prive') ORDER BY p.created_at DESC LIMIT 100`,
      [req.user.schoolId]
    );
    res.json({ success: true, data: rows.map((r) => ({ ...r, mien: r.author_id === req.user.id })) });
  } catch (e) {
    next(e);
  }
});

// GET /api/actualites/:id/detail : une information complete (memes regles de visibilite que le fil)
router.get("/:id/detail", async (req, res, next) => {
  try {
    const miennes = await mesEcoles(req.user);
    const publicRole = PUBLIC_DU_ROLE[req.user.role] || "tous";
    const { rows } = await db.query(
      `SELECT p.id, p.type, p.title, p.body, p.event_date, p.event_place, p.students, (p.image IS NOT NULL) AS a_image, p.audience,
              p.created_at, p.school_id, s.name AS school_name, s.city AS school_city, p.medias, p.categorie, p.source,
              CASE WHEN a.role = 'teacher' THEN a.first_name || ' ' || a.last_name END AS enseignant
       FROM publications p JOIN schools s ON s.id = p.school_id LEFT JOIN users a ON a.id = p.author_id
       WHERE p.id = $1 AND ($4::boolean OR (p.school_id = ANY($2) AND p.audience IN ('tous', $3)
         AND ($5::int[] IS NULL OR p.class_id IS NULL OR p.class_id = ANY($5))))`,
      [parseInt(req.params.id, 10) || 0, miennes, publicRole, req.user.role === "admin", await classesVues(req.user)]
    );
    const p = rows[0];
    if (!p) {
      throw new ApiError(404, "Information introuvable");
    }
    marquerVues(req.user, [p.id]);
    const { a_image, ...reste } = p;
    res.json({ success: true, data: { ...reste, image: a_image ? `/api/actualites/${p.id}/image` : null } });
  } catch (e) {
    next(e);
  }
});

// POST /api/actualites (administrateur de l'etablissement)
router.post("/", async (req, res, next) => {
  try {
    // Le fil n'est plus alimente a la main : les documents televerses y apparaissent automatiquement
    if (req.user.role !== "admin") throw new ApiError(403, "Le fil se remplit automatiquement : téléversez un document (bouton + › Document)");
    const ecole = ecoleDe(req);
    const b = req.body || {};
    let type = TYPES.includes(b.type) ? b.type : "annonce";
    if (req.user.role === "teacher" && type === "conseil_discipline") type = "annonce";
    const medias = lireMedias(b.medias);
    const titre = texte(b.title, 200) || (medias.length || b.image ? "" : null);
    if (titre === null) throw new ApiError(400, "Ajoutez un titre, une photo ou une vidéo");
    const audience = PUBLICS.includes(b.audience) ? b.audience : "tous";
    const eleves = Array.isArray(b.students)
      ? b.students
          .slice(0, 200)
          .map((x) => ({ nom: texte(x.nom, 120), classe: texte(x.classe, 50), motif: texte(x.motif, 300) }))
          .filter((x) => x.nom)
      : null;
    if (type === "conseil_discipline" && (!eleves || !eleves.length)) {
      throw new ApiError(400, "Ajoutez au moins un élève");
    }
    let image = null;
    if (b.image) {
      image = String(b.image);
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 600000) throw new ApiError(400, "Image invalide ou trop lourde");
    }
    const { rows } = await db.query(
      `INSERT INTO publications (school_id, author_id, type, title, body, event_date, event_place, students, image, audience, pinned, medias)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        ecole,
        req.user.id,
        type,
        titre,
        texte(b.body, 10000) || null,
        b.eventDate || null,
        texte(b.eventPlace, 200) || null,
        eleves && eleves.length ? JSON.stringify(eleves) : null,
        image,
        audience,
        peutPublier(req.user) && Boolean(b.pinned),
        JSON.stringify(medias),
      ]
    );
    // Notification aux utilisateurs concernes de l'etablissement
    const roles = { tous: ["parent", "student", "teacher"], parents: ["parent"], eleves: ["student"], enseignants: ["teacher"] }[audience];
    await db
      .query(
        `INSERT INTO notifications (user_id, title, message, type, data)
         SELECT id, $2, $3, 'announcement', $4 FROM users
         WHERE school_id = $1 AND role = ANY($5) AND status = 'active' AND is_active = true`,
        [ecole, `${LIBELLES[type]}${titre ? ` : ${titre}` : ""}`, texte(b.body, 140) || titre || "Nouvelle publication", JSON.stringify({ lien: "/" }), roles]
      )
      .catch(() => {});
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!peutPoster(req.user)) throw new ApiError(403, "Action réservée à l'établissement");
    const ecole = ecoleDe(req);
    // L'enseignant ne retire que ses propres publications
    const r = await db.query("DELETE FROM publications WHERE id = $1 AND school_id = $2 AND ($3::int IS NULL OR author_id = $3)", [
      parseInt(req.params.id, 10),
      ecole,
      req.user.role === "teacher" ? req.user.id : null,
    ]);
    if (!r.rowCount) throw new ApiError(404, "Publication introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
