// Faux client Supabase en mémoire, utilisé UNIQUEMENT par le test d'interface (tests/e2e/ui.test.mjs).
// Reproduit le sous-ensemble d'API utilisé par app/js/api.js, les contraintes SQL et l'isolation par enseignant.
const db = { users: [], students: [], subjects: [], grades: [] };
let current = null;
const listeners = [];
const uid = () => crypto.randomUUID();
const err = (code, message) => ({ code, message });

function owned(table, row) {
  if (table === "grades") {
    const s = db.students.find((x) => x.id === row.student_id);
    const m = db.subjects.find((x) => x.id === row.subject_id);
    return s && m && s.owner_id === current?.id && m.owner_id === current?.id;
  }
  return row.owner_id === current?.id;
}

function check(table, row) {
  if (table === "grades") {
    if (!(row.value >= 0 && row.value <= 20)) return err("23514", "grades_value_check");
    if (!owned(table, row)) return err("42501", "row-level security");
    const dup = db.grades.find((g) => g.id !== row.id && g.student_id === row.student_id && g.subject_id === row.subject_id);
    if (dup) return err("23505", "grades_student_subject_key");
  }
  if (table === "subjects") {
    if (!Number.isInteger(row.coefficient) || row.coefficient < 1 || row.coefficient > 100) return err("23514", "coefficient");
    if (db.subjects.find((s) => s.id !== row.id && s.owner_id === row.owner_id && s.name === row.name)) return err("23505", "subjects_owner_name_key");
  }
  if (table === "students") {
    if (db.students.find((s) => s.id !== row.id && s.owner_id === row.owner_id && s.student_code === row.student_code)) return err("23505", "students_owner_code_key");
  }
  return null;
}

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = "select"; this.mode = "many"; this.joinSubjects = false; }
  select(cols = "*") { if (this.op === "select") this.op = "select"; this.joinSubjects = cols.includes("subjects("); this.returning = true; return this; }
  order(col) { this.orderBy = col; return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  insert(row) { this.op = "insert"; this.payload = row; return this; }
  update(row) { this.op = "update"; this.payload = row; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(row) { this.op = "upsert"; this.payload = row; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then(resolve, reject) { return new Promise((r) => setTimeout(r, 30)).then(() => this.run()).then(resolve, reject); }

  visible() {
    return db[this.table].filter((r) => owned(this.table, r) && this.filters.every(([c, v]) => r[c] === v));
  }

  run() {
    if (!current) return { data: null, error: err("42501", "not authenticated") };
    const t = this.table;
    let rows;
    if (this.op === "select") {
      rows = this.visible().map((r) => ({ ...r }));
      if (this.joinSubjects) rows.forEach((r) => (r.subjects = { coefficient: db.subjects.find((m) => m.id === r.subject_id).coefficient }));
      if (this.orderBy) rows.sort((a, b) => String(a[this.orderBy]).localeCompare(String(b[this.orderBy])));
    } else if (this.op === "insert" || this.op === "upsert") {
      const existing = this.op === "upsert" && db.grades.find((g) => g.student_id === this.payload.student_id && g.subject_id === this.payload.subject_id && owned(t, g));
      if (existing) {
        const next = { ...existing, ...this.payload };
        const e = check(t, next); if (e) return { data: null, error: e };
        Object.assign(existing, this.payload); rows = [{ ...existing }];
      } else {
        const row = { id: uid(), ...this.payload };
        if (t !== "grades") row.owner_id = current.id;
        const e = check(t, row); if (e) return { data: null, error: e };
        db[t].push(row); rows = [{ ...row }];
      }
    } else if (this.op === "update") {
      rows = [];
      for (const r of this.visible()) {
        const next = { ...r, ...this.payload, owner_id: r.owner_id };
        const e = check(t, next); if (e) return { data: null, error: e };
        Object.assign(r, next); rows.push({ ...r });
      }
    } else if (this.op === "delete") {
      const ids = new Set(this.visible().map((r) => r.id));
      db[t] = db[t].filter((r) => !ids.has(r.id));
      if (t === "students") db.grades = db.grades.filter((g) => !ids.has(g.student_id));
      if (t === "subjects") db.grades = db.grades.filter((g) => !ids.has(g.subject_id));
      return { data: null, error: null };
    }
    if (this.mode === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: err("PGRST116", "no row") };
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

const emit = () => listeners.forEach((cb) => cb("CHANGE", current ? { user: current } : null));

export function createClient() {
  return {
    from: (table) => new Query(table),
    auth: {
      async getSession() { return { data: { session: current ? { user: current } : null }, error: null }; },
      async signUp({ email, password }) {
        if (db.users.find((u) => u.email === email)) return { data: null, error: { message: "User already registered" } };
        const u = { id: uid(), email, password }; db.users.push(u); current = u; emit();
        return { data: { session: { user: u } }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = db.users.find((x) => x.email === email && x.password === password);
        if (!u) return { data: null, error: { message: "Invalid login credentials" } };
        current = u; emit(); return { data: { session: { user: u } }, error: null };
      },
      async signOut() { current = null; emit(); return { error: null }; },
      onAuthStateChange(cb) { listeners.push(cb); },
    },
  };
}
