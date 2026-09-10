import path from 'node:path'

/**
 * Path and content-type rules for the files inside a package.
 *
 * Both halves exist because a SCORM package is a website somebody else
 * built: we accept its file names and we serve its files back, and neither
 * of those may be done on trust.
 */

// A small map rather than a mime library. These are the extensions an
// authoring tool actually emits; anything else is served as a download
// rather than guessed at, which is also the safe default — a file served as
// text/html when it is not is how a package could host a page that borrows
// our origin.
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.swf': 'application/x-shockwave-flash',
  '.vtt': 'text/vtt; charset=utf-8',
  '.zip': 'application/zip',
}

export function contentTypeFor(relPath) {
  return CONTENT_TYPES[path.extname(String(relPath ?? '')).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * The safe form of a path that came out of a zip or off a URL, or null.
 *
 * Zip entries carry whatever the packer wrote, including `../../etc/passwd`
 * and `C:\Users\...` — "zip slip", and the reason every extractor that
 * concatenates entry names has a CVE. The same check covers the serving
 * side, where the path comes from a URL the content builds itself.
 *
 * Normalised with POSIX semantics on purpose: `path.normalize` on Windows
 * would treat a backslash as a separator and could resolve a name we then
 * store with a different shape than we checked.
 */
export function safeRelativePath(raw) {
  const value = String(raw ?? '')
    // Backslashes are separators to some packers and literal characters to
    // S3, so they are folded before anything else looks at the string.
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!value || value.endsWith('/')) return null
  // A URL-encoded traversal is still a traversal.
  let decoded
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null

  const normalised = path.posix.normalize(decoded)
  if (normalised.startsWith('../') || normalised === '..' || normalised.startsWith('/')) return null
  // Drive letters and UNC paths — a Windows-packed zip can carry both.
  if (/^[a-z]:/i.test(normalised)) return null
  return normalised
}

/** Where one package's files live inside the SCORM bucket. */
export function packagePrefix(packageId) {
  return `packages/${packageId}/`
}
