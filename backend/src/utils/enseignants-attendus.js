// utils/enseignants-attendus.js
// Liste des enseignants fournie par l'etablissement (nom, matieres, classes, professeur principal) :
// - l'enseignant qui cree son compte et figure dans la liste est valide automatiquement ;
// - l'enseignant deja inscrit est mis a jour (matieres, classes) des l'import de la liste.
const db = require("../config/db");
const { assurerAnneeScolaire } = require("./annees");

const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// Cle de comparaison : mots du nom et du prenom, sans accents ni majuscules, dans l'ordre alphabetique
// (« NGO Laure » et « Laure Ngo » donnent la meme cle)
const cle = (nom, prenom) =>
  sansAccent(`${nom || ""} ${prenom || ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
const decouper = (v) =>
  String(v || "")
    .split(/[,;/\n]+/)
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);
const slug = (t) => sansAccent(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

const matiereId = async (ecole, nom) => {
  const ex = await db.query("SELECT id FROM subjects WHERE school_id = $1 AND lower(name) = lower($2) LIMIT 1", [ecole, nom]);
  if (ex.rows[0]) return ex.rows[0].id;
  const { rows } = await db.query(
    "INSERT INTO subjects (name, code, school_id, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (code) DO UPDATE SET name = subjects.name RETURNING id",
    [nom.slice(0, 100), `${ecole}-${slug(nom)}`.slice(0, 20), ecole]
  );
  return rows[0].id;
};

// Affecte un enseignant a ses matieres et ses classes. La liste de l'etablissement fait foi :
// elle remplace l'enseignant precedent d'une meme matiere dans une meme classe.
const affecter = async (userId, ecole, matieres, classes, principalDe) => {
  const annee = await assurerAnneeScolaire(ecole);
  const classesTrouvees = [];
  const inconnues = [];
  for (const nom of classes) {
    const r = await db.query("SELECT id FROM classes WHERE academic_year_id = $1 AND lower(name) = lower($2) LIMIT 1", [annee.id, nom]);
    if (r.rows[0]) classesTrouvees.push(r.rows[0].id);
    else inconnues.push(nom);
  }
  const ids = [];
  for (const m of matieres) ids.push(await matiereId(ecole, m));
  if (ids.length && classesTrouvees.length) {
    await db.query(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, academic_year_id, is_active)
       SELECT c.id, s.id, $3, c.academic_year_id, true FROM classes c CROSS JOIN subjects s
       WHERE c.id = ANY($1) AND s.id = ANY($2)
       ON CONFLICT (class_id, subject_id, academic_year_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, is_active = true`,
      [classesTrouvees, ids, userId]
    );
  }
  if (principalDe) {
    for (const nom of decouper(principalDe)) {
      await db.query(
        `UPDATE classes c SET class_teacher_id = $3 FROM academic_years ay
         WHERE ay.id = c.academic_year_id AND ay.school_id = $1 AND c.academic_year_id = $4 AND lower(c.name) = lower($2)`,
        [ecole, nom, userId, annee.id]
      );
    }
  }
  return { classes: classesTrouvees.length, inconnues };
};

// Importe la liste : memorise chaque enseignant attendu ; met a jour ceux qui ont deja un compte
const importer = async (ecole, lignes) => {
  const res = { ajoutes: 0, misAJour: 0, comptesAffectes: 0, activés: 0, classesInconnues: [], ignorees: 0 };
  const inconnues = new Set();
  for (const l of lignes.slice(0, 1000)) {
    const nom = String(l.nom || "").trim().slice(0, 100);
    const prenom = String(l.prenom || "").trim().slice(0, 100);
    if (!nom) {
      res.ignorees += 1;
      continue;
    }
    const k = cle(nom, prenom);
    const matieres = decouper(l.matieres);
    const classes = decouper(l.classes);
    const principalDe = String(l.principalDe || "").trim();
    const existe = await db.query("SELECT id FROM enseignants_attendus WHERE school_id = $1 AND nom_cle = $2", [ecole, k]);
    const donnees = [ecole, k, nom, prenom, matieres.join(", "), classes.join(", "), principalDe || null, String(l.telephone || "").slice(0, 30) || null, String(l.email || "").trim().toLowerCase().slice(0, 255) || null];
    const { rows } = await db.query(
      `INSERT INTO enseignants_attendus (school_id, nom_cle, last_name, first_name, matieres, classes, principal_de, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (school_id, nom_cle) DO UPDATE SET last_name = EXCLUDED.last_name, first_name = EXCLUDED.first_name, matieres = EXCLUDED.matieres,
         classes = EXCLUDED.classes, principal_de = EXCLUDED.principal_de, phone = EXCLUDED.phone, email = EXCLUDED.email
       RETURNING id`,
      donnees
    );
    if (existe.rows[0]) res.misAJour += 1;
    else res.ajoutes += 1;
    // Compte deja cree par cet enseignant ?
    const comptes = await db.query("SELECT id, first_name, last_name, status FROM users WHERE school_id = $1 AND role = 'teacher'", [ecole]);
    const compte = comptes.rows.find((u) => cle(u.last_name, u.first_name) === k);
    if (compte) {
      if (compte.status === "pending") {
        await db.query("UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1", [compte.id]);
        await db.query("UPDATE teacher_requests SET status = 'approved', decided_at = NOW() WHERE user_id = $1 AND status = 'pending'", [compte.id]);
        res.activés += 1;
      }
      const a = await affecter(compte.id, ecole, matieres, classes, principalDe);
      a.inconnues.forEach((c) => inconnues.add(c));
      await db.query("UPDATE enseignants_attendus SET user_id = $2 WHERE id = $1", [rows[0].id, compte.id]);
      res.comptesAffectes += 1;
    } else {
      // Les classes qui n'existent pas encore sont signalees
      const annee = await assurerAnneeScolaire(ecole);
      for (const c of classes) {
        const r = await db.query("SELECT 1 FROM classes WHERE academic_year_id = $1 AND lower(name) = lower($2)", [annee.id, c]);
        if (!r.rows[0]) inconnues.add(c);
      }
    }
  }
  res.classesInconnues = [...inconnues].slice(0, 50);
  return res;
};

// A la creation d'un compte enseignant : est-il dans la liste de l'etablissement ?
// Si oui : compte valide tout de suite, matieres et classes affectees.
const reconnaitre = async (ecole, userId, nom, prenom) => {
  const k = cle(nom, prenom);
  const { rows } = await db.query("SELECT * FROM enseignants_attendus WHERE school_id = $1 AND nom_cle = $2", [ecole, k]);
  const a = rows[0];
  if (!a) return null;
  await db.query("UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1", [userId]);
  await db.query("UPDATE teacher_requests SET status = 'approved', decided_at = NOW() WHERE user_id = $1 AND status = 'pending'", [userId]);
  await db.query("UPDATE enseignants_attendus SET user_id = $2 WHERE id = $1", [a.id, userId]);
  await affecter(userId, ecole, decouper(a.matieres), decouper(a.classes), a.principal_de);
  return a;
};

module.exports = { cle, decouper, importer, reconnaitre, affecter, matiereId, sansAccent };
