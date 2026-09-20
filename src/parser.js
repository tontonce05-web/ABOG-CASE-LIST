// Heuristic parser that scans a pasted clinical note and suggests field
// values for the "quick add" case form. Nothing here is saved automatically
// — the user always reviews/edits the suggestions before the case is
// created, and the raw note itself is never persisted.

const PROCEDURE_LOOKUP = [
  { keywords: ['spontaneous vaginal delivery', 'svd', 'normal vaginal delivery', 'nsvd'], category: 'Vaginal Delivery — Spontaneous', code: '59400', text: 'Vaginal delivery, spontaneous' },
  { keywords: ['vacuum', 'vacuum-assisted', 'forceps'], category: 'Vaginal Delivery — Operative (Forceps/Vacuum)', code: '59409', text: 'Vaginal delivery, operative (forceps/vacuum)' },
  { keywords: ['vbac', 'vaginal birth after cesarean'], category: 'VBAC', code: '59612', text: 'Vaginal delivery after previous cesarean' },
  { keywords: ['repeat cesarean', 'repeat c-section', 'repeat csection'], category: 'Cesarean Delivery — Repeat', code: '59514', text: 'Cesarean delivery, repeat' },
  { keywords: ['primary cesarean', 'cesarean section', 'c-section', 'csection', 'cesarean delivery'], category: 'Cesarean Delivery — Primary', code: '59510', text: 'Cesarean delivery, primary' },
  { keywords: ['postpartum hemorrhage', 'pph'], category: 'Obstetric Complications (e.g. PPH, Preeclampsia, PTL)', code: null, text: 'Postpartum hemorrhage' },
  { keywords: ['preeclampsia', 'eclampsia', 'hellp'], category: 'Obstetric Complications (e.g. PPH, Preeclampsia, PTL)', code: null, text: 'Hypertensive disorder of pregnancy' },
  { keywords: ['preterm labor', 'ptl'], category: 'Obstetric Complications (e.g. PPH, Preeclampsia, PTL)', code: null, text: 'Preterm labor' },
  { keywords: ['total abdominal hysterectomy', 'tah'], category: 'Major Gynecologic Surgery', code: '58150', text: 'Total abdominal hysterectomy' },
  { keywords: ['total laparoscopic hysterectomy', 'tlh', 'laparoscopic hysterectomy'], category: 'Laparoscopy / Minimally Invasive Gyn Surgery', code: '58571', text: 'Laparoscopic total hysterectomy' },
  { keywords: ['vaginal hysterectomy'], category: 'Major Gynecologic Surgery', code: '58260', text: 'Vaginal hysterectomy' },
  { keywords: ['myomectomy'], category: 'Major Gynecologic Surgery', code: '58140', text: 'Myomectomy' },
  { keywords: ['diagnostic laparoscopy', 'laparoscopy'], category: 'Laparoscopy / Minimally Invasive Gyn Surgery', code: '49320', text: 'Diagnostic laparoscopy' },
  { keywords: ['salpingectomy', 'oophorectomy', 'salpingo-oophorectomy', 'bso'], category: 'Laparoscopy / Minimally Invasive Gyn Surgery', code: '58661', text: 'Laparoscopic salpingectomy/oophorectomy' },
  { keywords: ['hysteroscopy'], category: 'Hysteroscopy', code: '58558', text: 'Hysteroscopy with biopsy/polypectomy' },
  { keywords: ['dilation and curettage', 'd&c', 'd and c'], category: 'Minor Gynecologic Surgery / Office Procedures', code: '58120', text: 'Dilation and curettage' },
  { keywords: ['leep', 'cone biopsy', 'conization'], category: 'Minor Gynecologic Surgery / Office Procedures', code: '57460', text: 'Cervical conization / LEEP' },
  { keywords: ['sling', 'midurethral sling', 'incontinence procedure'], category: 'Urogynecology / Pelvic Floor', code: '57288', text: 'Sling operation for stress incontinence' },
  { keywords: ['pelvic organ prolapse', 'sacrocolpopexy', 'colporrhaphy'], category: 'Urogynecology / Pelvic Floor', code: null, text: 'Pelvic organ prolapse repair' },
  { keywords: ['staging laparotomy', 'debulking', 'ovarian cancer', 'endometrial cancer'], category: 'Gynecologic Oncology', code: null, text: 'Gynecologic oncology surgery' },
  { keywords: ['iud placement', 'iud insertion', 'nexplanon', 'implant insertion'], category: 'Family Planning (Contraception/Abortion Care)', code: '58300', text: 'Contraceptive device insertion' },
  { keywords: ['dilation and evacuation', 'd&e', 'abortion'], category: 'Family Planning (Contraception/Abortion Care)', code: null, text: 'Pregnancy termination procedure' },
  { keywords: ['ivf', 'iui', 'infertility', 'ovulation induction'], category: 'Reproductive Endocrinology / Infertility', code: null, text: 'Infertility management/procedure' },
];

function findFirst(text, regex) {
  const m = text.match(regex);
  return m ? m[0] : null;
}

function parseNote(rawText) {
  const text = (rawText || '').toString();
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

  // Complications
  const complicationKeywords = [
    'hemorrhage', 'laceration', 'infection', 'transfusion', 'reoperation',
    'injury', 'dehiscence', 'readmission', 'complication',
  ];
  const negations = /\b(no|none|denies|without|negative for|no evidence of|uncomplicated)\b/;
  const foundComplications = complicationKeywords.filter((k) => {
    const idx = lower.indexOf(k);
    if (idx === -1) return false;
    // Look at the few words immediately before the keyword for a negation
    // ("no complications", "without hemorrhage") so a clean note doesn't
    // get flagged as having a complication it explicitly ruled out.
    const preceding = lower.slice(Math.max(0, idx - 20), idx);
    return !negations.test(preceding);
  });
  if (foundComplications.length) {
    suggestions.complications = capitalize(foundComplications.join(', '));
  }

  // Procedure / category match — first hit wins, ordered by specificity above.
  for (const entry of PROCEDURE_LOOKUP) {
    if (entry.keywords.some((k) => lower.includes(k))) {
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
