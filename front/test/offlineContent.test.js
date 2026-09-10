// 12.2 — what a course takes offline, and what it refuses to.
//
// The decisions are here, in pure functions, because they are the part
// worth arguing about: which kinds can be saved at all, how large a file
// is too large to put on somebody's phone without asking, and what
// happens when the browser will not say how much room it has. The
// IndexedDB half is verified in a real browser (CDP) — there is no
// IndexedDB in node, and a fake one would be testing the fake.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_COURSE_BYTES,
  MAX_FILE_BYTES,
  OFFLINE_KINDS,
  QUOTA_HEADROOM_BYTES,
  fitsInStorage,
  formatBytes,
  isSavableMaterial,
  planCourseDownload,
} from '../src/offline/offlinePlan.js'

// `fileSize` is what the API sends (and what MaterialViewer reads);
// `sizeBytes` appears in some payloads. Both are accepted, because reading
// only one meant a 40 MB file measured as size zero and the cap never
// applying — found the first time this ran against real data.
const material = (overrides = {}) => ({
  id: 'm1',
  title: 'Qo\'llanma.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024 * 1024,
  status: 'PUBLISHED',
  ...overrides,
})

describe('12.2 · the offline plan', () => {
  describe('what can be saved', () => {
    test('lessons and documents, and nothing else', () => {
      // Video is HLS behind a short-lived playback token, so a "saved"
      // video would stop playing with no explanation. An assessment
      // offline means its questions on disk. SCORM needs the API's
      // launcher page and a same-origin runtime.
      assert.deepEqual(OFFLINE_KINDS, ['LESSON', 'MATERIAL'])
    })

    test('a file bigger than the per-file cap is refused', () => {
      assert.equal(isSavableMaterial(material({ fileSize: MAX_FILE_BYTES - 1 })), true)
      // Either field name, so a payload shape does not quietly disable the cap.
      assert.equal(isSavableMaterial({ id: 'x', sizeBytes: MAX_FILE_BYTES + 1 }), false)
      // Not a technical limit: a 60 MB scan is not something to download
      // onto a phone in a corridor without telling anybody.
      assert.equal(isSavableMaterial(material({ fileSize: MAX_FILE_BYTES + 1 })), false)
      // A missing size is not evidence of a large file, so it is allowed.
      assert.equal(isSavableMaterial(material({ fileSize: undefined })), true)
      assert.equal(isSavableMaterial(null), false)
    })
  })

  describe('the plan is drawn before anything is downloaded', () => {
    test('it lists what will be saved, what will not, and why', () => {
      const plan = planCourseDownload({
        topics: [{ id: 't1' }, { id: 't2' }],
        lessonsByTopic: {
          t1: [
            { id: 'l1', title: 'Kirish', status: 'PUBLISHED' },
            // A draft is the author's work in progress and is not visible
            // to a learner online either.
            { id: 'l2', title: 'Qoralama', status: 'DRAFT' },
          ],
        },
        materialsByTopic: {
          t2: [
            material({ id: 'm1', fileSize: 2 * 1024 * 1024 }),
            material({ id: 'm2', title: 'Katta.pdf', fileSize: 40 * 1024 * 1024 }),
          ],
        },
      })

      assert.deepEqual(plan.lessons.map((l) => l.id), ['l1'])
      assert.deepEqual(plan.materials.map((m) => m.id), ['m1'])
      // The skipped file is *reported*, not dropped silently: a progress
      // bar that quietly loses a document is how somebody ends up offline
      // without the one they needed.
      assert.deepEqual(plan.skipped.map((s) => [s.id, s.reason]), [['m2', 'TOO_LARGE']])
      assert.equal(plan.itemCount, 2)
      // Only the documents carry a size, and it is the server's number
      // rather than a guess.
      assert.equal(plan.estimatedBytes, 2 * 1024 * 1024)
    })

    test('a course with nothing savable plans nothing', () => {
      const plan = planCourseDownload({ topics: [{ id: 't1' }], lessonsByTopic: {}, materialsByTopic: {} })
      assert.equal(plan.itemCount, 0)
      assert.equal(plan.estimatedBytes, 0)
    })

    test('content with no status is treated as visible', () => {
      // Several list endpoints omit `status` for a learner, because a
      // learner is only ever shown published content. Excluding those
      // would save an empty course.
      const plan = planCourseDownload({
        topics: [{ id: 't1' }],
        lessonsByTopic: { t1: [{ id: 'l1', title: 'Dars' }] },
        materialsByTopic: { t1: [material({ status: undefined })] },
      })
      assert.equal(plan.itemCount, 2)
    })
  })

  describe('whether there is room', () => {
    test('a browser that will not say is taken at its word', () => {
      // Refusing to save because the browser declined to report its quota
      // would be refusing on no evidence.
      assert.deepEqual(fitsInStorage(5 * 1024 * 1024, { available: null }), { ok: true, reason: null })
    })

    test('the headroom is kept for everything else the app stores', () => {
      const available = QUOTA_HEADROOM_BYTES + 10 * 1024 * 1024
      assert.equal(fitsInStorage(5 * 1024 * 1024, { available }).ok, true)
      // The precache, the session and the settings live in the same budget.
      assert.equal(fitsInStorage(9 * 1024 * 1024 + QUOTA_HEADROOM_BYTES, { available }).reason, 'NOT_ENOUGH_SPACE')
    })

    test('a course beyond the ceiling is refused whatever the quota says', () => {
      const result = fitsInStorage(MAX_COURSE_BYTES + 1, { available: 10 * 1024 * 1024 * 1024 })
      assert.deepEqual(result, { ok: false, reason: 'COURSE_TOO_LARGE' })
    })
  })

  describe('sizes a person reads', () => {
    test('are scaled and localised', () => {
      assert.equal(formatBytes(900, 'uz'), '900 B')
      assert.equal(formatBytes(2 * 1024 * 1024, 'en'), '2 MB')
      // Uzbek and Russian write the decimal separator as a comma, and a
      // hardcoded dot is the kind of detail that makes a UI feel foreign.
      assert.equal(formatBytes(2411724, 'uz'), '2,3 MB')
      assert.equal(formatBytes(2411724, 'en'), '2.3 MB')
      assert.equal(formatBytes(0, 'uz'), '0 B')
    })
  })
})
