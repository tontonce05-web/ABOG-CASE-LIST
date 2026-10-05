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

-- Study & References: board-review topics. No patient data ever lives
-- here, so none of the PHI/audit safeguards that apply to the cases
-- table are needed on this table.
CREATE TABLE IF NOT EXISTS study_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'Obstetrics',
  summary TEXT,
  key_points TEXT,
  management TEXT,
  citations TEXT,
  last_reviewed TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_study_topics_section ON study_topics(section);
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
  // Office Practice: ABOG's third case-list portion (alongside Obstetrics
  // and Gynecology). Per indirect research (abog.org is unreachable from
  // this environment; findings are via search-engine snippets of ABOG's
  // own case-list instructions page plus third-party board-prep sites —
  // not a direct read of the current bulletin): the requirement is a
  // minimum of 30 and maximum of 40 total Office Practice patients, no
  // more than 2 patients per category, and it is not necessary to fill
  // every category. The minimum_count of 2 below represents that
  // per-category cap (not a "minimum to reach"), reusing the existing
  // progress-bar UI to show "how close to the cap" instead. Verify these
  // category names and the 30/40/2 figures against your current ABOG
  // Bulletin — some were lower-confidence research findings, flagged as
  // such, and these numbers change in ABOG's yearly bulletin.
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

// --- Seed Study & References topics from the bundled JSON files on first
// run only (never overwrites or duplicates — if the table already has
// rows, e.g. the user added/edited their own, this is a no-op). More
// batches can be added later as new files in src/seed-data/study-topics/
// and loaded into an *existing* database with scripts/seed-study-topics.js,
// which is idempotent by title. ---
const studyTopicCount = db.prepare('SELECT COUNT(*) AS c FROM study_topics').get().c;
if (studyTopicCount === 0) {
  const seedDir = path.join(__dirname, 'seed-data', 'study-topics');
  if (fs.existsSync(seedDir)) {
    const insertTopic = db.prepare(
      `INSERT INTO study_topics (title, section, summary, key_points, management, citations, last_reviewed, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let order = 0;
    const tx = db.transaction((topics) => {
      for (const t of topics) {
        insertTopic.run(
          t.title,
          t.section,
          t.summary || null,
          (t.key_points || []).join('\n'),
          (t.management || []).join('\n'),
          (t.citations || []).join('\n'),
          t.last_reviewed || null,
          order++
        );
      }
    });
    for (const file of fs.readdirSync(seedDir).filter((f) => f.endsWith('.json')).sort()) {
      const topics = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf8'));
      tx(topics);
    }
  }
}

module.exports = { db, getSetting, setSetting };
