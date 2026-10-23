import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightedAverage, parseGrade, parseCoefficient, parseText,
  searchStudents, sortStudents, errorMessage, formatScore,
} from "../app/js/calc.js";

test("recette : 10 (coef 1) et 16 (coef 2) donnent 14", () => {
  assert.equal(weightedAverage([{ value: 10, coefficient: 1 }, { value: 16, coefficient: 2 }]), 14);
});

test("aucune note : moyenne non calculée (null), jamais 0", () => {
  assert.equal(weightedAverage([]), null);
  assert.equal(formatScore(null), "—");
});

test("une matière non notée n'est pas comptée comme 0", () => {
  assert.equal(weightedAverage([{ value: 12, coefficient: 3 }, { value: null, coefficient: 5 }]), 12);
});

test("arrondi à 2 décimales", () => {
  assert.equal(weightedAverage([{ value: 10, coefficient: 1 }, { value: 11, coefficient: 2 }]), 10.67);
});

test("notes < 0 ou > 20 refusées", () => {
  for (const bad of ["-1", "20.5", "21", "", "abc", "1e1", "12.345"]) {
    assert.equal(parseGrade(bad).ok, false, bad);
  }
  assert.deepEqual(parseGrade("0"), { ok: true, value: 0 });
  assert.deepEqual(parseGrade("20"), { ok: true, value: 20 });
  assert.deepEqual(parseGrade("12,5"), { ok: true, value: 12.5 });
});

test("coefficient entier strictement positif", () => {
  for (const bad of ["0", "-2", "1.5", "", "x", "101"]) assert.equal(parseCoefficient(bad).ok, false, bad);
  assert.deepEqual(parseCoefficient(" 3 "), { ok: true, value: 3 });
});

test("texte obligatoire et nettoyé", () => {
  assert.equal(parseText("   ", "Le nom").ok, false);
  assert.deepEqual(parseText("  Ana   B ", "Le nom"), { ok: true, value: "Ana B" });
});

const rows = [
  { name: "Élodie", student_code: "E2", average: 12 },
  { name: "bruno", student_code: "E1", average: null },
  { name: "Chloé", student_code: "E3", average: 15.5 },
  { name: "Adam", student_code: "E4", average: 12 },
];

test("recherche insensible aux accents et à la casse", () => {
  assert.deepEqual(searchStudents(rows, "elo").map((r) => r.name), ["Élodie"]);
  assert.deepEqual(searchStudents(rows, "e1").map((r) => r.name), ["bruno"]);
  assert.equal(searchStudents(rows, "").length, 4);
});

test("tri par moyenne, étudiants sans note en dernier", () => {
  assert.deepEqual(sortStudents(rows, "avg-desc").map((r) => r.name), ["Chloé", "Adam", "Élodie", "bruno"]);
  assert.deepEqual(sortStudents(rows, "avg-asc").map((r) => r.name), ["Adam", "Élodie", "Chloé", "bruno"]);
  assert.deepEqual(sortStudents(rows, "name").map((r) => r.name), ["Adam", "bruno", "Chloé", "Élodie"]);
});

test("messages d'erreur lisibles", () => {
  assert.equal(errorMessage({ code: "23505", message: 'duplicate key "students_owner_code_key"' }), "Ce code étudiant existe déjà.");
  assert.equal(errorMessage(new TypeError("Failed to fetch")), "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  assert.equal(errorMessage({ message: "Invalid login credentials" }), "E-mail ou mot de passe incorrect.");
});

import { parseAccessCode } from "../app/js/calc.js";

test("code d'accès : normalisation et validation", () => {
  assert.deepEqual(parseAccessCode(" a1b2 c3d4-e5f6 "), { ok: true, value: "A1B2-C3D4-E5F6" });
  assert.deepEqual(parseAccessCode("A1B2C3D4E5F6"), { ok: true, value: "A1B2-C3D4-E5F6" });
  for (const bad of ["", "A1B2-C3D4", "ZZZZ-ZZZZ-ZZZZ", "A1B2-C3D4-E5F6-0"]) assert.equal(parseAccessCode(bad).ok, false, bad);
});
