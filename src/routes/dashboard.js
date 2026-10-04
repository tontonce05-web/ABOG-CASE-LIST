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

  const withMinimums = categoryProgress.filter((c) => c.minimum_count > 0);
  const totalMinimum = withMinimums.reduce((sum, c) => sum + c.minimum_count, 0);
  const totalTowardMinimum = withMinimums.reduce((sum, c) => sum + Math.min(c.count, c.minimum_count), 0);
  const overallPct = totalMinimum > 0 ? Math.round((totalTowardMinimum / totalMinimum) * 100) : null;
  const categoriesComplete = withMinimums.filter((c) => c.count >= c.minimum_count).length;

  const collectionEnd = getSetting('collection_end');
  let daysRemaining = null;
  if (collectionEnd) {
    const diffMs = new Date(`${collectionEnd}T23:59:59`) - new Date();
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  res.render('dashboard', {
    title: 'Dashboard',
    bySection,
    totalCases,
    recentCases,
    overallPct,
    categoriesComplete,
    categoriesWithMinimum: withMinimums.length,
    daysRemaining,
    examName: getSetting('exam_name'),
    collectionStart: getSetting('collection_start'),
    collectionEnd,
  });
});

module.exports = router;
