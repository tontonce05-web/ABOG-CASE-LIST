const express = require('express');
const { db, getSetting } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY section, sort_order, name').all();
  const counts = db
    .prepare('SELECT category_id, COUNT(*) AS c FROM cases GROUP BY category_id')
    .all()
    .reduce((acc, row) => {
      acc[row.category_id] = row.c;
      return acc;
    }, {});

  const categoryProgress = categories.map((cat) => ({
    ...cat,
    count: counts[cat.id] || 0,
    pct: cat.minimum_count > 0 ? Math.min(100, Math.round(((counts[cat.id] || 0) / cat.minimum_count) * 100)) : null,
  }));

  const sections = [...new Set(categories.map((c) => c.section))];
  const bySection = sections.map((section) => ({
    section,
    items: categoryProgress.filter((c) => c.section === section),
  }));

  const totalCases = db.prepare('SELECT COUNT(*) AS c FROM cases').get().c;
  const recentCases = db
    .prepare(
      `SELECT cases.*, categories.name AS category_name
       FROM cases LEFT JOIN categories ON cases.category_id = categories.id
       ORDER BY cases.created_at DESC LIMIT 8`
    )
    .all();

  res.render('dashboard', {
    title: 'Dashboard',
    bySection,
    totalCases,
    recentCases,
    examName: getSetting('exam_name'),
    collectionStart: getSetting('collection_start'),
    collectionEnd: getSetting('collection_end'),
  });
});

module.exports = router;
