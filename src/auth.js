const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');

const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

function recentFailedAttempts(ip) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM login_attempts
       WHERE ip = ? AND success = 0
         AND created_at > datetime('now', ?)`
    )
    .get(ip, `-${LOCKOUT_WINDOW_MINUTES} minutes`);
  return row.c;
}

function recordAttempt(ip, success) {
  db.prepare('INSERT INTO login_attempts (ip, success) VALUES (?, ?)').run(
    ip,
    success ? 1 : 0
  );
}

function isLockedOut(ip) {
  return recentFailedAttempts(ip) >= MAX_ATTEMPTS;
}

function verifyPin(pin) {
  const hash = getSetting('pin_hash');
  if (!hash) return false;
  return bcrypt.compareSync(String(pin), hash);
}

function setPin(newPin) {
  const hash = bcrypt.hashSync(String(newPin), 10);
  setSetting('pin_hash', hash);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/login');
}

// Simple per-session CSRF token (double-submit pattern).
function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function checkCsrf(req, res, next) {
  const token = req.body && req.body._csrf;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Request blocked',
      message: 'Your session expired or the form was resubmitted. Please go back and try again.',
    });
  }
  next();
}

module.exports = {
  requireAuth,
  verifyPin,
  setPin,
  isLockedOut,
  recordAttempt,
  recentFailedAttempts,
  ensureCsrfToken,
  checkCsrf,
  MAX_ATTEMPTS,
  LOCKOUT_WINDOW_MINUTES,
};
