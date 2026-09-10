/**
 * What a lesson may put in an iframe, and what URL that iframe actually gets.
 *
 * An allowlist of hosts, because an iframe is the one block that hands part
 * of the page to somebody else. Inside our chrome, an arbitrary embed can
 * draw a convincing login form, cover the page with a transparent layer, or
 * simply report every reader to a third party — and "the author pasted it"
 * is not consent from the reader. `sandbox` on the frame narrows what the
 * embedded page can do; it does not decide whose page it is.
 *
 * The URL is also rewritten rather than trusted. An author pastes the
 * address from their browser bar — `youtube.com/watch?v=…`, `vimeo.com/123`,
 * a Drive `/view` link — and none of those render in a frame. Fixing that in
 * the reader would mean every reader guessing; fixing it here means the
 * stored block is already the embeddable form.
 */

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']
// Docs, Slides, Sheets, Forms and Drive all live on these two hosts and all
// embed the same way — through a URL that ends in /preview or /pubhtml.
const GOOGLE_HOSTS = ['docs.google.com', 'drive.google.com']

export const EMBED_ALLOWLIST = [...YOUTUBE_HOSTS, ...VIMEO_HOSTS, ...GOOGLE_HOSTS]

const YOUTUBE_ID = /^[\w-]{6,20}$/

function youtubeId(parsed) {
  if (parsed.hostname.endsWith('youtu.be')) return parsed.pathname.slice(1).split('/')[0]
  if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.slice('/embed/'.length).split('/')[0]
  if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.slice('/shorts/'.length).split('/')[0]
  return parsed.searchParams.get('v') ?? ''
}

/** Seconds into the video, from any of the three forms YouTube uses. */
function youtubeStart(parsed) {
  const raw = parsed.searchParams.get('start') ?? parsed.searchParams.get('t') ?? ''
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(\d+)s?$/.exec(raw)
  if (!match) return 0
  const [, h = 0, m = 0, sec = 0] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(sec)
}

/**
 * The embeddable form of an allowlisted URL, or null if it is not one.
 *
 * Returns the provider alongside it so the reader can label the frame
 * without parsing the URL a second time.
 */
export function normalizeEmbed(raw) {
  let parsed
  try {
    parsed = new URL(String(raw ?? ''))
  } catch {
    return null
  }
  // https only. An http frame inside an https page is blocked by the browser
  // as mixed content anyway, so accepting one would store a block that can
  // never render.
  if (parsed.protocol !== 'https:') return null

  const host = parsed.hostname.toLowerCase()
  if (!EMBED_ALLOWLIST.includes(host)) return null

  if (YOUTUBE_HOSTS.includes(host)) {
    const id = youtubeId(parsed)
    if (!YOUTUBE_ID.test(id)) return null
    const start = youtubeStart(parsed)
    // nocookie: the same video without YouTube's advertising cookies on a
    // page an employee was told to read. Not a privacy claim, just the
    // narrower of two identical options.
    const url = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`
    return { url, provider: 'YOUTUBE' }
  }

  if (VIMEO_HOSTS.includes(host)) {
    const id = (parsed.pathname.match(/(\d{6,})/) ?? [])[1]
    if (!id) return null
    return { url: `https://player.vimeo.com/video/${id}`, provider: 'VIMEO' }
  }

  // Google's own links differ per product, so the path is kept and only the
  // ending is corrected: /view and /edit are the ones that refuse to frame.
  const path = parsed.pathname.replace(/\/(view|edit)$/, '/preview')
  return { url: `https://${host}${path}`, provider: 'GOOGLE' }
}
