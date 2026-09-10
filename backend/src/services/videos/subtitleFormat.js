/**
 * Subtitle files, on the way in.
 *
 * Two jobs: turn what an author uploaded into WebVTT, and refuse what
 * cannot be turned into it. WebVTT is what a browser's `<track>` element
 * reads, and it is the only format worth storing — converting on every
 * request would mean converting the same file a thousand times.
 *
 * SRT is converted rather than refused because it is what everything
 * exports: a transcription service, a translator working in Subtitle Edit,
 * the .srt that came with the video. Telling an author "convert it
 * yourself" over a comma instead of a period would be the whole feature's
 * reputation.
 */

/**
 * Language codes we accept, loosely: `uz`, `ru-RU`, `en`.
 *
 * Case-insensitive because a person typing the field writes "RU" as often
 * as "ru", and a form that refuses the capitalised form of the same code
 * is a form that looks broken. BCP 47 says the base is lowercase and the
 * region uppercase, which is what comes back out.
 */
const LANGUAGE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i

export function normalizeLanguage(raw) {
  const value = String(raw ?? '').trim()
  if (!LANGUAGE.test(value)) return null
  const [base, region] = value.split('-')
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase()
}

/**
 * `00:00:01,500` → `00:00:01.500`, and a two-part stamp gets its hour.
 *
 * SRT uses a comma for the decimal separator and VTT a period; VTT also
 * allows `MM:SS.mmm`, which some tools emit and others choke on, so it is
 * normalised to the three-part form.
 */
function toVttTimestamp(raw) {
  const value = String(raw).trim().replace(',', '.')
  const parts = value.split(':')
  if (parts.length === 2) return `00:${parts[0].padStart(2, '0')}:${parts[1]}`
  return `${parts[0].padStart(2, '0')}:${parts[1]}:${parts[2]}`
}

const CUE_LINE = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/

/**
 * SRT (or a VTT-ish file with SRT timestamps) as WebVTT.
 *
 * Cue numbers are dropped: VTT allows an identifier line, but a bare
 * integer identifier confuses some players into treating it as part of the
 * text. Anything that is not a timestamp or a number passes through as cue
 * text, which is what keeps styling tags and multi-line cues intact.
 */
export function srtToVtt(source) {
  const lines = String(source ?? '')
    // BOM first: a leading U+FEFF makes the header check fail on a file
    // that is otherwise perfectly valid, and Windows tools add one.
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  const out = ['WEBVTT', '']
  let previousWasBlank = true

  for (const line of lines) {
    const trimmed = line.trim()

    // The header is written once, by us. A real VTT arriving here would
    // otherwise keep its own and end up with two — the second one becoming
    // the first cue's text, which is exactly how a valid file turns into a
    // subtitle that says "WEBVTT" on screen.
    if (/^WEBVTT/.test(trimmed)) {
      previousWasBlank = true
      continue
    }

    if (CUE_LINE.test(trimmed)) {
      const [start, end] = trimmed.split('-->')
      out.push(`${toVttTimestamp(start)} --> ${toVttTimestamp(end.trim().split(/\s+/)[0])}`)
      previousWasBlank = false
      continue
    }

    // A lone number right after a blank line is an SRT cue index.
    if (previousWasBlank && /^\d+$/.test(trimmed)) continue

    if (trimmed === '') {
      if (!previousWasBlank) out.push('')
      previousWasBlank = true
      continue
    }

    out.push(line)
    previousWasBlank = false
  }

  return `${out.join('\n').trim()}\n`
}

/**
 * The stored form of an uploaded track, or an error.
 *
 * A file that says WEBVTT is taken as VTT (with its BOM removed, which is
 * the single most common reason a valid file is rejected by players); a
 * file with SRT-style cues is converted; anything with no cue at all is
 * refused, because a subtitle track that displays nothing is worse than no
 * track — the learner turns captions on and concludes they are broken.
 */
export function toWebVtt(source) {
  const text = String(source ?? '').replace(/^﻿/, '')
  const hasCue = text.split(/\r\n?|\n/).some((line) => CUE_LINE.test(line.trim()))
  if (!hasCue) return { error: 'The file contains no subtitle cues' }

  if (/^\s*WEBVTT/.test(text)) {
    // Even a real VTT goes through the converter: it normalises the
    // timestamps some tools write as MM:SS.mmm, and leaves everything else
    // alone.
    return { vtt: srtToVtt(text) }
  }
  return { vtt: srtToVtt(text) }
}

/** How many cues a track has — for the "is this file plausible" check. */
export function countCues(vtt) {
  return String(vtt ?? '')
    .split(/\r\n?|\n/)
    .filter((line) => CUE_LINE.test(line.trim())).length
}
