# HIPAA notes for this project

*This is engineering guidance, not legal advice. If this tool will ever
hold real patient information, or you're unsure whether something counts
as PHI, check with your institution's compliance/privacy office.*

## The short version

ABOG's own case list rules require **de-identified** cases. This app is
built around that same requirement: it only asks for fields ABOG actually
wants (initials, age, date of service, diagnosis/procedure codes, etc.),
it warns you before saving anything that looks like a name, SSN, phone
number, MRN, or address, and it never stores the free-text note you paste
in unless you explicitly check "keep note." If you only ever enter
properly de-identified data, HIPAA's Privacy Rule doesn't apply to what's
in the database, because de-identified data isn't PHI (45 CFR 164.514).

The technical safeguards below exist as a second layer of protection, in
case something identifying slips through anyway.

## What HIPAA actually requires

HIPAA's rules apply to "covered entities" (you, as a licensed provider)
and their "business associates" (anyone handling PHI on your behalf — here,
that's AWS). Three rules matter for a tool like this:

- **Privacy Rule** — governs how PHI may be used/disclosed, and defines
  de-identification. Two ways to de-identify: **Safe Harbor** (strip all 18
  listed identifier types, see below) or **Expert Determination** (a
  statistician certifies re-identification risk is very small). This app
  is built around Safe Harbor.
- **Security Rule** — administrative, physical, and technical safeguards
  for *electronic* PHI (ePHI). This is the part software can actually help
  with, and where this app's design choices live (see table below).
- **Breach Notification Rule** — if ePHI is exposed, covered entities must
  notify affected individuals (and sometimes HHS/media) within set
  timeframes. Keeping PHI out of the system in the first place is the best
  way to make this a non-issue.

### The 18 Safe Harbor identifiers (45 CFR 164.514(b)(2))

Don't enter any of these into free-text fields: names; geographic
subdivisions smaller than a state; all elements of dates (except year)
directly tied to an individual, including birth date, admission/discharge
date, and — for those over 89 — age; phone/fax numbers; email addresses;
SSNs; medical record numbers; health plan beneficiary numbers; account
numbers; certificate/license numbers; vehicle identifiers; device
identifiers/serial numbers; URLs; IP addresses; biometric identifiers;
full-face photos; any other unique identifying number, characteristic, or
code.

**Important nuance:** ABOG's own format asks for the *date of service* and
*age in years*, which are technically two of the 18 identifiers under a
strict Safe Harbor reading (exact dates and ages ≥90 are restricted; ages
under 90 alone are generally fine). This app doesn't strip those, because
ABOG requires them — this is the same tradeoff ABOG's own case list system
makes. Treat data in this app as "de-identified per ABOG's convention," not
a formal Safe Harbor data set, and keep everything else (names, MRNs,
addresses, contact info) out entirely.

## How this app is built to help

| Security Rule safeguard | What's implemented |
|---|---|
| Access control (§164.312(a)) | PIN gate, bcrypt-hashed, rate-limited (20/15min) with a 5-attempt lockout window per IP |
| Automatic logoff (§164.312(a)(2)(iii)) | Sessions expire after 20 minutes idle (rolling) |
| Audit controls (§164.312(b)) | Every login, case create/update/delete, PIN change, and CSV export is written to an `audit_log` table |
| Integrity (§164.312(c)) | Parameterized SQL everywhere (no injection), server-side validation on all writes |
| Transmission security (§164.312(e)) | Deployment guide requires HTTPS end-to-end; HSTS header enforced; session cookies are `Secure`/`HttpOnly`/`SameSite=Lax` |
| PHI minimization (Privacy Rule, minimum necessary) | Only ABOG-relevant fields are collected; pasted notes are discarded by default; the confirm-before-save screen flags likely identifiers |

Also included, as general web-app hardening: CSRF tokens on every
state-changing form, `helmet` security headers / CSP, non-root Docker user,
and an encrypted EBS volume in the deployment guide.

### What's *not* automatically handled — this is on you

- **Sign the AWS Business Associate Addendum** (free, via AWS Artifact)
  before deploying, even though the plan is to store de-identified data
  only. Belt and suspenders. See `deploy/README.md`.
- **Only use AWS's HIPAA-eligible services** if you build anything beyond
  what's in the deploy guide (EC2, EBS, and Elastic IP are all eligible).
- **A written risk analysis** (45 CFR 164.308(a)(1)) is technically
  required of covered entities and is a "you" task, not a code task — a
  short document describing what data this tool holds, who can access it,
  and what could go wrong satisfies it for a single-user tool like this.
- **Physical/device security** — lock the devices you use to access this
  site; HIPAA's Security Rule also covers workstation/physical safeguards
  that no web app can enforce for you.
- **Backups** — turn on AWS Backup for the EBS volume (covered in the
  deploy guide) so a lost instance doesn't mean lost case data.
- **Retention/disposal** — decide how long you keep cases after your exam
  cycle and delete/export-then-delete accordingly.

## Standing rule for future changes to this app

Any new feature added to this codebase should keep the same posture:
collect the minimum data ABOG actually needs, default to *not* persisting
free-text/raw input, run new user-supplied text through the PHI heuristic
scan (`src/phiCheck.js`) before it's written to the database, and log
create/update/delete/export actions to the audit log (`src/audit.js`).
