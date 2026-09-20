# ABOG Case List — project guidance

A private, PIN-gated web app for building a de-identified ABOG Step 2
certifying-exam case list. See `README.md` for setup and
`docs/HIPAA-COMPLIANCE.md` for the full privacy/security write-up.

## Standing constraint: don't regress the HIPAA-aligned safeguards

This app is built on the assumption that it only ever holds **de-identified**
data (matching what ABOG's own case list format requires). Any new
functionality added here — by a person or by Claude — must preserve that
posture:

- Don't add fields or features that invite entering real PHI (patient
  names, MRNs, full DOB, phone/address, etc.). If a feature needs free
  text, run it through `src/phiCheck.js` before it's persisted, the same
  way `src/routes/cases.js` does for case create/update.
- Don't persist raw pasted notes or uploaded documents by default. If a
  feature captures a raw note (like the quick-add parser), keep the
  existing pattern: discard it unless the user explicitly opts in, and
  never send it anywhere besides local parsing.
- Log security-relevant actions (login, PIN change, create/update/delete,
  export) to the `audit_log` table via `src/audit.js`.
- Keep the PIN auth hardened: bcrypt hashing, rate limiting + lockout on
  `/login`, CSRF tokens on state-changing routes, short rolling session
  timeout. Don't loosen these without a good reason.
- Keep `helmet`/CSP, HSTS, and secure-cookie settings intact; don't disable
  them for convenience.
- If you add a new deployment path (not the EC2+Caddy one in
  `deploy/README.md`), keep HTTPS end-to-end and an encrypted data volume,
  and keep AWS to HIPAA-eligible services per `docs/HIPAA-COMPLIANCE.md`.
- If you touch the `cases` schema or CSV export, keep them limited to
  ABOG-relevant fields — don't quietly add PHI-shaped columns (SSN, DOB,
  address, etc.).

When in doubt, prefer the more conservative option (don't store it, warn
before saving, log the action) over convenience.
