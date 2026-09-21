// Heuristic parser that scans a pasted clinical note and suggests field
// values for the "quick add" case form. Nothing here is saved automatically
// — the user always reviews/edits the suggestions before the case is
// created, and the raw note itself is never persisted.

// Category names below are ABOG's own real case-list categories (see
// src/abogRequirements.js), not an approximation. A normal, uncomplicated
// spontaneous vaginal delivery has no category here on purpose — ABOG's own
// Obstetrics guidelines say normal patients should not be listed at all.
const PROCEDURE_LOOKUP = [
  { keywords: ['spontaneous vaginal delivery', 'svd', 'normal vaginal delivery', 'nsvd'], category: null, code: '59400', text: 'Vaginal delivery, spontaneous' },
  { keywords: ['vacuum', 'vacuum-assisted', 'forceps'], category: 'Operative vaginal deliveries', code: '59409', text: 'Vaginal delivery, operative (forceps/vacuum)' },
  { keywords: ['vbac', 'vaginal birth after cesarean'], category: 'Prior cesarean delivery', code: '59612', text: 'Vaginal delivery after previous cesarean' },
  { keywords: ['repeat cesarean', 'repeat c-section', 'repeat csection'], category: 'Cesarean deliveries', code: '59514', text: 'Cesarean delivery, repeat' },
  { keywords: ['primary cesarean', 'cesarean section', 'c-section', 'csection', 'cesarean delivery'], category: 'Cesarean deliveries', code: '59510', text: 'Cesarean delivery, primary' },
  { keywords: ['postpartum hemorrhage', 'pph'], category: 'Postpartum hemorrhage and uterine inversion', code: null, text: 'Postpartum hemorrhage' },
  { keywords: ['preeclampsia', 'eclampsia', 'hellp'], category: 'Hypertensive disorders of pregnancy', code: null, text: 'Hypertensive disorder of pregnancy' },
  { keywords: ['preterm labor', 'ptl'], category: 'Spontaneous pre-term birth (including preterm labor/delivery, cervical insufficiency, PPROM)', code: null, text: 'Preterm labor' },
  { keywords: ['total abdominal hysterectomy', 'tah'], category: 'Abdominal hysterectomy', code: '58150', text: 'Total abdominal hysterectomy' },
  { keywords: ['total laparoscopic hysterectomy', 'tlh', 'laparoscopic hysterectomy'], category: 'Minimally invasive hysterectomy', code: '58571', text: 'Laparoscopic total hysterectomy' },
  { keywords: ['vaginal hysterectomy'], category: 'Minimally invasive hysterectomy', code: '58260', text: 'Vaginal hysterectomy' },
  { keywords: ['myomectomy'], category: 'Abdominal myomectomy', code: '58140', text: 'Myomectomy' },
  { keywords: ['diagnostic laparoscopy', 'laparoscopy'], category: 'Operative laparoscopy', code: '49320', text: 'Diagnostic laparoscopy' },
  { keywords: ['salpingectomy', 'oophorectomy', 'salpingo-oophorectomy', 'bso'], category: 'Operative laparoscopy', code: '58661', text: 'Laparoscopic salpingectomy/oophorectomy' },
  { keywords: ['hysteroscopy'], category: 'Operative hysteroscopy', code: '58558', text: 'Hysteroscopy with biopsy/polypectomy' },
  { keywords: ['dilation and curettage', 'd&c', 'd and c'], category: 'Dilation and curettage (non-obstetric)', code: '58120', text: 'Dilation and curettage' },
  { keywords: ['leep', 'cone biopsy', 'conization'], category: 'Excisional procedures for preinvasive cervical disease', code: '57460', text: 'Cervical conization / LEEP' },
  { keywords: ['sling', 'midurethral sling', 'incontinence procedure'], category: 'Surgical repair of urinary incontinence', code: '57288', text: 'Sling operation for stress incontinence' },
  { keywords: ['pelvic organ prolapse', 'sacrocolpopexy', 'colporrhaphy'], category: 'Surgical repair of pelvic organ prolapse, including apical prolapse and colpocleisis', code: null, text: 'Pelvic organ prolapse repair' },
  { keywords: ['staging laparotomy', 'debulking', 'ovarian cancer', 'endometrial cancer'], category: 'Exploratory laparotomy', code: null, text: 'Gynecologic oncology surgery' },
  { keywords: ['iud placement', 'iud insertion', 'nexplanon', 'implant insertion'], category: 'Contraceptive counseling and management', code: '58300', text: 'Contraceptive device insertion' },
  { keywords: ['dilation and evacuation', 'd&e', 'abortion'], category: 'Obstetrical D&E and D&C (miscarriage and abortion management)', code: null, text: 'Pregnancy termination procedure' },
  { keywords: ['ivf', 'iui', 'infertility', 'ovulation induction'], category: 'Infertility and recurrent pregnancy loss', code: null, text: 'Infertility management/procedure' },
];

function findFirst(text, regex) {
  const m = text.match(regex);
  return m ? m[0] : null;
}

// Lines that look like an identifying-data label (from an H&P header block,
// EHR banner, etc.) never contribute to the suggestions below, whatever they
// contain — this runs before any other extraction.
const PHI_LABEL_LINE_RE = /^\s*(patient(\s*name)?|name|dob|date of birth|mrn|medical record(\s*number)?|account\s*#?|ssn|social security(\s*number)?|address|phone|attending|provider|physician|referring (physician|provider))\s*[:#]/i;

function stripIdentifyingLines(text) {
  return text
    .split('\n')
    .filter((line) => !PHI_LABEL_LINE_RE.test(line))
    .join('\n');
}

// H&P / consult / discharge-summary notes bury the actual diagnosis and
// procedure inside an Assessment/Plan or Problem List section, surrounded by
// HPI, PMH/PSH, meds, and social history that would otherwise pollute the
// category match (e.g. a prior cesarean mentioned in PSH). When one of these
// headers is present, scope procedure/diagnosis/complication matching to
// that section instead of the whole note.
const AUTHORITATIVE_HEADER_RE = /(assessment(\s*(and|&|\/)\s*plan)?|impression|a\s*\/\s*p|problem list|hospital course|procedures?\s+performed|^\s*plan)\s*:/im;
const NEXT_HEADER_RE = /\n[ \t]*[A-Za-z][A-Za-z /&]{2,40}[ \t]*:/;

function extractAuthoritativeSection(text) {
  const match = AUTHORITATIVE_HEADER_RE.exec(text);
  if (!match) return null;
  const start = match.index;
  const rest = text.slice(start + match[0].length);
  const nextMatch = NEXT_HEADER_RE.exec(rest);
  const end = nextMatch ? start + match[0].length + nextMatch.index : text.length;
  return text.slice(start, end);
}

function parseNote(rawText) {
  const text = stripIdentifyingLines((rawText || '').toString());
  const lower = text.toLowerCase();
  const suggestions = {};

  // Age: "34 year old", "34yo", "34 y/o", "34-year-old"
  const ageMatch = lower.match(/(\d{1,3})\s*[-]?\s*(?:year[-\s]?old|y\/o|yo\b)/);
  if (ageMatch) suggestions.age = parseInt(ageMatch[1], 10);

  // Gender heuristic (ABOG cases are overwhelmingly female patients, but
  // check for explicit mentions anyway).
  if (/\bmale\b/.test(lower) && !/\bfemale\b/.test(lower)) {
    suggestions.gender = 'Male';
  } else {
    suggestions.gender = 'Female';
  }

  // Gestational age: "39w2d", "39 weeks 2 days", "at 39 weeks"
  const gaMatch =
    lower.match(/(\d{1,2})\s*w(?:eeks)?\s*[,]?\s*(\d{1,2})?\s*d(?:ays)?/) ||
    lower.match(/(\d{1,2})\s*[-]?\s*weeks?\s*gestation/);
  if (gaMatch) {
    const weeks = gaMatch[1];
    const days = gaMatch[2] || '0';
    suggestions.gestational_age = `${weeks}w${days}d`;
  }

  // Date of service: ISO date, or MM/DD/YYYY
  const dateMatch =
    findFirst(text, /\b\d{4}-\d{2}-\d{2}\b/) ||
    findFirst(text, /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  if (dateMatch) {
    suggestions.date_of_service = normalizeDate(dateMatch);
  }

  // Explicit ICD-10 style code, e.g. O80, O70.1, Z30.430
  const icd = findFirst(text, /\b[A-TV-Z][0-9][0-9AB]\.?[0-9A-TV-Z]{0,4}\b/);
  if (icd) suggestions.diagnosis_code = icd;

  // Explicit CPT-style 5-digit code
  const cpt = findFirst(text, /\b\d{5}\b/);
  if (cpt) suggestions.procedure_code = cpt;

  // Role
  if (/\battending\b/.test(lower)) suggestions.role = 'Attending / Supervising Surgeon';
  else if (/\bsupervis(ed|ing)\b/.test(lower)) suggestions.role = 'Supervised Resident';
  else if (/\bfirst assist/.test(lower)) suggestions.role = 'First Assistant';
  else suggestions.role = 'Primary Surgeon';

  // Setting
  if (/\boutpatient\b|\boffice\b/.test(lower)) suggestions.setting = 'Outpatient';
  else if (/\bshort[-\s]?stay\b|\b23[-\s]?hour\b/.test(lower)) suggestions.setting = 'Short-Stay';
  else suggestions.setting = 'Inpatient';

  // If the note has an Assessment/Plan/Problem List/Hospital Course section,
  // scan that instead of the whole note so history sections (PMH, PSH, social
  // history) don't get mistaken for what this case actually is.
  const authoritative = extractAuthoritativeSection(text);
  const scanLower = (authoritative || text).toLowerCase();

  // Complications
  const complicationKeywords = [
    'hemorrhage', 'laceration', 'infection', 'transfusion', 'reoperation',
    'injury', 'dehiscence', 'readmission', 'complication',
  ];
  const negations = /\b(no|none|denies|without|negative for|no evidence of|uncomplicated)\b/;
  const foundComplications = complicationKeywords.filter((k) => {
    const idx = scanLower.indexOf(k);
    if (idx === -1) return false;
    // Look back to the start of the current clause for a negation, so a
    // negated list ("no evidence of hemorrhage or infection") clears every
    // item in it, not just the one right after the negation word.
    const clauseStart = Math.max(
      scanLower.lastIndexOf('.', idx),
      scanLower.lastIndexOf(';', idx),
      scanLower.lastIndexOf('\n', idx),
      idx - 200,
    ) + 1;
    const preceding = scanLower.slice(clauseStart, idx);
    return !negations.test(preceding);
  });
  if (foundComplications.length) {
    suggestions.complications = capitalize(foundComplications.join(', '));
  }

  // Procedure / category match — first hit wins, ordered by specificity above.
  for (const entry of PROCEDURE_LOOKUP) {
    if (entry.keywords.some((k) => scanLower.includes(k))) {
      suggestions.category_name = entry.category;
      suggestions.procedure_text = entry.text;
      if (!suggestions.procedure_code && entry.code) suggestions.procedure_code = entry.code;
      break;
    }
  }

  return suggestions;
}

function normalizeDate(str) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { parseNote };
