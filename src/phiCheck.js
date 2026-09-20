// Lightweight, heuristic scan for text that looks like one of the 18 HIPAA
// Safe Harbor identifiers (45 CFR 164.514(b)(2)). This is advisory, not a
// guarantee — it catches obvious slips (a pasted SSN, phone number, email,
// MRN, or full name) so the user can catch themselves before saving, but it
// cannot prove a field is truly de-identified. The fields this tool asks
// for (initials, age, service date, de-identified reference) are the ones
// ABOG's own case list format expects; everything else is free text and is
// exactly where an accidental copy-paste from a real note tends to land.

const CHECKS = [
  { name: 'Social Security Number', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'Phone number', re: /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/ },
  { name: 'Email address', re: /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/ },
  { name: 'Medical record / account number label', re: /\b(mrn|medical record( number)?|account\s*#|acct\.?\s*#)\s*[:#]?\s*\d+/i },
  { name: 'Street address', re: /\b\d{1,6}\s+\w+(\s\w+)?\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard|way|court|ct)\b/i },
  { name: 'Full date of birth', re: /\b(date of birth|dob)\s*[:#]?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\b/i },
  { name: 'Explicit patient name label', re: /\b(patient name|pt name|name)\s*[:#]\s*[A-Z][a-z]+\s+[A-Z][a-z]+/ },
  { name: 'Possible full name (two capitalized words)', re: /\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/ },
];

const FIELDS_TO_SCAN = [
  'patient_initials', 'patient_ref', 'diagnosis_text', 'procedure_text',
  'complications', 'notes', 'source_note',
];

function scanFields(data) {
  const warnings = [];
  for (const field of FIELDS_TO_SCAN) {
    const value = data[field];
    if (!value) continue;
    for (const check of CHECKS) {
      if (check.re.test(value)) {
        // The "possible full name" heuristic is noisy on ordinary medical
        // prose (e.g. "Low Transverse", "Arrest Disorder"), so only flag it
        // on the fields meant to be short (initials/reference), not free text.
        if (check.name.startsWith('Possible full name') && !['patient_initials', 'patient_ref'].includes(field)) {
          continue;
        }
        warnings.push({ field, reason: check.name });
      }
    }
  }
  if (data.patient_initials && data.patient_initials.trim().length > 5) {
    warnings.push({ field: 'patient_initials', reason: 'Longer than initials — make sure this is not a full name' });
  }
  return warnings;
}

module.exports = { scanFields };
