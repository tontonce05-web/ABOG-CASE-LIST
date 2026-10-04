const express = require('express');
const { db } = require('../db');
const { checkCsrf } = require('../auth');

const router = express.Router();

const FIELDS = ['title', 'section', 'summary', 'key_points', 'management', 'citations', 'last_reviewed'];

function sanitizeBody(body) {
  const out = {};
  for (const field of FIELDS) {
    let val = body[field];
    if (val === undefined) continue;
    val = String(val).trim();
    out[field] = val === '' ? null : val;
  }
  return out;
}

function toLines(text) {
  if (!text) return [];
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

router.get('/', (req, res) => {
  const { section, q } = req.query;
  let sql = 'SELECT * FROM study_topics WHERE 1=1';
  const params = [];
  if (section) {
    sql += ' AND section = ?';
    params.push(section);
  }
  if (q) {
    sql += ' AND (title LIKE ? OR summary LIKE ? OR key_points LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY section, sort_order, title';
  const topics = db.prepare(sql).all(...params);
  const sections = db.prepare('SELECT DISTINCT section FROM study_topics ORDER BY section').all().map((r) => r.section);

  res.render('study/list', {
    title: 'Study & References',
    topics,
    sections,
    filterSection: section || '',
    q: q || '',
  });
});

router.get('/new', (req, res) => {
  res.render('study/form', { title: 'Add Study Topic', topic: {} });
});

router.post('/', checkCsrf, (req, res) => {
  const data = sanitizeBody(req.body);
  const fields = Object.keys(data);
  const placeholders = fields.map(() => '?').join(', ');
  const info = db
    .prepare(`INSERT INTO study_topics (${fields.join(', ')}) VALUES (${placeholders})`)
    .run(...fields.map((f) => data[f]));
  res.redirect(`/study/${info.lastInsertRowid}`);
});

router.get('/:id', (req, res) => {
  const topic = db.prepare('SELECT * FROM study_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).render('error', { title: 'Not found', message: 'Topic not found.' });
  res.render('study/show', {
    title: topic.title,
    topic,
    keyPoints: toLines(topic.key_points),
    management: toLines(topic.management),
    citations: toLines(topic.citations),
  });
});

router.get('/:id/edit', (req, res) => {
  const topic = db.prepare('SELECT * FROM study_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).render('error', { title: 'Not found', message: 'Topic not found.' });
  res.render('study/form', { title: `Edit: ${topic.title}`, topic });
});

router.post('/:id', checkCsrf, (req, res) => {
  const existing = db.prepare('SELECT id FROM study_topics WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).render('error', { title: 'Not found', message: 'Topic not found.' });
  const data = sanitizeBody(req.body);
  const fields = Object.keys(data);
  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE study_topics SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...fields.map((f) => data[f]),
    req.params.id
  );
  res.redirect(`/study/${req.params.id}`);
});

router.post('/:id/delete', checkCsrf, (req, res) => {
  db.prepare('DELETE FROM study_topics WHERE id = ?').run(req.params.id);
  res.redirect('/study');
});

module.exports = router;
