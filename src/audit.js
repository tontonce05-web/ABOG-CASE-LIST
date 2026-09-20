const { db } = require('./db');

// HIPAA Security Rule §164.312(b) calls for audit controls that record and
// examine activity in systems that touch health information. Even though
// this app is designed so PHI should never be entered, every create/update/
// delete and every settings change (PIN, category minimums) is logged here
// so there is a record to review if something looks wrong.
function logAction(action, { entity = null, entityId = null, ip = null, detail = null } = {}) {
  db.prepare(
    'INSERT INTO audit_log (action, entity, entity_id, ip, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(action, entity, entityId, ip, detail);
}

module.exports = { logAction };
