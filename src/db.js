const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'caselist.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL DEFAULT 'Other',
  minimum_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_initials TEXT,
  patient_ref TEXT,
  age INTEGER,
  gender TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date_of_service TEXT,
  setting TEXT,
  gestational_age TEXT,
  delivery_type TEXT,
  diagnosis_code TEXT,
  diagnosis_text TEXT,
  procedure_code TEXT,
  procedure_text TEXT,
  role TEXT,
  complications TEXT,
  notes TEXT,
  source_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cases_category ON cases(category_id);
CREATE INDEX IF NOT EXISTS idx_cases_date ON cases(date_of_service);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  ip TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// --- Default settings ---
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

if (!getSetting('pin_hash')) {
  const defaultPin = process.env.PIN_HASH || bcrypt.hashSync('1732', 10);
  setSetting('pin_hash', defaultPin);
}

if (!getSetting('collection_start')) {
  const year = new Date().getFullYear();
  setSetting('collection_start', `${year}-01-01`);
  setSetting('collection_end', `${year}-12-31`);
}

if (!getSetting('exam_name')) {
  setSetting('exam_name', 'ABOG Step 2 Certifying Exam — Case List');
}

// --- Categories, taken directly from the three tabs of ABOG's own case
// list page (see src/abogRequirements.js) rather than an approximation.
// Seeding is idempotent (INSERT OR IGNORE keyed on the UNIQUE name column)
// so it also backfills an already-running database when this list changes,
// without touching categories or cases that already exist. ---
const { SECTIONS } = require('./abogRequirements');

const defaultCategories = [];
Object.entries(SECTIONS).forEach(([section, def]) => {
  def.categories.forEach((name, i) => defaultCategories.push([name, section, 0, i]));
});

const insertCategory = db.prepare(
  'INSERT OR IGNORE INTO categories (name, section, minimum_count, sort_order) VALUES (?, ?, ?, ?)'
);
const seedTx = db.transaction((rows) => {
  rows.forEach(([name, section, min, order]) => insertCategory.run(name, section, min, order));
});
seedTx(defaultCategories);

// Categories from the old placeholder structure (a made-up approximation
// of ABOG's real categories) that have no cases attached are stale and
// safe to drop now that the real ones above are seeded. Any with cases
// attached are left in place so existing case data is never orphaned.
const realNames = new Set(defaultCategories.map((row) => row[0]));
const staleCandidates = db
  .prepare(
    `SELECT categories.id FROM categories
     LEFT JOIN cases ON cases.category_id = categories.id
     WHERE categories.section IN ('Obstetrics', 'Gynecology', 'Other')
     GROUP BY categories.id
     HAVING COUNT(cases.id) = 0`
  )
  .all();
const deleteStale = db.prepare('DELETE FROM categories WHERE id = ?');
staleCandidates.forEach((row) => {
  const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(row.id);
  if (cat && !realNames.has(cat.name)) deleteStale.run(row.id);
});

module.exports = { db, getSetting, setSetting };
