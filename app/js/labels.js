// Vocabulaire affiché : à adapter au public (collège, lycée, université, centre de formation).
// Exemple pour le secondaire : { one: "élève", many: "élèves" }. Les deux mots doivent être masculins
// ou épicènes (les phrases utilisent « un », « Aucun »).
const AUDIENCE = { one: "étudiant", many: "étudiants" };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const L = { ...AUDIENCE, One: cap(AUDIENCE.one), Many: cap(AUDIENCE.many) };
