#!/usr/bin/env node
// One-time/idempotent loader: reads JSON topic files and inserts them into
// study_topics (skipping any title that already exists, so it's safe to
// re-run). Usage: node scripts/seed-study-topics.js file1.json [file2.json ...]
const fs = require('fs');
const path = require('path');
const { db } = require('../src/db');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/seed-study-topics.js <file.json> [...]');
  process.exit(1);
}

const insert = db.prepare(
  `INSERT INTO study_topics (title, section, summary, key_points, management, citations, last_reviewed, sort_order)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const exists = db.prepare('SELECT 1 FROM study_topics WHERE title = ?');
const maxOrder = () => db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM study_topics').get().m;

let inserted = 0;
let skipped = 0;

for (const file of files) {
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  const topics = JSON.parse(raw);
  for (const t of topics) {
    if (exists.get(t.title)) {
      skipped++;
      continue;
    }
    insert.run(
      t.title,
      t.section,
      t.summary || null,
      (t.key_points || []).join('\n'),
      (t.management || []).join('\n'),
      (t.citations || []).join('\n'),
      t.last_reviewed || null,
      maxOrder() + 1
    );
    inserted++;
  }
}

console.log(`Inserted ${inserted} topic(s), skipped ${skipped} existing.`);
