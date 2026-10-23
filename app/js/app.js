// Interface : routeur par hash et écrans. Aucune règle métier ici (voir calc.js).
import * as api from "./api.js";
import {
  weightedAverage, formatScore, parseGrade, parseCoefficient, parseText,
  searchStudents, sortStudents, errorMessage,
} from "./calc.js";

const view = document.getElementById("view");
const nav = document.getElementById("nav");
const account = document.getElementById("account");
const toastEl = document.getElementById("toast");

let session = null;
const ui = { query: "", sort: "avg-desc", subjectId: "" }; // préférences d'écran conservées entre les vues

// ---------- Utilitaires ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function render(html, title) {
  view.innerHTML = html;
  document.title = `${title} — Carnet`;
}

function loading(label = "Chargement…") {
  view.innerHTML = `<p class="state state--loading" role="status">${esc(label)}</p>`;
}

function showError(err, retry) {
  view.innerHTML = `
    <div class="state state--error" role="alert">
      <p><strong>Impossible de charger les données.</strong></p>
      <p>${esc(errorMessage(err))}</p>
      <button type="button" class="btn" id="retry">Réessayer</button>
    </div>`;
  view.querySelector("#retry").addEventListener("click", retry);
}

let toastTimer;
function toast(message, kind = "ok") {
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3500);
}

// Empêche la double soumission et affiche l'état "en cours".
async function busy(button, task) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "…";
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = label;
  }
}

function fieldError(form, name, message) {
  const input = form.elements[name];
  const slot = form.querySelector(`[data-error-for="${name}"]`);
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  if (slot) slot.textContent = message ?? "";
}

function clearErrors(form) {
  form.querySelectorAll("[data-error-for]").forEach((el) => (el.textContent = ""));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
  const g = form.querySelector(".form-error");
  if (g) g.textContent = "";
}

function formError(form, err) {
  const g = form.querySelector(".form-error");
  if (g) g.textContent = errorMessage(err);
}

// ---------- Routeur ----------
const routes = {
  connexion: viewLogin,
  etudiants: viewStudents,
  etudiant: viewStudent,
  matieres: viewSubjects,
  notes: viewGrades,
};

function currentRoute() {
  const [, name = "", param] = location.hash.split("/");
  return { name: routes[name] ? name : "", param };
}

async function router() {
  let { name, param } = currentRoute();
  if (!session && name !== "connexion") return void (location.hash = "#/connexion");
  if (session && (name === "connexion" || name === "")) return void (location.hash = "#/etudiants");

  nav.hidden = !session;
  account.hidden = !session;
  nav.querySelectorAll("a").forEach((a) => {
    const active = a.dataset.route === name || (name === "etudiant" && a.dataset.route === "etudiants");
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  await routes[name](param);
  view.focus({ preventScroll: true });
}

// ---------- Connexion ----------
function viewLogin() {
  render(`
    <section class="auth">
      <h1>Connexion enseignant</h1>
      <p class="muted">Chaque enseignant ne voit que ses propres étudiants, matières et notes.</p>
      <div class="tabs" role="tablist" aria-label="Mode">
        <button type="button" role="tab" id="tab-in" aria-selected="true" aria-controls="auth-form">Se connecter</button>
        <button type="button" role="tab" id="tab-up" aria-selected="false" aria-controls="auth-form">Créer un compte</button>
      </div>
      <form id="auth-form" class="card form" novalidate>
        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email" required>
          <p class="field__error" data-error-for="email"></p>
        </div>
        <div class="field">
          <label for="password">Mot de passe</label>
          <input id="password" name="password" type="password" autocomplete="current-password" minlength="6" required>
          <p class="field__error" data-error-for="password"></p>
        </div>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn" id="auth-submit">Se connecter</button>
      </form>
    </section>`, "Connexion");

  const form = view.querySelector("#auth-form");
  const submit = view.querySelector("#auth-submit");
  let mode = "in";
  const setMode = (m) => {
    mode = m;
    view.querySelector("#tab-in").setAttribute("aria-selected", String(m === "in"));
    view.querySelector("#tab-up").setAttribute("aria-selected", String(m === "up"));
    submit.textContent = m === "in" ? "Se connecter" : "Créer le compte";
    form.elements.password.autocomplete = m === "in" ? "current-password" : "new-password";
    clearErrors(form);
  };
  view.querySelector("#tab-in").addEventListener("click", () => setMode("in"));
  view.querySelector("#tab-up").addEventListener("click", () => setMode("up"));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    let ok = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldError(form, "email", "Saisissez un e-mail valide."); ok = false; }
    if (password.length < 6) { fieldError(form, "password", "6 caractères minimum."); ok = false; }
    if (!ok) return;
    busy(submit, async () => {
      try {
        if (mode === "in") {
          await api.auth.signIn(email, password);
        } else {
          const res = await api.auth.signUp(email, password);
          if (!res.session) toast("Compte créé. Confirmez votre e-mail puis connectez-vous.");
        }
      } catch (err) {
        formError(form, err);
      }
    });
  });
}

// ---------- Étudiants ----------
async function viewStudents() {
  loading();
  let rows;
  try {
    rows = await api.listStudentsWithAverages();
  } catch (err) {
    return showError(err, viewStudents);
  }

  render(`
    <div class="page-head">
      <h1>Étudiants</h1>
      <p class="muted">${rows.length} étudiant${rows.length > 1 ? "s" : ""}</p>
    </div>

    <form id="student-form" class="card form form--inline" novalidate>
      <h2 class="form__title" id="student-form-title">Ajouter un étudiant</h2>
      <input type="hidden" name="id">
      <div class="field">
        <label for="s-name">Nom</label>
        <input id="s-name" name="name" maxlength="100" autocomplete="off" required placeholder="Étudiant Démo">
        <p class="field__error" data-error-for="name"></p>
      </div>
      <div class="field field--sm">
        <label for="s-code">Code étudiant</label>
        <input id="s-code" name="student_code" maxlength="30" autocomplete="off" required placeholder="E001">
        <p class="field__error" data-error-for="student_code"></p>
      </div>
      <div class="form__actions">
        <button type="submit" class="btn" id="student-submit">Ajouter</button>
        <button type="button" class="btn btn--ghost" id="student-cancel" hidden>Annuler</button>
      </div>
      <p class="form-error" role="alert"></p>
    </form>

    <div class="toolbar">
      <div class="field">
        <label for="search">Rechercher</label>
        <input id="search" type="search" placeholder="Nom ou code" value="${esc(ui.query)}">
      </div>
      <div class="field field--sm">
        <label for="sort">Trier par</label>
        <select id="sort">
          <option value="avg-desc">Moyenne décroissante</option>
          <option value="avg-asc">Moyenne croissante</option>
          <option value="name">Nom (A → Z)</option>
        </select>
      </div>
    </div>
    <div id="student-list"></div>`, "Étudiants");

  const form = view.querySelector("#student-form");
  const submit = view.querySelector("#student-submit");
  const cancel = view.querySelector("#student-cancel");
  const list = view.querySelector("#student-list");
  const sortEl = view.querySelector("#sort");
  sortEl.value = ui.sort;

  const resetForm = () => {
    form.reset();
    form.elements.id.value = "";
    view.querySelector("#student-form-title").textContent = "Ajouter un étudiant";
    submit.textContent = "Ajouter";
    cancel.hidden = true;
    clearErrors(form);
  };

  function drawList() {
    const shown = sortStudents(searchStudents(rows, ui.query), ui.sort);
    if (rows.length === 0) {
      list.innerHTML = `<p class="state state--empty">Aucun étudiant pour l'instant. Ajoutez-en un avec le formulaire ci-dessus.</p>`;
      return;
    }
    if (shown.length === 0) {
      list.innerHTML = `<p class="state state--empty">Aucun étudiant ne correspond à « ${esc(ui.query)} ».</p>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <caption class="sr-only">Liste des étudiants et moyennes pondérées</caption>
          <thead><tr><th scope="col">Nom</th><th scope="col">Code</th><th scope="col" class="num">Notes</th><th scope="col" class="num">Moyenne</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            ${shown.map((s) => `
              <tr>
                <th scope="row"><a href="#/etudiant/${esc(s.id)}">${esc(s.name)}</a></th>
                <td data-label="Code">${esc(s.student_code)}</td>
                <td data-label="Notes" class="num">${s.gradeCount}</td>
                <td data-label="Moyenne" class="num"><span class="score ${scoreClass(s.average)}">${formatScore(s.average)}</span></td>
                <td class="actions">
                  <button type="button" class="btn btn--ghost btn--sm" data-edit="${esc(s.id)}">Modifier</button>
                  <button type="button" class="btn btn--danger btn--sm" data-delete="${esc(s.id)}">Retirer</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }
  drawList();

  view.querySelector("#search").addEventListener("input", (e) => { ui.query = e.target.value; drawList(); });
  sortEl.addEventListener("change", (e) => { ui.sort = e.target.value; drawList(); });
  cancel.addEventListener("click", resetForm);

  list.addEventListener("click", (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delBtn = e.target.closest("[data-delete]");
    if (editId) {
      const s = rows.find((r) => r.id === editId);
      form.elements.id.value = s.id;
      form.elements.name.value = s.name;
      form.elements.student_code.value = s.student_code;
      view.querySelector("#student-form-title").textContent = `Modifier ${s.name}`;
      submit.textContent = "Enregistrer";
      cancel.hidden = false;
      form.elements.name.focus();
    }
    if (delBtn) {
      const s = rows.find((r) => r.id === delBtn.dataset.delete);
      if (!confirm(`Retirer ${s.name} ? Ses ${s.gradeCount} note(s) seront aussi supprimées.`)) return;
      busy(delBtn, async () => {
        try {
          await api.deleteStudent(s.id);
          toast(`${s.name} a été retiré.`);
          viewStudents();
        } catch (err) {
          toast(errorMessage(err), "error");
        }
      });
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = parseText(form.elements.name.value, "Le nom");
    const code = parseText(form.elements.student_code.value, "Le code", 30);
    if (!name.ok) fieldError(form, "name", name.error);
    if (!code.ok) fieldError(form, "student_code", code.error);
    if (!name.ok || !code.ok) return;
    const id = form.elements.id.value || undefined;
    busy(submit, async () => {
      try {
        await api.saveStudent({ id, name: name.value, student_code: code.value });
        toast(id ? "Étudiant modifié." : "Étudiant ajouté.");
        viewStudents();
      } catch (err) {
        formError(form, err);
      }
    });
  });
}

function scoreClass(n) {
  if (n == null) return "score--none";
  return n >= 10 ? "score--pass" : "score--fail";
}

// ---------- Fiche étudiant (relevé) ----------
async function viewStudent(id) {
  loading();
  let student, subjects, grades;
  try {
    [student, subjects, grades] = await Promise.all([api.getStudent(id), api.listSubjects(), api.gradesForStudent(id)]);
  } catch (err) {
    return showError(err, () => viewStudent(id));
  }
  if (!student) {
    return render(`<div class="state state--empty"><p>Étudiant introuvable.</p><a class="btn" href="#/etudiants">Retour à la liste</a></div>`, "Introuvable");
  }

  const bySubject = new Map(grades.map((g) => [g.subject_id, Number(g.value)]));
  const lines = subjects.map((m) => ({ ...m, value: bySubject.has(m.id) ? bySubject.get(m.id) : null }));
  const graded = lines.filter((l) => l.value != null);
  const average = weightedAverage(graded.map((l) => ({ value: l.value, coefficient: l.coefficient })));
  const totalCoef = graded.reduce((s, l) => s + l.coefficient, 0);

  render(`
    <p class="breadcrumb"><a href="#/etudiants">← Étudiants</a></p>
    <article class="report card">
      <header class="report__head">
        <div>
          <h1>${esc(student.name)}</h1>
          <p class="muted">Code ${esc(student.student_code)} · relevé de notes</p>
        </div>
        <div class="report__avg">
          <span class="report__avg-label">Moyenne pondérée</span>
          <span class="report__avg-value score ${scoreClass(average)}">${formatScore(average)}</span>
          <span class="muted small">${graded.length} matière${graded.length > 1 ? "s" : ""} notée${graded.length > 1 ? "s" : ""} sur ${subjects.length}</span>
        </div>
      </header>
      ${subjects.length === 0
        ? `<p class="state state--empty">Aucune matière. <a href="#/matieres">Créez d'abord des matières.</a></p>`
        : `<div class="table-wrap"><table class="table">
            <caption class="sr-only">Relevé de notes de ${esc(student.name)}</caption>
            <thead><tr><th scope="col">Matière</th><th scope="col" class="num">Coef.</th><th scope="col" class="num">Note /20</th><th scope="col" class="num">Points</th></tr></thead>
            <tbody>
              ${lines.map((l) => `
                <tr>
                  <th scope="row">${esc(l.name)}</th>
                  <td data-label="Coef." class="num">${l.coefficient}</td>
                  <td data-label="Note /20" class="num">${l.value == null ? `<span class="tag">non notée</span>` : formatScore(l.value)}</td>
                  <td data-label="Points" class="num">${l.value == null ? "—" : formatScore(l.value * l.coefficient)}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot><tr><th scope="row">Total (matières notées)</th><td class="num">${totalCoef}</td><td></td><td class="num">${formatScore(graded.reduce((s, l) => s + l.value * l.coefficient, 0))}</td></tr></tfoot>
          </table></div>
          <p class="muted small">Moyenne = somme(note × coefficient) ÷ somme des coefficients des matières notées. Les matières non notées ne comptent pas comme 0.</p>`}
      <div class="report__actions no-print">
        <a class="btn" href="#/notes">Saisir des notes</a>
        <button type="button" class="btn btn--ghost" id="print">Imprimer / PDF</button>
      </div>
    </article>`, student.name);

  view.querySelector("#print").addEventListener("click", () => window.print());
}

// ---------- Matières ----------
async function viewSubjects() {
  loading();
  let subjects;
  try {
    subjects = await api.listSubjects();
  } catch (err) {
    return showError(err, viewSubjects);
  }

  render(`
    <div class="page-head"><h1>Matières</h1><p class="muted">Le coefficient est un entier de 1 à 100.</p></div>
    <form id="subject-form" class="card form form--inline" novalidate>
      <h2 class="form__title" id="subject-form-title">Créer une matière</h2>
      <input type="hidden" name="id">
      <div class="field">
        <label for="m-name">Nom de la matière</label>
        <input id="m-name" name="name" maxlength="100" autocomplete="off" required placeholder="Mathématiques">
        <p class="field__error" data-error-for="name"></p>
      </div>
      <div class="field field--xs">
        <label for="m-coef">Coefficient</label>
        <input id="m-coef" name="coefficient" type="number" inputmode="numeric" min="1" max="100" step="1" required value="1">
        <p class="field__error" data-error-for="coefficient"></p>
      </div>
      <div class="form__actions">
        <button type="submit" class="btn" id="subject-submit">Créer</button>
        <button type="button" class="btn btn--ghost" id="subject-cancel" hidden>Annuler</button>
      </div>
      <p class="form-error" role="alert"></p>
    </form>
    ${subjects.length === 0
      ? `<p class="state state--empty">Aucune matière pour l'instant.</p>`
      : `<div class="table-wrap"><table class="table">
          <caption class="sr-only">Liste des matières</caption>
          <thead><tr><th scope="col">Matière</th><th scope="col" class="num">Coefficient</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${subjects.map((m) => `
            <tr>
              <th scope="row">${esc(m.name)}</th>
              <td data-label="Coefficient" class="num">${m.coefficient}</td>
              <td class="actions">
                <button type="button" class="btn btn--ghost btn--sm" data-edit="${esc(m.id)}">Modifier</button>
                <button type="button" class="btn btn--danger btn--sm" data-delete="${esc(m.id)}">Supprimer</button>
              </td>
            </tr>`).join("")}</tbody>
        </table></div>`}`, "Matières");

  const form = view.querySelector("#subject-form");
  const submit = view.querySelector("#subject-submit");
  const cancel = view.querySelector("#subject-cancel");
  cancel.addEventListener("click", () => {
    form.reset(); form.elements.id.value = ""; clearErrors(form);
    view.querySelector("#subject-form-title").textContent = "Créer une matière";
    submit.textContent = "Créer"; cancel.hidden = true;
  });

  view.querySelector(".table")?.addEventListener("click", (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delBtn = e.target.closest("[data-delete]");
    if (editId) {
      const m = subjects.find((s) => s.id === editId);
      form.elements.id.value = m.id;
      form.elements.name.value = m.name;
      form.elements.coefficient.value = m.coefficient;
      view.querySelector("#subject-form-title").textContent = `Modifier ${m.name}`;
      submit.textContent = "Enregistrer"; cancel.hidden = false;
      form.elements.name.focus();
    }
    if (delBtn) {
      const m = subjects.find((s) => s.id === delBtn.dataset.delete);
      if (!confirm(`Supprimer la matière ${m.name} ? Toutes ses notes seront supprimées.`)) return;
      busy(delBtn, async () => {
        try { await api.deleteSubject(m.id); toast("Matière supprimée."); viewSubjects(); }
        catch (err) { toast(errorMessage(err), "error"); }
      });
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = parseText(form.elements.name.value, "Le nom");
    const coef = parseCoefficient(form.elements.coefficient.value);
    if (!name.ok) fieldError(form, "name", name.error);
    if (!coef.ok) fieldError(form, "coefficient", coef.error);
    if (!name.ok || !coef.ok) return;
    const id = form.elements.id.value || undefined;
    busy(submit, async () => {
      try {
        await api.saveSubject({ id, name: name.value, coefficient: coef.value });
        toast(id ? "Matière modifiée." : "Matière créée.");
        viewSubjects();
      } catch (err) { formError(form, err); }
    });
  });
}

// ---------- Saisie des notes ----------
async function viewGrades() {
  loading();
  let subjects, students;
  try {
    [subjects, students] = await Promise.all([api.listSubjects(), api.listStudentsWithAverages()]);
  } catch (err) {
    return showError(err, viewGrades);
  }
  if (subjects.length === 0 || students.length === 0) {
    return render(`
      <div class="page-head"><h1>Saisie des notes</h1></div>
      <p class="state state--empty">Il faut au moins un étudiant et une matière.
        ${students.length === 0 ? `<a href="#/etudiants">Ajouter un étudiant</a>` : ""}
        ${subjects.length === 0 ? `<a href="#/matieres">Créer une matière</a>` : ""}</p>`, "Saisie des notes");
  }
  if (!subjects.some((m) => m.id === ui.subjectId)) ui.subjectId = subjects[0].id;
  students.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  render(`
    <div class="page-head"><h1>Saisie des notes</h1><p class="muted">Note de 0 à 20, deux décimales au plus. Laisser vide puis « Effacer » pour retirer une note.</p></div>
    <div class="toolbar">
      <div class="field">
        <label for="subject">Matière</label>
        <select id="subject">${subjects.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (coef. ${m.coefficient})</option>`).join("")}</select>
      </div>
    </div>
    <div id="grade-list"></div>`, "Saisie des notes");

  const select = view.querySelector("#subject");
  const list = view.querySelector("#grade-list");
  select.value = ui.subjectId;

  async function drawGrades() {
    list.innerHTML = `<p class="state state--loading" role="status">Chargement des notes…</p>`;
    let grades;
    try {
      grades = await api.gradesForSubject(ui.subjectId);
    } catch (err) {
      list.innerHTML = `<p class="state state--error" role="alert">${esc(errorMessage(err))}</p>`;
      return;
    }
    const byStudent = new Map(grades.map((g) => [g.student_id, Number(g.value)]));
    list.innerHTML = `
      <ul class="grade-rows">
        ${students.map((s) => {
          const v = byStudent.get(s.id);
          const fid = `g-${s.id}`;
          return `
          <li class="grade-row card">
            <form class="grade-form" data-student="${esc(s.id)}" novalidate>
              <label for="${fid}" class="grade-row__name">${esc(s.name)} <span class="muted small">${esc(s.student_code)}</span></label>
              <input id="${fid}" name="value" type="text" inputmode="decimal" autocomplete="off" placeholder="—"
                value="${v == null ? "" : String(v).replace(".", ",")}" aria-describedby="${fid}-err">
              <button type="submit" class="btn btn--sm">Enregistrer</button>
              <button type="button" class="btn btn--ghost btn--sm" data-clear ${v == null ? "hidden" : ""}>Effacer</button>
              <p class="field__error" id="${fid}-err" data-error-for="value"></p>
            </form>
          </li>`;
        }).join("")}
      </ul>`;
  }
  await drawGrades();

  select.addEventListener("change", () => { ui.subjectId = select.value; drawGrades(); });

  list.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    const parsed = parseGrade(form.elements.value.value);
    if (!parsed.ok) return fieldError(form, "value", parsed.error);
    const btn = form.querySelector('[type="submit"]');
    busy(btn, async () => {
      try {
        await api.upsertGrade(form.dataset.student, ui.subjectId, parsed.value);
        form.querySelector("[data-clear]").hidden = false;
        toast("Note enregistrée.");
      } catch (err) { fieldError(form, "value", errorMessage(err)); }
    });
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-clear]");
    if (!btn) return;
    const form = btn.closest("form");
    busy(btn, async () => {
      try {
        await api.deleteGrade(form.dataset.student, ui.subjectId);
        form.elements.value.value = "";
        clearErrors(form);
        toast("Note retirée.");
      } catch (err) { fieldError(form, "value", errorMessage(err)); }
    }).then(() => { btn.hidden = form.elements.value.value === ""; });
  });
}

// ---------- Démarrage ----------
async function start() {
  if (!api.isConfigured) {
    view.innerHTML = `<div class="state state--error" role="alert">
      <p><strong>Application non configurée.</strong></p>
      <p>Renseignez l'URL et la clé « anon » de votre projet Supabase dans <code>js/config.js</code> (voir le README).</p></div>`;
    return;
  }
  document.getElementById("logout").addEventListener("click", (e) => {
    busy(e.currentTarget, async () => {
      try { await api.auth.signOut(); } catch (err) { toast(errorMessage(err), "error"); }
    });
  });
  try {
    session = await api.auth.session();
  } catch (err) {
    return showError(err, start);
  }
  api.auth.onChange((s) => {
    const changed = (s?.user?.id ?? null) !== (session?.user?.id ?? null);
    session = s;
    document.getElementById("account-email").textContent = s?.user?.email ?? "";
    if (changed) router();
  });
  document.getElementById("account-email").textContent = session?.user?.email ?? "";
  window.addEventListener("hashchange", router);
  router();
}

start();
