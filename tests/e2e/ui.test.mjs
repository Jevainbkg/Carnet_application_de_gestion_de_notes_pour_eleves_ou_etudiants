// Test d'interface de bout en bout (Playwright + Chromium) avec un faux Supabase en mémoire.
// Usage : node tests/e2e/ui.test.mjs [dossier-captures]
// Vérifie les parcours ; l'isolation réelle est prouvée par tests/db/rls.test.sql.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../../app");
const shots = process.argv[2];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    const body = await readFile(join(appDir, path === "/" ? "index.html" : path));
    res.writeHead(200, { "content-type": types[extname(path)] ?? "text/html; charset=utf-8" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
const hideToast = (p) => p.evaluate(() => { const t = document.getElementById("toast"); t.style.transition = "none"; t.classList.remove("is-visible"); });
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { results.push(`FAIL ${name} — ${e.message.slice(0, 400)}`); }
};

async function newPage(viewport, colorScheme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route("https://cdn.jsdelivr.net/**", async (r) =>
    r.fulfill({ contentType: "text/javascript", body: await readFile(join(here, "fake-supabase.js")) }));
  await page.route("**/js/config.js", (r) => r.fulfill({ contentType: "text/javascript",
    body: 'export const SUPABASE_URL="https://demo.supabase.co"; export const SUPABASE_ANON_KEY="test";' }));
  return { page, errors };
}

const { page, errors } = await newPage({ width: 1440, height: 900 });
await page.goto(base);

await step("non connecté → redirection vers la connexion", async () => {
  await page.waitForURL(/#\/connexion/);
  assert.equal(await page.locator("h1").count(), 1);
});

await step("validation du formulaire de connexion", async () => {
  await page.click("#auth-submit");
  await page.getByText("Saisissez un e-mail valide.").waitFor();
});

await step("création du compte A", async () => {
  await page.click("#tab-up");
  await page.fill("#email", "enseignant.a@example.test");
  await page.fill("#password", "secret123");
  await page.click("#auth-submit");
  await page.waitForURL(/#\/etudiants/);
  await page.getByText("Aucun étudiant pour l'instant").waitFor();
});

await step("ajout d'étudiants + code dupliqué refusé", async () => {
  for (const [n, c] of [["Étudiant Démo Alpha", "E001"], ["Étudiant Démo Bravo", "E002"], ["Étudiant Démo Charlie", "E003"]]) {
    await page.fill("#s-name", n); await page.fill("#s-code", c);
    await page.click("#student-submit");
    await page.getByRole("link", { name: n }).waitFor();
  }
  await page.fill("#s-name", "Doublon"); await page.fill("#s-code", "E001");
  await page.click("#student-submit");
  await page.getByText("Ce code étudiant existe déjà.").waitFor();
});

await step("modification d'un étudiant", async () => {
  await page.locator("tr", { hasText: "Charlie" }).getByRole("button", { name: "Modifier" }).click();
  await page.fill("#s-name", "Étudiant Démo Charlie B.");
  await page.click("#student-submit");
  await page.getByRole("link", { name: "Étudiant Démo Charlie B." }).waitFor();
});

await step("matières : coefficient 0 refusé, création", async () => {
  await page.click('a[data-route="matieres"]');
  await page.fill("#m-name", "Zéro"); await page.fill("#m-coef", "0");
  await page.click("#subject-submit");
  await page.getByText("Le coefficient doit être compris entre 1 et 100.").waitFor();
  for (const [n, c] of [["Mathématiques", "1"], ["Physique", "2"], ["Histoire", "3"]]) {
    await page.fill("#m-name", n); await page.fill("#m-coef", c);
    await page.click("#subject-submit");
    await page.locator("th", { hasText: n }).waitFor();
  }
});

async function grade(subject, student, value) {
  await page.selectOption("#subject", { label: subject });
  const row = page.locator(".grade-row", { hasText: student });
  await row.locator("input").fill(value);
  await row.getByRole("button", { name: "Enregistrer" }).click();
}

await step("saisie : 21 et -1 refusées", async () => {
  await page.click('a[data-route="notes"]');
  await page.locator("#subject").waitFor();
  await grade("Mathématiques (coef. 1)", "Alpha", "21");
  await page.getByText("La note doit être comprise entre 0 et 20.").first().waitFor();
  await grade("Mathématiques (coef. 1)", "Alpha", "-1");
  await page.getByText("La note doit être un nombre").first().waitFor();
});

await step("saisie des notes valides (virgule acceptée)", async () => {
  await grade("Mathématiques (coef. 1)", "Alpha", "10");
  await page.getByText("Note enregistrée.").waitFor();
  await grade("Physique (coef. 2)", "Alpha", "16");
  await page.locator(".grade-row", { hasText: "Alpha" }).getByRole("button", { name: "Effacer" }).waitFor();
  await grade("Physique (coef. 2)", "Bravo", "8,5");
  await page.locator(".grade-row", { hasText: "Bravo" }).getByRole("button", { name: "Effacer" }).waitFor();
});

await step("recette : relevé Alpha = 14,00, Histoire non notée", async () => {
  await page.click('a[data-route="etudiants"]');
  await page.getByRole("link", { name: "Étudiant Démo Alpha" }).click();
  await page.waitForURL(/#\/etudiant\//);
  assert.equal((await page.locator(".report__avg-value").textContent()).trim(), "14,00");
  await page.locator("tr", { hasText: "Histoire" }).getByText("non notée").waitFor();
  if (shots) await hideToast(page), await page.screenshot({ path: `${shots}/02-releve.png`, fullPage: true });
});

await step("liste : tri par moyenne, sans note en dernier, recherche", async () => {
  await page.click('a[data-route="etudiants"]');
  await page.locator("#student-list tbody tr").first().waitFor();
  const names = await page.locator("#student-list tbody th").allTextContents();
  assert.deepEqual(names.map((s) => s.trim()), ["Étudiant Démo Alpha", "Étudiant Démo Bravo", "Étudiant Démo Charlie B."]);
  assert.equal((await page.locator("tbody tr").last().locator(".score").textContent()).trim(), "—");
  await page.selectOption("#sort", "avg-asc");
  assert.equal((await page.locator("tbody th").first().textContent()).trim(), "Étudiant Démo Bravo");
  await page.selectOption("#sort", "avg-desc");
  if (shots) await hideToast(page), await page.screenshot({ path: `${shots}/01-etudiants.png`, fullPage: true });
  await page.fill("#search", "charlie");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.fill("#search", "");
});

await step("suppression d'un étudiant (avec confirmation)", async () => {
  await page.locator("tr", { hasText: "Charlie" }).getByRole("button", { name: "Retirer" }).click();
  await page.getByText("a été retiré").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("#student-list tbody tr").length === 2, null, { timeout: 5000 });
});

await step("isolation : B ne voit pas les données de A", async () => {
  await page.click("#logout");
  await page.waitForURL(/#\/connexion/);
  await page.click("#tab-up");
  await page.fill("#email", "enseignant.b@example.test");
  await page.fill("#password", "secret456");
  await page.click("#auth-submit");
  await page.getByText("Aucun étudiant pour l'instant").waitFor();
  await page.click('a[data-route="matieres"]');
  await page.getByText("Aucune matière pour l'instant").waitFor();
});


async function login(email, password) {
  await page.click("#logout");
  await page.waitForURL(/#\/connexion/);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("#auth-submit");
}
let accessCode;

await step("v1.1 : l'enseignant voit le code d'accès sur la fiche", async () => {
  await login("enseignant.a@example.test", "secret123");
  await page.waitForURL(/#\/etudiants/);
  await page.getByRole("link", { name: "Étudiant Démo Alpha" }).click();
  accessCode = (await page.locator("#access-code").textContent()).trim();
  assert.match(accessCode, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal((await page.locator("#access-status").textContent()).trim(), "en attente");
});

await step("v1.1 : inscription élève → saisie du code (mauvais code refusé)", async () => {
  await page.click("#logout");
  await page.waitForURL(/#\/connexion/);
  await page.click("#tab-up");
  await page.check('input[name="role"][value="student"]');
  await page.fill("#email", "eleve.alpha@example.test");
  await page.fill("#password", "secret789");
  await page.click("#auth-submit");
  await page.waitForURL(/#\/rejoindre/);
  await page.fill("#code", "1234");
  await page.click("#join-submit");
  await page.getByText("Le code comporte 12 caractères").waitFor();
  await page.fill("#code", "0000-0000-0000");
  await page.click("#join-submit");
  await page.getByText("Code invalide ou déjà utilisé.").waitFor();
});

await step("v1.1 : l'élève voit ses notes en lecture seule (14,00)", async () => {
  await page.fill("#code", accessCode.toLowerCase());
  await page.click("#join-submit");
  await page.waitForURL(/#\/mes-notes/);
  await page.locator(".report__avg-value").waitFor();
  assert.equal((await page.locator(".report__avg-value").textContent()).trim(), "14,00");
  assert.equal(await page.locator(".report").count(), 1);
  assert.equal(await page.locator("main input, main select").count(), 0, "aucun champ de saisie");
  for (const r of ["etudiants", "matieres", "notes"]) assert.equal(await page.locator(`a[data-route="${r}"]`).isVisible(), false, r);
  if (shots) await hideToast(page), await page.screenshot({ path: `${shots}/04-espace-eleve.png`, fullPage: true });
});

await step("v1.1 : l'élève ne peut pas ouvrir les écrans enseignant", async () => {
  await page.evaluate(() => { location.hash = "#/matieres"; });
  await page.waitForURL(/#\/mes-notes/);
});

await step("v1.1 : l'enseignant voit « rattaché » puis révoque l'accès", async () => {
  await login("enseignant.a@example.test", "secret123");
  await page.waitForURL(/#\/etudiants/);
  await page.locator("tr", { hasText: "Alpha" }).getByText("rattaché").waitFor();
  await page.getByRole("link", { name: "Étudiant Démo Alpha" }).click();
  await page.click("#access-reset");
  await page.getByText("Accès révoqué").waitFor();
  assert.notEqual((await page.locator("#access-code").textContent()).trim(), accessCode);
});

await step("v1.1 : après révocation, l'élève ne voit plus ses notes", async () => {
  await login("eleve.alpha@example.test", "secret789");
  await page.waitForURL(/#\/rejoindre/);
});

await step("bouton jour / nuit : bascule et mémorise le choix", async () => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.click("#theme-toggle");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.notEqual(await bg(), light);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.click("#theme-toggle");
  assert.equal(await bg(), light);
});

await step("aucune erreur JavaScript", async () => assert.deepEqual(errors, []));

// Mobile 375 px, thème sombre : pas de défilement horizontal
await step("mobile 375 px + thème sombre : pas de débordement horizontal", async () => {
  const m = await newPage({ width: 375, height: 812 }, "dark");
  await m.page.goto(base);
  await m.page.click("#tab-up");
  await m.page.fill("#email", "mobile@example.test");
  await m.page.fill("#password", "secret123");
  await m.page.click("#auth-submit");
  await m.page.waitForURL(/#\/etudiants/);
  await m.page.fill("#s-name", "Étudiant Démo Mobile"); await m.page.fill("#s-code", "M01");
  await m.page.click("#student-submit");
  await m.page.getByRole("link", { name: "Étudiant Démo Mobile" }).waitFor();
  await m.page.click('a[data-route="matieres"]');
  await m.page.fill("#m-name", "Mathématiques"); await m.page.fill("#m-coef", "2");
  await m.page.click("#subject-submit");
  await m.page.locator("th", { hasText: "Mathématiques" }).waitFor();
  await m.page.click('a[data-route="notes"]');
  const row = m.page.locator(".grade-row").first();
  await row.locator("input").fill("13,5");
  await row.getByRole("button", { name: "Enregistrer" }).click();
  await row.getByRole("button", { name: "Effacer" }).waitFor();
  await m.page.click('a[data-route="etudiants"]');
  await m.page.locator(".score").first().waitFor();
  for (const route of ["etudiants", "matieres", "notes"]) {
    await m.page.click(`a[data-route="${route}"]`);
    await m.page.waitForTimeout(300);
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${route} déborde de ${overflow}px`);
  }
  await m.page.click('a[data-route="etudiants"]');
  await m.page.locator(".score").first().waitFor();
  if (shots) await hideToast(m.page), await m.page.screenshot({ path: `${shots}/03-mobile-sombre.png`, fullPage: true });
  assert.deepEqual(m.errors, []);
});

await browser.close();
server.close();
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
