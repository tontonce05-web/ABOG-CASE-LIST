#!/usr/bin/env node
// One-time/idempotent migration: adds the Office Practice categories to an
// existing database that predates them (skips any name that already
// exists, so it's safe to re-run). Usage: node scripts/add-office-practice-categories.js
const { db } = require('../src/db');

const categories = [
  ['Preventive Care & Health Maintenance', 'Office Practice', 2],
  ['Lifestyle Counseling (smoking, obesity, diet, exercise, substance use)', 'Office Practice', 2],
  ['Sexual Dysfunction', 'Office Practice', 2],
  ['Family Planning / Contraception Counseling (Office)', 'Office Practice', 2],
  ['Preconception Evaluation, Prenatal & Genetic Diagnosis', 'Office Practice', 2],
  ['Geriatric Care', 'Office Practice', 2],
  ['Endocrine Disease (diabetes, thyroid, adrenal)', 'Office Practice', 2],
  ['Major Medical Disease (cardiopulmonary, GI, hypertension)', 'Office Practice', 2],
  ['Minor Medical Disease (headache, back pain, IBS, etc.)', 'Office Practice', 2],
  ['Medical Management of Ectopic Pregnancy', 'Office Practice', 2],
  ['Psychiatric Illness (depression, eating disorders, etc.)', 'Office Practice', 2],
  ['Hypercholesterolemia & Dyslipidemia Management', 'Office Practice', 2],
];

const exists = db.prepare('SELECT 1 FROM categories WHERE name = ?');
const insert = db.prepare(
  'INSERT INTO categories (name, section, minimum_count, sort_order) VALUES (?, ?, ?, ?)'
);
const maxOrder = () => db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get().m;

let inserted = 0;
let skipped = 0;
for (const [name, section, min] of categories) {
  if (exists.get(name)) {
    skipped++;
    continue;
  }
  insert.run(name, section, min, maxOrder() + 1);
  inserted++;
}

console.log(`Inserted ${inserted} categor${inserted === 1 ? 'y' : 'ies'}, skipped ${skipped} existing.`);
