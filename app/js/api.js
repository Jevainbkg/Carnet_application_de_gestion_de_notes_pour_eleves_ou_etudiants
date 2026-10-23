// Accès aux données : toutes les requêtes Supabase passent par ce module.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { weightedAverage } from "./calc.js";

export const isConfigured = /^https:\/\/.+/.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.includes("REMPLACER");

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Lève l'erreur Supabase pour qu'elle soit affichée par l'interface.
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- Authentification ----------
export const auth = {
  async session() {
    return unwrap(await supabase.auth.getSession()).session;
  },
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email, password }));
  },
  // role ("teacher" | "student") n'est qu'une préférence d'affichage : la sécurité est dans la base.
  async signUp(email, password, role) {
    return unwrap(await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: location.origin + location.pathname, data: { role } },
    }));
  },
  async signOut() {
    unwrap(await supabase.auth.signOut());
  },
  onChange(cb) {
    supabase.auth.onAuthStateChange((_event, session) => cb(session));
  },
};

// ---------- Étudiants ----------
export async function listStudentsWithAverages() {
  const [students, grades] = await Promise.all([
    supabase.from("students").select("id, name, student_code, user_id").order("name").then(unwrap),
    supabase.from("grades").select("student_id, value, subjects(coefficient)").then(unwrap),
  ]);
  const byStudent = new Map();
  for (const g of grades) {
    if (!byStudent.has(g.student_id)) byStudent.set(g.student_id, []);
    byStudent.get(g.student_id).push({ value: Number(g.value), coefficient: g.subjects.coefficient });
  }
  return students.map((s) => {
    const list = byStudent.get(s.id) ?? [];
    return { ...s, gradeCount: list.length, average: weightedAverage(list) };
  });
}

export async function getStudent(id) {
  return unwrap(await supabase.from("students").select("id, owner_id, name, student_code, user_id, access_code").eq("id", id).maybeSingle());
}

export async function saveStudent({ id, name, student_code }) {
  const q = id
    ? supabase.from("students").update({ name, student_code }).eq("id", id)
    : supabase.from("students").insert({ name, student_code });
  return unwrap(await q.select().single());
}

export async function deleteStudent(id) {
  unwrap(await supabase.from("students").delete().eq("id", id));
}

// ---------- Matières ----------
export async function listSubjects() {
  return unwrap(await supabase.from("subjects").select("id, owner_id, name, coefficient").order("name"));
}

export async function saveSubject({ id, name, coefficient }) {
  const q = id
    ? supabase.from("subjects").update({ name, coefficient }).eq("id", id)
    : supabase.from("subjects").insert({ name, coefficient });
  return unwrap(await q.select().single());
}

export async function deleteSubject(id) {
  unwrap(await supabase.from("subjects").delete().eq("id", id));
}

// ---------- Notes ----------
export async function gradesForStudent(studentId) {
  return unwrap(await supabase.from("grades").select("id, subject_id, value").eq("student_id", studentId));
}

export async function gradesForSubject(subjectId) {
  return unwrap(await supabase.from("grades").select("id, student_id, value").eq("subject_id", subjectId));
}

// Une seule note par couple étudiant/matière : ressaisir met à jour.
export async function upsertGrade(student_id, subject_id, value) {
  return unwrap(await supabase.from("grades")
    .upsert({ student_id, subject_id, value }, { onConflict: "student_id,subject_id" })
    .select().single());
}

export async function deleteGrade(student_id, subject_id) {
  unwrap(await supabase.from("grades").delete().eq("student_id", student_id).eq("subject_id", subject_id));
}

// ---------- Espace élève / étudiant (v1.1) ----------
// Fiches rattachées au compte connecté (vide pour un enseignant).
export async function myRecords(userId) {
  return unwrap(await supabase.from("students").select("id, owner_id, name, student_code").eq("user_id", userId).order("name"));
}

// Rattache le compte connecté à une fiche grâce au code donné par l'enseignant.
export async function claimStudent(code) {
  return unwrap(await supabase.rpc("claim_student", { p_code: code }));
}

// Révoque l'accès de l'élève et renvoie le nouveau code.
export async function resetStudentAccess(studentId) {
  return unwrap(await supabase.rpc("reset_student_access", { p_student: studentId }));
}
