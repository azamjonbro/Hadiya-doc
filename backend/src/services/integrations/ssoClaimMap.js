/**
 * Turning an identity provider's claims into this platform's fields (11.4).
 *
 * Pure functions, separate from the protocol and the database, because
 * this is the part that is *wrong* on the first attempt at every new
 * provider — a department under a different claim name, groups arriving as
 * a string instead of a list, a `name` that is "Surname Firstname" — and
 * being able to test it against a claim set nobody has to authenticate for
 * is what makes that a five-minute fix.
 */

/**
 * Reads a possibly nested claim (`extension.department`).
 *
 * Dotted, because providers do nest: Entra ID puts custom attributes under
 * `extension_<appid>_<name>` at the top level but a proxy or a claims
 * transformation will happily deliver `custom.department`.
 */
export function readClaim(claims, path) {
  if (!path) return undefined
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), claims)
}

function text(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.length ? String(value[0]).trim() : ''
  return String(value).trim()
}

/**
 * Splits a single `name` claim when the halves are not sent separately.
 *
 * "Firstname Lastname" is the overwhelming convention in OIDC `name`,
 * while this platform displays "Lastname Firstname" — so the *order* is
 * not guessed from the string, only the split is. A single word becomes
 * the first name, because that is what a mononym is.
 */
export function splitFullName(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** The attributes this platform stores, read out of one claim set. */
export function mapAttributes(claims, sso) {
  const names = sso?.claims ?? {}
  const email = text(readClaim(claims, names.email || 'email')).toLowerCase()
  let firstName = text(readClaim(claims, names.firstName || 'given_name'))
  let lastName = text(readClaim(claims, names.lastName || 'family_name'))
  const fullNameClaim = text(readClaim(claims, names.fullName || 'name'))

  // Only fall back to splitting when the halves are genuinely absent: a
  // provider that sends both is more reliable than any split of ours.
  if (!firstName && !lastName && fullNameClaim) {
    const split = splitFullName(fullNameClaim)
    firstName = split.firstName
    lastName = split.lastName
  }

  return {
    // The login identifier this platform keys people by. Empty unless the
    // deployment configured a claim for it — see oidcAuth.service.js on
    // why an account is not invented without one.
    jshshir: text(readClaim(claims, names.jshshir)).replace(/\D/g, ''),
    email,
    firstName,
    lastName,
    // Composed the way the rest of the platform composes it, from the
    // halves, rather than taken from `name` — otherwise an SSO user's
    // displayed name would be ordered differently from everybody else's.
    fullName: [lastName, firstName].filter(Boolean).join(' ') || fullNameClaim,
    department: text(readClaim(claims, names.department)),
    branch: text(readClaim(claims, names.branch)),
    position: text(readClaim(claims, names.position)),
    employeeNumber: text(readClaim(claims, names.employeeNumber)),
  }
}

/**
 * claim → role, first rule that matches.
 *
 * A list claim (`groups`) matches when it *contains* the value; a string
 * claim when it equals it. Nothing here is case-insensitive: group names
 * are identifiers at the provider, and quietly matching "lms-admins"
 * against "LMS-Admins" would make a typo grant an admin role.
 */
export function resolveRoleName(claims, sso) {
  for (const rule of sso?.roleRules ?? []) {
    const value = readClaim(claims, rule.claim)
    if (value == null) continue
    const matched = Array.isArray(value)
      ? value.map(String).includes(rule.equals)
      : String(value) === rule.equals
    if (matched) return rule.roleName
  }
  return sso?.defaultRoleName || 'EMPLOYEE'
}

/**
 * Whether this address may sign in at all.
 *
 * An empty allow-list means any address the provider vouches for, which is
 * only safe on a single-tenant provider — with a shared one (Google, or a
 * tenant with guest accounts) it authenticates people who have nothing to
 * do with this company. Subdomains do **not** match: `example.uz` allows
 * `a@example.uz` and not `a@guests.example.uz`, because a subdomain is
 * frequently exactly where the guests are.
 */
export function emailAllowed(email, domains = []) {
  if (!domains.length) return true
  const at = String(email ?? '').lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).toLowerCase()
  return domains.map((entry) => String(entry).toLowerCase()).includes(domain)
}
