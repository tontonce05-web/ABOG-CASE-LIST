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

// --- Default categories, aligned to the structure ABOG uses for the
// general OB/GYN Step 2 case list: broad Obstetric and Gynecologic
// sections, each broken into the sub-categories candidates typically
// have to fill. Minimums are left editable in Settings since ABOG
// updates exact numbers in its yearly bulletin. ---
const defaultCategories = [
  ['Vaginal Delivery — Spontaneous', 'Obstetrics', 0],
  ['Vaginal Delivery — Operative (Forceps/Vacuum)', 'Obstetrics', 0],
  ['Cesarean Delivery — Primary', 'Obstetrics', 0],
  ['Cesarean Delivery — Repeat', 'Obstetrics', 0],
  ['VBAC', 'Obstetrics', 0],
  ['Obstetric Complications (e.g. PPH, Preeclampsia, PTL)', 'Obstetrics', 0],
  ['Antepartum / High-Risk OB Care', 'Obstetrics', 0],
  ['Major Gynecologic Surgery', 'Gynecology', 0],
  ['Minor Gynecologic Surgery / Office Procedures', 'Gynecology', 0],
  ['Laparoscopy / Minimally Invasive Gyn Surgery', 'Gynecology', 0],
  ['Hysteroscopy', 'Gynecology', 0],
  ['Urogynecology / Pelvic Floor', 'Gynecology', 0],
  ['Gynecologic Oncology', 'Gynecology', 0],
  ['Family Planning (Contraception/Abortion Care)', 'Gynecology', 0],
  ['Reproductive Endocrinology / Infertility', 'Gynecology', 0],
  ['Other', 'Other', 0],
];

const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
if (categoryCount === 0) {
  const insert = db.prepare(
    'INSERT INTO categories (name, section, minimum_count, sort_order) VALUES (?, ?, ?, ?)'
  );
  const tx = db.transaction((rows) => {
    rows.forEach(([name, section, min], i) => insert.run(name, section, min, i));
  });
  tx(defaultCategories);
}

module.exports = { db, getSetting, setSetting };
