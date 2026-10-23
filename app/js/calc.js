// Règles métier pures (sans DOM ni réseau) : testées par tests/calc.test.mjs.

/**
 * Moyenne pondérée = somme(note × coefficient) / somme(coefficients des matières notées).
 * Une matière sans note est ignorée (jamais comptée comme 0).
 * @param {{value:number, coefficient:number}[]} grades
 * @returns {number|null} null si aucune note
 */
export function weightedAverage(grades) {
  let total = 0;
  let coefs = 0;
  for (const g of grades) {
    if (g == null || g.value == null || g.coefficient == null) continue;
    total += Number(g.value) * Number(g.coefficient);
    coefs += Number(g.coefficient);
  }
  if (coefs === 0) return null;
  return Math.round((total / coefs) * 100) / 100;
}

/** Formate une moyenne ou une note pour l'affichage français. */
export function formatScore(n) {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Valide une note saisie (texte du formulaire). Accepte la virgule décimale.
 * @returns {{ok:true, value:number} | {ok:false, error:string}}
 */
export function parseGrade(raw) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return { ok: false, error: "Saisissez une note." };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: "La note doit être un nombre (2 décimales au plus)." };
  }
  const value = Number(text);
  if (value < 0 || value > 20) return { ok: false, error: "La note doit être comprise entre 0 et 20." };
  return { ok: true, value };
}

/** Valide un coefficient : entier strictement positif (1 à 100). */
export function parseCoefficient(raw) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: "Le coefficient doit être un nombre entier." };
  const value = Number(text);
  if (value < 1 || value > 100) return { ok: false, error: "Le coefficient doit être compris entre 1 et 100." };
  return { ok: true, value };
}

/** Valide un texte obligatoire (nom, code). */
export function parseText(raw, label, max = 100) {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (value === "") return { ok: false, error: `${label} est obligatoire.` };
  if (value.length > max) return { ok: false, error: `${label} : ${max} caractères au plus.` };
  return { ok: true, value };
}

/** Normalise pour la recherche : minuscules, sans accents. */
export function normalize(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Filtre par nom ou code étudiant. */
export function searchStudents(rows, query) {
  const q = normalize(query);
  if (!q) return rows;
  return rows.filter((r) => normalize(r.name).includes(q) || normalize(r.student_code).includes(q));
}

/**
 * Trie par moyenne ou par nom. Les étudiants sans moyenne sont toujours en dernier.
 * @param {"avg-desc"|"avg-asc"|"name"} mode
 */
export function sortStudents(rows, mode) {
  const byName = (a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  const copy = [...rows];
  if (mode === "name") return copy.sort(byName);
  const dir = mode === "avg-asc" ? 1 : -1;
  return copy.sort((a, b) => {
    if (a.average == null && b.average == null) return byName(a, b);
    if (a.average == null) return 1;
    if (b.average == null) return -1;
    return (a.average - b.average) * dir || byName(a, b);
  });
}

/** Traduit une erreur Supabase/Postgres/réseau en message lisible. */
export function errorMessage(err) {
  if (!err) return "Erreur inconnue.";
  const code = err.code;
  const msg = String(err.message ?? err);
  if (code === "23505") {
    if (msg.includes("students_owner_code_key")) return "Ce code étudiant existe déjà.";
    if (msg.includes("subjects_owner_name_key")) return "Cette matière existe déjà.";
    return "Cet élément existe déjà.";
  }
  if (code === "23514") return "Valeur refusée par la base (hors limites).";
  if (code === "42501") return "Accès refusé.";
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(msg)) return "Confirmez votre adresse e-mail avant de vous connecter.";
  if (/User already registered/i.test(msg)) return "Un compte existe déjà avec cet e-mail.";
  if (/Password should be/i.test(msg)) return "Mot de passe trop court (6 caractères minimum).";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
  return msg;
}
