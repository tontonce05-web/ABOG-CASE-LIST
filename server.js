require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { requireAuth, ensureCsrfToken } = require('./src/auth');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const caseRoutes = require('./src/routes/cases');
const settingsRoutes = require('./src/routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    // HTTP Strict Transport Security: once served over HTTPS (as this app
    // must be, per the deployment guide), tell browsers to never fall back
    // to plain HTTP. Required in spirit by the HIPAA Security Rule's
    // transmission security standard (45 CFR 164.312(e)).
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: 'abog.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      // Automatic logoff after 20 minutes of inactivity (HIPAA Security
      // Rule addressable safeguard, 45 CFR 164.312(a)(2)(iii)). "rolling"
      // means any request resets the clock, so an active session doesn't
      // get cut off mid-use.
      maxAge: 1000 * 60 * 20,
    },
    rolling: true,
  })
);

// Rate limit everything lightly; login has its own stricter limiter + lockout.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use((req, res, next) => {
  res.locals.csrfToken = ensureCsrfToken(req);
  res.locals.authenticated = !!(req.session && req.session.authenticated);
  next();
});

app.use('/', authRoutes);
app.use('/', requireAuth, dashboardRoutes);
app.use('/cases', requireAuth, caseRoutes);
app.use('/settings', requireAuth, settingsRoutes);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: isProd ? 'An unexpected error occurred.' : err.message });
});

app.listen(PORT, () => {
  console.log(`ABOG case list app listening on port ${PORT}`);
});
