import { XMLParser } from 'fast-xml-parser'

/**
 * Reading `imsmanifest.xml`: which SCORM version, and where to start.
 *
 * A real parser rather than regexes, because a manifest is machine-generated
 * by half a dozen authoring tools and every one of them uses namespaces
 * differently — `adlcp:scormtype` here, `adlcp:scormType` there, sometimes
 * the whole document under a prefixed `imscp:manifest`. A pattern that works
 * on the export you tested with fails on the next tool the company buys.
 *
 * Only three things are read: the version, the launch file, and the mastery
 * score. Sequencing and the organisation tree are deliberately left alone —
 * SCORM 2004 sequencing is a rules engine of its own, and pretending to
 * honour it while ignoring half its rules would be worse than launching the
 * first resource and letting the content navigate itself, which every
 * package supports.
 */

// Attributes are kept, prefixes are dropped: a prefix is a document-local
// alias for a namespace, so `adlcp:scormtype` and `adl:scormtype` are the
// same attribute wearing different hats.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  // Everything as text: a version of "1.2" must not arrive as the number
  // 1.2, and an identifier of "007" must keep its zeros.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
})

const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value])

/**
 * 1.2 or 2004, from whichever field the exporter filled in.
 *
 * `<schemaversion>` is the authoritative one and says things like "1.2",
 * "CAM 1.3", "2004 3rd Edition". Some tools leave it out and only declare
 * the 2004 namespaces, so the namespace declarations are the fallback.
 */
export function detectVersion(manifestXml, parsed) {
  const schema = String(parsed?.metadata?.schemaversion ?? '')
  if (/1\.2/.test(schema)) return '1.2'
  if (/2004|CAM 1\.3|1\.3/i.test(schema)) return '2004'
  // imsss is the 2004 sequencing namespace; adlseq/adlnav arrived with 2004.
  if (/imsss|adlseq|adlnav|2004/i.test(manifestXml)) return '2004'
  return '1.2'
}

/**
 * The file to open first.
 *
 * The default organisation's first leaf item points at a resource, and that
 * resource's `href` is the entry point. Falls back to the first `sco`-typed
 * resource, then any resource with an href, then index.html — each step down
 * is a guess, and the guesses get less specific rather than more.
 */
function findLaunchHref(parsed) {
  const resources = asArray(parsed?.resources?.resource)
  const byIdentifier = new Map(resources.filter((r) => r['@identifier']).map((r) => [r['@identifier'], r]))

  const organizations = parsed?.organizations
  const defaultId = organizations?.['@default']
  const orgs = asArray(organizations?.organization)
  const org = orgs.find((o) => o['@identifier'] === defaultId) ?? orgs[0]

  // Items nest, and the first *leaf* with a resource reference is the start —
  // a top-level item is often just the course title with no href of its own.
  const firstRef = (items) => {
    for (const item of asArray(items)) {
      const ref = item['@identifierref']
      if (ref && byIdentifier.get(ref)?.['@href']) return byIdentifier.get(ref)['@href']
      const nested = firstRef(item.item)
      if (nested) return nested
    }
    return ''
  }

  const fromOrg = firstRef(org?.item)
  if (fromOrg) return fromOrg

  const sco = resources.find((r) => /sco/i.test(String(r['@scormtype'] ?? r['@scormType'] ?? '')) && r['@href'])
  if (sco) return sco['@href']

  return asArray(resources).find((r) => r['@href'])?.['@href'] ?? 'index.html'
}

/**
 * The score the content has to reach to count as passed, 0–100.
 *
 * 1.2 puts it on the item as `<adlcp:masteryscore>`; 2004 puts it in
 * sequencing as `<imsss:minNormalizedMeasure>` on a 0–1 scale. Null means
 * the package did not say, and then any completion it reports is taken at
 * face value — inventing a threshold would fail learners whose content
 * considered them finished.
 */
function findMasteryScore(parsed) {
  const items = []
  const collect = (list) => {
    for (const item of asArray(list)) {
      items.push(item)
      collect(item.item)
    }
  }
  collect(asArray(parsed?.organizations?.organization).flatMap((org) => asArray(org.item)))

  for (const item of items) {
    const legacy = item.masteryscore ?? item.masteryScore
    if (legacy !== undefined && legacy !== '') {
      const value = Number(legacy)
      if (Number.isFinite(value)) return value > 1 ? value : Math.round(value * 100)
    }
    const measure = item.sequencing?.objectives?.primaryObjective?.minNormalizedMeasure
    if (measure !== undefined && measure !== '') {
      const value = Number(measure)
      // 2004's measure is a -1..1 normalised value; anything above 1 is a
      // tool writing a percentage into the wrong field, and reading it as
      // one is kinder than treating 80 as 8000%.
      if (Number.isFinite(value)) return value > 1 ? value : Math.round(value * 100)
    }
  }
  return null
}

/**
 * @returns {{version: string, launchHref: string, identifier: string, masteryScore: number|null, title: string}}
 * @throws when the document is not a manifest at all — a zip of PowerPoint
 *   slides is the most common thing uploaded here by mistake, and "this is
 *   not a SCORM package" is the answer that helps.
 */
export function parseManifest(manifestXml) {
  let parsed
  try {
    parsed = parser.parse(String(manifestXml ?? ''))
  } catch {
    throw new Error('imsmanifest.xml is not valid XML')
  }

  const manifest = parsed?.manifest
  if (!manifest) throw new Error('imsmanifest.xml has no <manifest> element')

  const organizations = asArray(manifest.organizations?.organization)
  const title = String(organizations[0]?.title ?? '').trim()

  return {
    version: detectVersion(manifestXml, manifest),
    launchHref: String(findLaunchHref(manifest) ?? '').trim(),
    identifier: String(manifest['@identifier'] ?? '').trim(),
    masteryScore: findMasteryScore(manifest),
    title,
  }
}
