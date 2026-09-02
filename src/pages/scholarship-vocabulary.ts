/* The vocabularies the eligibility editor writes against.
 *
 * Every value here has to match a Postgres enum or a stored profile value
 * exactly. That is the whole reason this file exists rather than a text box:
 * a rule written as `gender EQ "female"` is accepted by the API, stored, and
 * then silently matches nobody, because the column holds 'FEMALE'. The author
 * gets no error and no match — the worst failure this system has, because it
 * looks like a scheme nobody qualifies for rather than like a bug.
 *
 * Mirrors 0001_extensions_and_enums.sql and the profile_field rows seeded in
 * 0004_document_vault.sql.
 */

export type FieldKind = 'number' | 'choice'

export interface RuleField {
  value: string
  label: string
  kind: FieldKind
  /** For number fields: what the figure is in, shown beside the input. */
  unit?: string
  hint?: string
  /** For choice fields: the exact stored values, with how to write them. */
  options?: { value: string; label: string }[]
}

const DISABILITY_TYPES = [
  'BLINDNESS', 'LOW_VISION', 'LEPROSY_CURED', 'HEARING_IMPAIRMENT',
  'LOCOMOTOR_DISABILITY', 'DWARFISM', 'INTELLECTUAL_DISABILITY', 'MENTAL_ILLNESS',
  'AUTISM_SPECTRUM_DISORDER', 'CEREBRAL_PALSY', 'MUSCULAR_DYSTROPHY',
  'CHRONIC_NEUROLOGICAL_CONDITION', 'SPECIFIC_LEARNING_DISABILITY',
  'MULTIPLE_SCLEROSIS', 'SPEECH_AND_LANGUAGE_DISABILITY', 'THALASSEMIA',
  'HAEMOPHILIA', 'SICKLE_CELL_DISEASE', 'MULTIPLE_DISABILITIES',
  'ACID_ATTACK_VICTIM', 'PARKINSONS_DISEASE',
] as const

/* The tokens that are initialisms rather than words, and must not be title
 * cased: "Sc and St categories" is not what anybody calls them, and this text is
 * read by a student who has just been refused.
 *
 * An explicit set rather than a length rule. "Is it four letters or fewer"
 * would also catch LOW in LOW_VISION and give "LOW vision". */
const ACRONYMS = new Set(['SC', 'ST', 'OBC', 'EWS', 'UDID'])

/** Title case from SCREAMING_SNAKE, with the initialisms left alone. */
function pretty(v: string) {
  return v.split('_')
    .map(w => (ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ')
}

const asOptions = (values: readonly string[]) =>
  values.map(v => ({ value: v, label: pretty(v) }))

/* The states and union territories, by the code stored on a profile. Offered as
 * a list because `state_code` is a free string column: a rule written against
 * "Delhi" rather than "DL" is valid, stored, and matches nobody. */
export const STATE_CODES: { value: string; label: string }[] = [
  { value: 'AN', label: 'Andaman and Nicobar Islands' },
  { value: 'AP', label: 'Andhra Pradesh' },
  { value: 'AR', label: 'Arunachal Pradesh' },
  { value: 'AS', label: 'Assam' },
  { value: 'BR', label: 'Bihar' },
  { value: 'CH', label: 'Chandigarh' },
  { value: 'CT', label: 'Chhattisgarh' },
  { value: 'DH', label: 'Dadra and Nagar Haveli and Daman and Diu' },
  { value: 'DL', label: 'Delhi' },
  { value: 'GA', label: 'Goa' },
  { value: 'GJ', label: 'Gujarat' },
  { value: 'HR', label: 'Haryana' },
  { value: 'HP', label: 'Himachal Pradesh' },
  { value: 'JK', label: 'Jammu and Kashmir' },
  { value: 'JH', label: 'Jharkhand' },
  { value: 'KA', label: 'Karnataka' },
  { value: 'KL', label: 'Kerala' },
  { value: 'LA', label: 'Ladakh' },
  { value: 'LD', label: 'Lakshadweep' },
  { value: 'MP', label: 'Madhya Pradesh' },
  { value: 'MH', label: 'Maharashtra' },
  { value: 'MN', label: 'Manipur' },
  { value: 'ML', label: 'Meghalaya' },
  { value: 'MZ', label: 'Mizoram' },
  { value: 'NL', label: 'Nagaland' },
  { value: 'OR', label: 'Odisha' },
  { value: 'PY', label: 'Puducherry' },
  { value: 'PB', label: 'Punjab' },
  { value: 'RJ', label: 'Rajasthan' },
  { value: 'SK', label: 'Sikkim' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'TG', label: 'Telangana' },
  { value: 'TR', label: 'Tripura' },
  { value: 'UP', label: 'Uttar Pradesh' },
  { value: 'UT', label: 'Uttarakhand' },
  { value: 'WB', label: 'West Bengal' },
]

/* What the engine can actually evaluate.
 *
 * A fixed list rather than free text because a rule naming a field the engine
 * does not know never fires, and the author has no way to tell. These are the
 * profile_field rows; anything not here belongs in the eligibility summary as
 * prose, where it is honestly presented as something a person must check.
 */
export const RULE_FIELDS: RuleField[] = [
  {
    value: 'disability_percent', label: 'Certified disability', kind: 'number', unit: '%',
    hint: 'The figure on the disability certificate. 40% is the statutory threshold most schemes use.',
  },
  {
    value: 'disability_type', label: 'Disability type', kind: 'choice',
    options: asOptions(DISABILITY_TYPES),
    hint: 'The 21 conditions recognised by the RPwD Act. Leave every box clear for a scheme open to all of them.',
  },
  {
    value: 'annual_family_income', label: 'Annual family income', kind: 'number', unit: '₹',
    hint: 'Almost always an upper limit — use "is at most".',
  },
  {
    value: 'academic_percentage', label: 'Academic percentage', kind: 'number', unit: '%',
  },
  {
    value: 'course_level', label: 'Level of study', kind: 'choice',
    options: asOptions(['SCHOOL', 'UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORAL']),
    hint: 'Tick every level the scheme accepts. This is how a minimum and maximum qualification are expressed.',
  },
  {
    value: 'current_year', label: 'Year of study', kind: 'number',
  },
  {
    value: 'state_code', label: 'State of domicile', kind: 'choice',
    options: STATE_CODES,
  },
  {
    value: 'social_category', label: 'Social category', kind: 'choice',
    options: asOptions(['GENERAL', 'EWS', 'OBC', 'SC', 'ST']),
  },
  {
    value: 'gender', label: 'Gender', kind: 'choice',
    options: asOptions(['MALE', 'FEMALE', 'TRANSGENDER', 'UNDISCLOSED']),
    hint: 'Leave every box clear for a scheme open to everyone — that is what "no restriction" means to the engine. Ticking all four is not the same thing and makes the matcher do work for nothing.',
  },
  {
    value: 'age', label: 'Age', kind: 'number', unit: 'years',
  },
  {
    value: 'institution_type', label: 'Institution type', kind: 'choice',
    options: asOptions(['GOVERNMENT', 'GOVERNMENT_AIDED', 'PRIVATE', 'DEEMED', 'AUTONOMOUS']),
  },
]

export const fieldByName = (name: string) => RULE_FIELDS.find(f => f.value === name)

/** Numeric comparisons. Choice fields derive their operator from the selection. */
export const NUMBER_OPS = [
  { value: 'GTE', label: '≥' },
  { value: 'LTE', label: '≤' },
  { value: 'EQ', label: '=' },
] as const

export const AWARD_BASES = [
  { value: 'MERIT', label: 'Merit' },
  { value: 'NEED', label: 'Need' },
  { value: 'MERIT_CUM_MEANS', label: 'Merit-cum-means' },
  { value: 'CATEGORY', label: 'Category' },
  { value: 'OTHER', label: 'Other' },
] as const

/** How a derived tag is written for a person. These are computed server-side
 *  from the rules, so the panel only has to name them. */
export const DERIVED_TAG_LABELS: Record<string, string> = {
  'pwd-specific': 'PwD-specific',
  'women-only': 'Women-only',
  'state-specific': 'State-specific',
  'need-tested': 'Income-tested',
  'merit-tested': 'Merit-tested',
}

/* --- saying a condition out loud ---------------------------------------------
 *
 * FR-05: a blocked applicant is told which condition stopped them, in the
 * author's words. That makes the description the one field here with a reader
 * who is not an operator, and the one where a stale sentence does real harm —
 * being refused is bad enough without being told the wrong reason.
 *
 * So it is generated from the rule and regenerated as the rule changes, up
 * until the author edits it. After that it is theirs: a default that overwrote
 * deliberate wording would be worse than one that was never offered.
 */

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
})

/** "A", "A and B", "A, B and C" — an Oxford-comma-free list, as read aloud. */
function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function labelsFor(field: RuleField, picks: string[]): string {
  const byValue = new Map((field.options ?? []).map(o => [o.value, o.label]))
  return joinList(picks.map(p => byValue.get(p) ?? p))
}

/* One sentence per field, because the natural phrasing differs per field and a
 * generic "field is at least value" reads like a database error. Falls back to
 * that shape only for a field with no phrasing of its own. */
export function describeRule(
  fieldName: string, op: string, value: string, picks: string[],
): string {
  const field = fieldByName(fieldName)
  if (!field) return ''

  if (field.kind === 'choice') {
    if (picks.length === 0) return ''
    const list = labelsFor(field, picks)

    switch (fieldName) {
      case 'gender':
        // The common case reads badly as "open to students whose gender is
        // Female", and this is the sentence a refused student sees.
        if (picks.length === 1 && picks[0] === 'FEMALE') {
          return 'This scheme is open to women only.'
        }
        if (picks.length === 1 && picks[0] === 'MALE') {
          return 'This scheme is open to men only.'
        }
        return `This scheme is open to students who are ${list.toLowerCase()}.`
      case 'state_code':
        return `This scheme is open to students living in ${list}.`
      case 'course_level':
        return `This scheme is for ${list.toLowerCase()} students.`
      case 'disability_type':
        return `This scheme is for students with ${list.toLowerCase()}.`
      case 'social_category':
        return `This scheme is for students in the ${list} ${picks.length === 1 ? 'category' : 'categories'}.`
      case 'institution_type':
        return `This scheme is for students at ${list.toLowerCase()} institutions.`
      default:
        return `This scheme is for students whose ${field.label.toLowerCase()} is ${list}.`
    }
  }

  const n = value.trim()
  if (!n) return ''

  const amount = Number(n)
  const money = Number.isFinite(amount) ? RUPEES.format(amount) : n

  switch (fieldName) {
    case 'disability_percent':
      if (op === 'LTE') return `This scheme is for a certified disability of ${n}% or less.`
      if (op === 'EQ') return `This scheme is for a certified disability of exactly ${n}%.`
      return `This scheme needs a certified disability of ${n}% or more.`
    case 'annual_family_income':
      if (op === 'GTE') return `This scheme is for families earning ${money} a year or more.`
      if (op === 'EQ') return `This scheme is for families earning exactly ${money} a year.`
      return `This scheme is for families earning up to ${money} a year.`
    case 'academic_percentage':
      if (op === 'LTE') return `This scheme is for marks of ${n}% or below.`
      if (op === 'EQ') return `This scheme is for marks of exactly ${n}%.`
      return `This scheme needs at least ${n}% in your last examination.`
    case 'current_year':
      if (op === 'LTE') return `This scheme is for students in year ${n} or earlier.`
      if (op === 'EQ') return `This scheme is for students in year ${n}.`
      return `This scheme is for students in year ${n} or later.`
    case 'age':
      if (op === 'LTE') return `This scheme is for students aged ${n} or under.`
      if (op === 'EQ') return `This scheme is for students aged exactly ${n}.`
      return `This scheme is for students aged ${n} or over.`
    default: {
      const rel = op === 'LTE' ? 'at most' : op === 'EQ' ? 'exactly' : 'at least'
      return `This scheme needs a ${field.label.toLowerCase()} of ${rel} ${n}.`
    }
  }
}
