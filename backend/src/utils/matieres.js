// utils/matieres.js
// Matieres de chaque etablissement : la liste camerounaise habituelle est creee
// automatiquement la premiere fois.
const db = require("../config/db");

const MATIERES_PAR_DEFAUT = [
  "Mathématiques", "Français", "Anglais", "Histoire", "Géographie", "Éducation civique (ECM)",
  "Sciences de la vie et de la Terre (SVT)", "Physique", "Chimie", "Technologie (PCT)", "Informatique",
  "Philosophie", "Espagnol", "Allemand", "Langues et cultures nationales", "Littérature",
  "Économie", "Éducation physique et sportive (EPS)", "Travail manuel", "Arts plastiques",
];
const slug = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 10);

const matieresEcole = async (ecole) => {
  let { rows } = await db.query("SELECT id, name FROM subjects WHERE school_id = $1 AND is_active = true ORDER BY name", [ecole]);
  if (!rows.length) {
    for (const nom of MATIERES_PAR_DEFAUT) {
      await db.query(
        "INSERT INTO subjects (name, code, school_id, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (code) DO NOTHING",
        [nom, `${ecole}-${slug(nom)}`, ecole]
      );
    }
    ({ rows } = await db.query("SELECT id, name FROM subjects WHERE school_id = $1 AND is_active = true ORDER BY name", [ecole]));
  }
  return rows;
};

module.exports = { matieresEcole, MATIERES_PAR_DEFAUT, slug };
