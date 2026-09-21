# ABOG Case List

A private, PIN-protected web app for building and maintaining your ABOG
Step 2 certifying-exam case list — the [de-identified case log ABOG
requires](https://www.abog.org/get-certified/specialty-certification/step-2-certifying-exam/case-list)
for General OB/GYN certification.

## Features

- **PIN-gated access** (default `1732` — change it immediately from
  Settings). Bcrypt-hashed, rate-limited, with a lockout after repeated
  failed attempts, and a 20-minute idle session timeout.
- **Dashboard** showing progress toward your category minimums (set your
  own numbers from the current ABOG bulletin under Settings), grouped into
  Obstetrics / Gynecology / Other sections.
- **Add cases by hand**, or **quick-add from a note**: paste a short OR-note
  line, or a full H&P / Assessment & Plan / Problem List, and the app
  suggests age, gestational age, delivery type, procedure/CPT code,
  diagnosis, role, and category — you review and edit before saving. Lines
  that look like a name, DOB, MRN, or attending label are dropped before
  parsing. Nothing is auto-saved, and the pasted text is discarded unless
  you opt in to keep it.
- **Built-in PHI check**: before any case is saved, free-text fields are
  scanned for things that look like names, SSNs, phone numbers, MRNs, or
  addresses, and you're asked to confirm before proceeding.
- **CSV export** of the full case list for your own records or to speed up
  manual entry into ABOG's portal.
- **Audit log** of logins, case changes, and exports.

See [`docs/HIPAA-COMPLIANCE.md`](docs/HIPAA-COMPLIANCE.md) for the full
privacy/security design and what you're responsible for beyond the app
itself.

## Local development

```bash
npm install
cp .env.example .env
npm start
# open http://localhost:3000 and sign in with PIN 1732
```

Or with Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Deploying privately on AWS

See [`deploy/README.md`](deploy/README.md) for step-by-step instructions
(a small EC2 instance, HTTPS via Caddy, an encrypted data volume, and the
AWS BAA you should sign first).

## Tech stack

Node.js + Express, server-rendered EJS views, SQLite (`better-sqlite3`) —
no external database or third-party services required, so nothing about
your case list leaves the server you deploy it to.
