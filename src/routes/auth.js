const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  verifyPin,
  isLockedOut,
  recordAttempt,
  recentFailedAttempts,
  MAX_ATTEMPTS,
  LOCKOUT_WINDOW_MINUTES,
} = require('../auth');
const { logAction } = require('../audit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait before trying again.',
});

router.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.render('login', { title: 'Sign in', error: null });
});

router.post('/login', loginLimiter, (req, res) => {
  const ip = req.ip || 'unknown';
  const { pin, _csrf } = req.body;

  if (!_csrf || _csrf !== req.session.csrfToken) {
    return res.status(403).render('login', {
      title: 'Sign in',
      error: 'Your session expired. Please try again.',
    });
  }

  if (isLockedOut(ip)) {
    return res.status(429).render('login', {
      title: 'Sign in',
      error: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MINUTES} minutes.`,
    });
  }

  if (verifyPin(pin)) {
    recordAttempt(ip, true);
    logAction('login_success', { ip });
    req.session.regenerate((err) => {
      if (err) return res.status(500).render('error', { title: 'Error', message: 'Could not start session.' });
      req.session.authenticated = true;
      res.redirect('/');
    });
    return;
  }

  recordAttempt(ip, false);
  logAction('login_failure', { ip });
  const remaining = Math.max(0, MAX_ATTEMPTS - recentFailedAttempts(ip));
  res.status(401).render('login', {
    title: 'Sign in',
    error: `Incorrect PIN. ${remaining} attempt(s) remaining before a temporary lockout.`,
  });
});

router.post('/logout', (req, res) => {
  logAction('logout', { ip: req.ip });
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
