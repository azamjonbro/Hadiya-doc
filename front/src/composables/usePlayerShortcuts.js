/**
 * Keyboard control for the video player (12.5).
 *
 * The player uses the browser's native `controls`, which already handles
 * keys — **but only while the video element itself has focus**. In practice
 * a learner clicks the page, scrolls, reads the description, and then
 * presses space expecting the video to pause; with focus on the body,
 * nothing happens (or the page scrolls). These shortcuts work from
 * anywhere on the page, which is the whole point.
 *
 * The keys are the ones people already know from YouTube: they are not a
 * design choice to make here, and inventing a different set would mean
 * every learner has to learn ours.
 *
 * Pure and injectable so it can be tested without a browser: the caller
 * passes the element and the guards, and `handleKey` returns what it did.
 */

export const SEEK_STEP_SECONDS = 5
export const BIG_SEEK_STEP_SECONDS = 10
export const VOLUME_STEP = 0.1
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/**
 * Whether a keystroke belongs to the person typing rather than to the
 * player.
 *
 * Without this, `f` in a search box goes fullscreen and space in a comment
 * pauses the video — the class of bug that makes people stop trusting a
 * page. Modifier combinations are left alone as well: they belong to the
 * browser and the operating system.
 */
export function isTypingTarget(target) {
  if (!target) return false
  const tag = (target.tagName ?? '').toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag)) return true
  if (target.isContentEditable) return true
  // A dialog is somebody else's keyboard context — a confirm box, the
  // command palette, the face-verification prompt.
  return Boolean(target.closest?.('[role="dialog"], dialog'))
}

/** The action a key means, or null. Separated so it can be tested directly. */
export function actionFor(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  const key = event.key

  switch (key) {
    case ' ':
    case 'k':
    case 'K':
      return { type: 'TOGGLE_PLAY' }
    case 'j':
    case 'J':
      return { type: 'SEEK', by: -BIG_SEEK_STEP_SECONDS }
    case 'l':
    case 'L':
      return { type: 'SEEK', by: BIG_SEEK_STEP_SECONDS }
    case 'ArrowLeft':
      return { type: 'SEEK', by: -SEEK_STEP_SECONDS }
    case 'ArrowRight':
      return { type: 'SEEK', by: SEEK_STEP_SECONDS }
    case 'ArrowUp':
      return { type: 'VOLUME', by: VOLUME_STEP }
    case 'ArrowDown':
      return { type: 'VOLUME', by: -VOLUME_STEP }
    case 'm':
    case 'M':
      return { type: 'TOGGLE_MUTE' }
    case 'f':
    case 'F':
      return { type: 'TOGGLE_FULLSCREEN' }
    case 'c':
    case 'C':
      return { type: 'TOGGLE_CAPTIONS' }
    case '<':
    case ',':
      return { type: 'SPEED', direction: -1 }
    case '>':
    case '.':
      return { type: 'SPEED', direction: 1 }
    case '?':
      return { type: 'TOGGLE_HELP' }
    case 'Home':
      return { type: 'SEEK_TO', fraction: 0 }
    case 'End':
      return { type: 'SEEK_TO', fraction: 1 }
    default:
      // 0–9 jump to that tenth of the video, the way every player does.
      if (/^[0-9]$/.test(key)) return { type: 'SEEK_TO', fraction: Number(key) / 10 }
      return null
  }
}

/** Clamps a seek so a shortcut cannot leave the video in a broken position. */
export function nextPosition(current, duration, by) {
  const target = (Number(current) || 0) + by
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, target)
  return Math.min(Math.max(0, target), duration)
}

export function nextVolume(current, by) {
  return Math.min(1, Math.max(0, Math.round(((Number(current) || 0) + by) * 100) / 100))
}

export function nextSpeed(current, direction) {
  const index = SPEEDS.indexOf(Number(current))
  // An unrecognised rate (set from devtools, or a browser default we do not
  // list) resolves to 1× rather than refusing to change.
  const from = index === -1 ? SPEEDS.indexOf(1) : index
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))]
}

/**
 * Applies one keystroke to a media element.
 *
 * @param {KeyboardEvent} event
 * @param {object} context
 * @param {HTMLMediaElement} context.media
 * @param {boolean} [context.blocked] — an attention lockout or the face gate
 *   is up. Seeking and volume are still allowed (they change nothing about
 *   whether the learner is watching), but **play is not**: the overlay
 *   covers the controls and a shortcut must not be the way around it.
 * @param {() => void} [context.onCaptions]
 * @param {() => void} [context.onHelp]
 * @returns {string|null} the action taken, for tests and for analytics.
 */
export function handleKey(event, { media, blocked = false, onCaptions, onHelp, onFullscreen } = {}) {
  if (isTypingTarget(event.target)) return null
  const action = actionFor(event)
  if (!action) return null
  if (!media && !['TOGGLE_HELP', 'TOGGLE_CAPTIONS'].includes(action.type)) return null

  switch (action.type) {
    case 'TOGGLE_PLAY':
      if (blocked) return null
      if (media.paused) media.play()?.catch?.(() => {})
      else media.pause()
      break
    case 'SEEK':
      media.currentTime = nextPosition(media.currentTime, media.duration, action.by)
      break
    case 'SEEK_TO':
      if (!Number.isFinite(media.duration) || media.duration <= 0) return null
      media.currentTime = media.duration * action.fraction
      break
    case 'VOLUME':
      media.volume = nextVolume(media.volume, action.by)
      // Nudging the volume up off zero should also unmute, or the change
      // is invisible and the person presses it again and again.
      if (action.by > 0 && media.volume > 0) media.muted = false
      break
    case 'TOGGLE_MUTE':
      media.muted = !media.muted
      break
    case 'SPEED':
      media.playbackRate = nextSpeed(media.playbackRate, action.direction)
      break
    case 'TOGGLE_FULLSCREEN':
      onFullscreen?.()
      break
    case 'TOGGLE_CAPTIONS':
      onCaptions?.()
      break
    case 'TOGGLE_HELP':
      onHelp?.()
      break
    default:
      return null
  }

  // Only now: a key we did not act on must keep its default behaviour
  // (typing, scrolling, the browser's own shortcuts).
  event.preventDefault()
  return action.type
}
