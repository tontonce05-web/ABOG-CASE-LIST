const express = require('express');
const { db, getSetting } = require('../db');
const { SECTIONS } = require('../abogRequirements');

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

  const categoryProgress = categories.map((cat) => {
    const count = counts[cat.id] || 0;
    const rule = SECTIONS[cat.section];
    return {
      ...cat,
      count,
      // Sections with an ABOG rule cap how many of any one category count
      // toward the section minimum (extra cases still get listed, they
      // just don't move the section total). Categories outside those
      // three sections (e.g. a custom one added in Settings) fall back to
      // the old per-category minimum/progress-bar behavior.
      overCap: rule ? count > rule.maxPerCategory : false,
      pct: !rule && cat.minimum_count > 0 ? Math.min(100, Math.round((count / cat.minimum_count) * 100)) : null,
    };
  });

  const sections = [...new Set(categories.map((c) => c.section))];
  const bySection = sections.map((section) => {
    const items = categoryProgress.filter((c) => c.section === section);
    const rule = SECTIONS[section];
    const sectionInfo = { section, items, guidelines: rule ? rule.guidelines : null, exclusionNote: rule ? rule.exclusionNote : null };
    if (rule) {
      const effectiveCount = items.reduce((sum, c) => sum + Math.min(c.count, rule.maxPerCategory), 0);
      sectionInfo.minimum = rule.minimum;
      sectionInfo.maxPerCategory = rule.maxPerCategory;
      sectionInfo.effectiveCount = effectiveCount;
      sectionInfo.pct = Math.min(100, Math.round((effectiveCount / rule.minimum) * 100));
      sectionInfo.met = effectiveCount >= rule.minimum;
    }
    return sectionInfo;
  });

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
