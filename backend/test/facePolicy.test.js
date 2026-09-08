// Pure unit tests for the face-gate cadence — the "verify before every video
// and material" setting and the rule it changes.
//
// Deliberately DB-free, unlike test/faceVerification.test.js: the merge and
// the freshness comparison are the whole decision the gate makes, and they
// are worth having covered on a laptop with nothing running.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { FACE_POLICY_DEFAULTS, resolveFacePolicy } from '@lms/shared'
import { verifiedRecentlyEnough } from '../src/services/face/faceCadence.js'
import { env } from '../src/config/env.js'

const DAILY = { verifyEveryOpen: false }
const EVERY_OPEN = { verifyEveryOpen: true }

describe('resolveFacePolicy', () => {
  test('an empty policy is the shared defaults', () => {
    assert.deepEqual(resolveFacePolicy(), { ...FACE_POLICY_DEFAULTS })
    assert.equal(resolveFacePolicy().verifyEveryOpen, false)
  })

  test('a stored value wins over the default', () => {
    assert.equal(resolveFacePolicy({ verifyEveryOpen: true }).verifyEveryOpen, true)
  })

  test('null and undefined mean "inherit", not "false"', () => {
    assert.equal(resolveFacePolicy({ verifyEveryOpen: true }, { verifyEveryOpen: null }).verifyEveryOpen, true)
    assert.equal(resolveFacePolicy({ verifyEveryOpen: true }, { verifyEveryOpen: undefined }).verifyEveryOpen, true)
    assert.equal(resolveFacePolicy({ verifyEveryOpen: true }, {}).verifyEveryOpen, true)
  })

  test('unknown keys in a stored row are ignored', () => {
    assert.deepEqual(resolveFacePolicy({ somethingElse: true }), { ...FACE_POLICY_DEFAULTS })
  })
})

describe('verifiedRecentlyEnough', () => {
  const minutesAgo = (n) => new Date(Date.now() - n * 60_000)

  // How far into the current APP_TIMEZONE day we are. Used to build a
  // timestamp that is reliably "earlier today" whatever hour the suite runs.
  function msIntoLocalDay() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: env.APP_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const get = (type) => Number(parts.find((part) => part.type === type).value)
    return ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000
  }

  test('never verified is never current, in either mode', () => {
    assert.equal(verifiedRecentlyEnough(null, DAILY), false)
    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: null }, DAILY), false)
    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: null }, EVERY_OPEN), false)
  })

  test('daily mode: a check from earlier today still counts', () => {
    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: new Date() }, DAILY), true)

    // Older, but still the same local day — the point of the default
    // cadence. Derived from how long the local day has actually been
    // running rather than a flat 120 minutes: run at 01:00 in Tashkent, a
    // fixed two hours ago is *yesterday*, and the assertion inverts. A
    // suite that fails between midnight and 02:00 teaches people to ignore
    // it, which costs more than the case it was checking.
    const msSinceLocalMidnight = msIntoLocalDay()
    if (msSinceLocalMidnight > 60_000) {
      const earlierToday = new Date(Date.now() - Math.floor(msSinceLocalMidnight / 2))
      assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: earlierToday }, DAILY), true)
    }
  })

  test('daily mode: yesterday does not count', () => {
    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: minutesAgo(60 * 30) }, DAILY), false)
  })

  test('every-open mode: only a check from the last few minutes counts', () => {
    const freshSeconds = env.FACE_VERIFICATION_FRESH_SECONDS
    const inside = new Date(Date.now() - (freshSeconds * 1000) / 2)
    const outside = new Date(Date.now() - (freshSeconds + 60) * 1000)

    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: inside }, EVERY_OPEN), true)
    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: outside }, EVERY_OPEN), false)
    // The case the setting exists for: same day, so daily mode would let it
    // through, and every-open mode does not.
    assert.equal(verifiedRecentlyEnough({ lastVerifiedAt: outside }, DAILY), true)
  })
})
