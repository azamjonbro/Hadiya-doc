// Employee record vocabulary shared by the API and the SPAs: the shapes a
// personnel form offers and the server stores.

/** Biological sex as the HR record keeps it. '' means "not recorded". */
export const GENDERS = Object.freeze({
  MALE: 'MALE',
  FEMALE: 'FEMALE',
})

export const GENDER_VALUES = Object.values(GENDERS)

/**
 * The named lists an admin curates from the employee form itself — job
 * titles, departments, subdivisions and countries. Branches predate this and
 * keep their own collection and page; these four share one collection keyed
 * by type, because they differ in nothing but the label above the select.
 */
export const ORG_LIST_TYPES = Object.freeze({
  POSITION: 'POSITION',
  DEPARTMENT: 'DEPARTMENT',
  SUBDIVISION: 'SUBDIVISION',
  COUNTRY: 'COUNTRY',
})

export const ORG_LIST_TYPE_VALUES = Object.values(ORG_LIST_TYPES)

/**
 * Surname first, then the given name, then the patronymic — the order every
 * document, list and report in this app shows a person in ("Xalilov Doston
 * Anvarovich"). `fullName` stays on the user document as the one field
 * everything else already reads; it is composed here so the parts and the
 * whole can never drift apart.
 */
export function composeFullName(firstName, lastName, patronymic = '') {
  return [lastName, firstName, patronymic]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * The inverse, for records written before the form had separate fields. The
 * first word is the surname and whatever follows is the given name(s), which
 * is how these were typed; a single word is taken as the given name, since an
 * entry with one word is far more often "Dilshod" than a bare surname. The
 * patronymic is not guessed at — a third word may as well be a second given
 * name, and it is cheaper for an admin to fill one field than to fix a wrong one.
 */
export function splitFullName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') }
}
