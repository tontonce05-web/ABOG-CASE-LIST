const express = require('express');
const { db } = require('../db');
const { checkCsrf } = require('../auth');
const { parseNote } = require('../parser');
const { scanFields } = require('../phiCheck');
const { logAction } = require('../audit');

const router = express.Router();

function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY section, sort_order, name').all();
}

function findCategoryByName(name) {
  return db.prepare('SELECT * FROM categories WHERE name = ?').get(name);
}

const CASE_FIELDS = [
  'patient_initials', 'patient_ref', 'age', 'gravida', 'para', 'gender', 'category_id',
  'date_of_service', 'setting', 'gestational_age', 'delivery_type',
  'diagnosis_code', 'diagnosis_text', 'procedure_code', 'procedure_text',
  'role', 'complications', 'notes',
  // Fields matching ABOG's official per-section case list columns — see
  // src/db.js for which section each one belongs to.
  'days_in_hospital', 'diagnostic_procedures', 'treatment', 'results', 'visit_count',
  'surgical_pathology_diagnosis', 'uterine_weight_g',
  'complications_antepartum', 'complications_delivery_postpartum', 'perinatal_death',
  'newborn_weight', 'newborn_apgar', 'newborn_days_in_hospital',
];

const INTEGER_FIELDS = ['age', 'gravida', 'para', 'category_id', 'days_in_hospital', 'visit_count', 'uterine_weight_g'];

function sanitizeBody(body) {
  const out = {};
  for (const field of CASE_FIELDS) {
    let val = body[field];
    if (val === undefined) continue;
    val = String(val).trim();
    out[field] = val === '' ? null : val;
  }
  for (const field of INTEGER_FIELDS) {
    if (out[field] !== undefined && out[field] !== null) {
      const n = parseInt(out[field], 10);
      out[field] = Number.isFinite(n) ? n : null;
    }
  }
  return out;
}

// If any submitted field looks like it might contain a real identifier
// (name, SSN, phone, MRN, address...) stop and make the user confirm
// before anything is written to the database. This is the app's main
// technical guardrail against accidentally storing PHI.
function phiGate(req, res, formAction) {
  if (req.body.phi_confirmed === '1') return null;
  const warnings = scanFields(req.body);
  if (warnings.length === 0) return null;
  res.render('cases/confirm', {
    title: 'Possible identifying information detected',
    warnings,
    formAction,
    body: req.body,
    csrfToken: res.locals.csrfToken,
  });
  return true;
}

// List + filter
router.get('/', (req, res) => {
  const { category, q } = req.query;
  let sql = `SELECT cases.*, categories.name AS category_name, categories.section AS section
             FROM cases LEFT JOIN categories ON cases.category_id = categories.id WHERE 1=1`;
  const params = [];
  if (category) {
    sql += ' AND cases.category_id = ?';
    params.push(category);
  }
  if (q) {
    sql += ` AND (cases.patient_ref LIKE ? OR cases.patient_initials LIKE ? OR cases.diagnosis_text LIKE ?
             OR cases.procedure_text LIKE ? OR cases.notes LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY date(cases.date_of_service) DESC, cases.id DESC';
  const cases = db.prepare(sql).all(...params);
  res.render('cases/list', {
    title: 'Case List',
    cases,
    categories: getCategories(),
    filterCategory: category || '',
    q: q || '',
  });
});

router.get('/new', (req, res) => {
  res.render('cases/form', {
    title: 'Add Case',
    caseItem: {},
    categories: getCategories(),
    parsed: null,
    sourceNote: '',
  });
});

// Quick-add: parse a pasted note and re-render the form pre-filled.
router.post('/parse', checkCsrf, (req, res) => {
  const note = req.body.source_note || '';
  const parsed = parseNote(note);
  let categoryId = null;
  if (parsed.category_name) {
    const cat = findCategoryByName(parsed.category_name);
    if (cat) categoryId = cat.id;
  }
  res.render('cases/form', {
    title: 'Add Case',
    caseItem: { ...parsed, category_id: categoryId },
    categories: getCategories(),
    parsed,
    sourceNote: note,
  });
});

router.post('/', checkCsrf, (req, res) => {
  if (phiGate(req, res, '/cases')) return;
  const data = sanitizeBody(req.body);
  const fields = Object.keys(data);
  const placeholders = fields.map(() => '?').join(', ');
  const sql = `INSERT INTO cases (${fields.join(', ')}, source_note) VALUES (${placeholders}, ?)`;
  const sourceNote = req.body.keep_source_note === 'on' ? (req.body.source_note || null) : null;
  const info = db.prepare(sql).run(...fields.map((f) => data[f]), sourceNote);
  logAction('create_case', { entity: 'case', entityId: info.lastInsertRowid, ip: req.ip });
  res.redirect(`/cases/${info.lastInsertRowid}`);
});

router.get('/export.csv', (req, res) => {
  const rows = db
    .prepare(
      `SELECT cases.*, categories.name AS category_name, categories.section AS section
       FROM cases LEFT JOIN categories ON cases.category_id = categories.id
       ORDER BY date(cases.date_of_service) ASC, cases.id ASC`
    )
    .all();
  const headers = [
    'id', 'section', 'category_name', 'date_of_service', 'patient_initials', 'patient_ref',
    'age', 'gravida', 'para', 'gender', 'setting', 'gestational_age', 'delivery_type', 'diagnosis_code',
    'diagnosis_text', 'procedure_code', 'procedure_text', 'role', 'complications',
    'days_in_hospital', 'diagnostic_procedures', 'treatment', 'results', 'visit_count',
    'surgical_pathology_diagnosis', 'uterine_weight_g',
    'complications_antepartum', 'complications_delivery_postpartum', 'perinatal_death',
    'newborn_weight', 'newborn_apgar', 'newborn_days_in_hospital', 'notes',
  ];
  const csvEscape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  logAction('export_csv', { ip: req.ip, detail: `${rows.length} rows` });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="abog-case-list.csv"');
  res.send(lines.join('\n'));
});

const REPORT_SECTIONS = ['Obstetrics', 'Gynecology', 'Office Practice'];

// The official ABOG submission format for each section is a specific
// table of columns, not a generic case list — this renders that table.
// Numbering (and the P/S suffix ABOG's own forms use to mark a resident-
// managed staff case) is generated here rather than stored, since it's
// just the row's position within the section, in date order.
router.get('/report/:section', (req, res) => {
  const section = REPORT_SECTIONS.find((s) => s === req.params.section);
  if (!section) return res.status(404).render('error', { title: 'Not found', message: 'Unknown section.' });
  const rows = db
    .prepare(
      `SELECT cases.*, categories.name AS category_name
       FROM cases LEFT JOIN categories ON cases.category_id = categories.id
       WHERE categories.section = ?
       ORDER BY date(cases.date_of_service) ASC, cases.id ASC`
    )
    .all(section);
  const numbered = rows.map((row, i) => ({
    ...row,
    rowNumber: `${i + 1} ${row.role === 'Supervised Resident' ? 'S' : 'P'}`,
  }));
  res.render('cases/report', { title: `${section} — Case List`, section, rows: numbered });
});

router.get('/:id', (req, res) => {
  const caseItem = db
    .prepare(
      `SELECT cases.*, categories.name AS category_name, categories.section AS section
       FROM cases LEFT JOIN categories ON cases.category_id = categories.id
       WHERE cases.id = ?`
    )
    .get(req.params.id);
  if (!caseItem) return res.status(404).render('error', { title: 'Not found', message: 'Case not found.' });
  res.render('cases/show', { title: `Case #${caseItem.id}`, caseItem });
});

router.get('/:id/edit', (req, res) => {
  const caseItem = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
  if (!caseItem) return res.status(404).render('error', { title: 'Not found', message: 'Case not found.' });
  res.render('cases/form', {
    title: `Edit Case #${caseItem.id}`,
    caseItem,
    categories: getCategories(),
    parsed: null,
    sourceNote: '',
  });
});

router.post('/:id', checkCsrf, (req, res) => {
  const existing = db.prepare('SELECT id FROM cases WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).render('error', { title: 'Not found', message: 'Case not found.' });
  if (phiGate(req, res, `/cases/${req.params.id}`)) return;
  const data = sanitizeBody(req.body);
  const fields = Object.keys(data);
  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE cases SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...fields.map((f) => data[f]),
    req.params.id
  );
  logAction('update_case', { entity: 'case', entityId: req.params.id, ip: req.ip });
  res.redirect(`/cases/${req.params.id}`);
});

router.post('/:id/delete', checkCsrf, (req, res) => {
  db.prepare('DELETE FROM cases WHERE id = ?').run(req.params.id);
  logAction('delete_case', { entity: 'case', entityId: req.params.id, ip: req.ip });
  res.redirect('/cases');
});

module.exports = router;
