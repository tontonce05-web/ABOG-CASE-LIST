const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const { checkCsrf, setPin, verifyPin } = require('../auth');
const { logAction } = require('../audit');
const { SECTIONS } = require('../abogRequirements');

const router = express.Router();

router.get('/', (req, res) => {
  const categories = db
    .prepare('SELECT * FROM categories ORDER BY section, sort_order, name')
    .all()
    .map((cat) => ({ ...cat, ruled: !!SECTIONS[cat.section] }));
  res.render('settings', {
    title: 'Settings',
    categories,
    sectionRules: SECTIONS,
    examName: getSetting('exam_name'),
    collectionStart: getSetting('collection_start'),
    collectionEnd: getSetting('collection_end'),
    message: req.query.message || null,
    error: req.query.error || null,
  });
});

router.post('/general', checkCsrf, (req, res) => {
  const { exam_name, collection_start, collection_end } = req.body;
  if (exam_name) setSetting('exam_name', exam_name.trim());
  if (collection_start) setSetting('collection_start', collection_start);
  if (collection_end) setSetting('collection_end', collection_end);
  res.redirect('/settings?message=Preferences saved.');
});

router.post('/pin', checkCsrf, (req, res) => {
  const { current_pin, new_pin, confirm_pin } = req.body;
  if (!verifyPin(current_pin)) {
    return res.redirect('/settings?error=Current PIN is incorrect.');
  }
  if (!new_pin || new_pin.length < 4 || !/^\d+$/.test(new_pin)) {
    return res.redirect('/settings?error=New PIN must be at least 4 digits.');
  }
  if (new_pin !== confirm_pin) {
    return res.redirect('/settings?error=New PIN and confirmation do not match.');
  }
  setPin(new_pin);
  logAction('pin_changed', { ip: req.ip });
  res.redirect('/settings?message=PIN updated. Use it next time you sign in.');
});

router.post('/categories/:id', checkCsrf, (req, res) => {
  const { minimum_count } = req.body;
  const n = parseInt(minimum_count, 10);
  db.prepare('UPDATE categories SET minimum_count = ? WHERE id = ?').run(
    Number.isFinite(n) ? n : 0,
    req.params.id
  );
  res.redirect('/settings?message=Category minimums updated.');
});

router.post('/categories', checkCsrf, (req, res) => {
  const { name, section, minimum_count } = req.body;
  if (!name || !name.trim()) {
    return res.redirect('/settings?error=Category name is required.');
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get().m;
  try {
    db.prepare(
      'INSERT INTO categories (name, section, minimum_count, sort_order) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), (section || 'Other').trim(), parseInt(minimum_count, 10) || 0, maxOrder + 1);
    res.redirect('/settings?message=Category added.');
  } catch (e) {
    res.redirect('/settings?error=A category with that name already exists.');
  }
});

router.post('/categories/:id/delete', checkCsrf, (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM cases WHERE category_id = ?').get(req.params.id).c;
  if (inUse > 0) {
    return res.redirect('/settings?error=Cannot delete a category that has cases assigned to it.');
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.redirect('/settings?message=Category removed.');
});

module.exports = router;
