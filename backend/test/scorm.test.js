// 9.3 — SCORM import, and the two things that make it different from every
// other kind of content here.
//
// **It is somebody else's website.** A package is a zip of HTML and
// JavaScript authored outside this platform, served back by us, and run in
// an iframe. So the tests that matter most are not about the happy path:
// they are about a zip entry called `../../etc/passwd`, an archive that
// expands to more than the box has, a manifest that points at a file the
// archive does not contain, and a launch token from one package being used
// on another.
//
// **It reports its own progress.** SCORM 1.2 and 2004 describe the same
// three facts — finished, passed, scored — in different elements, and 1.2
// reports a *failed* quiz as `lesson_status=failed`, which is a finished
// attempt. Counting that as course completion is exactly the mistake AT-02
// is about, so the mastery-score comparison is pinned down here.
//
// Object storage is stubbed (MinIO needs Docker, which the dev laptops do
// not run) with the same four methods, following backup.test.js.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import JSZip from 'jszip'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { ScormPackage } from '../src/models/scormPackage.model.js'
import { ScormState } from '../src/models/scormState.model.js'
import { CourseAssignment } from '../src/models/courseAssignment.model.js'
import { Notification } from '../src/models/notification.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { parseManifest, detectVersion } from '../src/services/scorm/scormManifest.js'
import { safeRelativePath, contentTypeFor, packagePrefix } from '../src/services/scorm/scormFiles.js'
import { normalizeCmi, meetsPackage } from '../src/services/scorm/scormCmi.js'
import { extractScormPackage, findManifestEntry } from '../src/services/scorm/extractScorm.js'
import { scormPackageService } from '../src/services/scorm/scormPackage.service.js'
import { scormRuntimeService } from '../src/services/scorm/scormRuntime.service.js'
import { signLaunchToken, verifyLaunchToken } from '../src/services/scorm/scormToken.js'
import { renderScormPlayer } from '../src/services/scorm/scormPlayerPage.js'
import { collectCourseItems, courseCompletionService } from '../src/services/courses/courseCompletion.service.js'
import { topicContentService } from '../src/services/courses/topicContent.service.js'
import { nextOrder } from '../src/services/courses/contentItem.js'
import { deliveryQueue } from '../src/jobs/deliveryQueue.js'
import { certificateQueue } from '../src/jobs/certificateQueue.js'
import { scormQueue } from '../src/jobs/scormQueue.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0
let author
let learner
const courseIds = []
const userIds = []

const authorActor = () => ({
  id: author._id.toString(),
  permissions: ['video:view', 'course:create', 'course:update'],
})
const learnerActor = () => ({ id: learner._id.toString(), permissions: ['video:view'] })

/**
 * The stub: a Map with the four methods the real provider has.
 *
 * `getObject` hands back a stream because that is what the S3 client
 * returns and what the extractor and the file route both consume.
 */
function memoryStorage() {
  const objects = new Map()
  return {
    objects,
    async putObject(key, body, contentType) {
      objects.set(key, { body: Buffer.isBuffer(body) ? body : Buffer.from(body), contentType })
    },
    async getObject(key) {
      const stored = objects.get(key)
      if (!stored) throw new Error(`NoSuchKey: ${key}`)
      const { Readable } = await import('node:stream')
      return Readable.from([stored.body])
    },
    async listObjects(prefix) {
      return [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, size: objects.get(key).body.length }))
    },
    async deleteObject(key) {
      objects.delete(key)
    },
  }
}

const MANIFEST_12 = `<?xml version="1.0"?>
<manifest identifier="pkg-${stamp}" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>Mehnat xavfsizligi</title>
      <item identifier="i1"><title>Modul</title>
        <item identifier="i2" identifierref="r1"><title>Kirish</title>
          <adlcp:masteryscore>80</adlcp:masteryscore>
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="content/index.html">
      <file href="content/index.html"/>
    </resource>
  </resources>
</manifest>`

async function zipOf(entries) {
  const zip = new JSZip()
  for (const [name, body] of Object.entries(entries)) zip.file(name, body)
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function makeUser(name) {
  const role = await Role.findOne({ name: 'EMPLOYEE' })
  const user = await User.create({
    firstName: name,
    lastName: 'Scorm',
    fullName: `${name} Scorm`,
    jshshir: `17${stamp}${String(userIds.length).padStart(3, '0')}`,
    passwordHash: await hashPassword('ScormTest123!'),
    roleId: role._id,
  })
  userIds.push(user._id)
  return user
}

async function makeCourse({ assign = false } = {}) {
  const course = await Course.create({
    title: `SCORM course ${stamp}-${seq}`,
    description: 'x',
    slug: `scorm-course-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  courseIds.push(course._id)
  const topic = await Topic.create({
    courseId: course._id,
    title: 'T',
    slug: `st-${stamp}-${seq++}`,
    order: 0,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  if (assign) {
    await CourseAssignment.create({ userId: learner._id, courseId: course._id, assignedBy: author._id })
  }
  return { course, topic }
}

/** Uploads a zip through the service and runs the extraction inline. */
async function importPackage(topic, entries, { storage = memoryStorage(), meta = {} } = {}) {
  const buffer = await zipOf(entries)
  const created = await scormPackageService.upload(
    authorActor(),
    topic._id.toString(),
    { title: 'Paket', ...meta },
    { buffer, size: buffer.length, originalname: 'course.zip' },
    { storage }
  )
  const extracted = await extractScormPackage(created.id, { storage })
  return { created, extracted, storage }
}

const statusOf = (course) =>
  CourseAssignment.findOne({ userId: learner._id, courseId: course._id })
    .lean()
    .then((row) => row.status)

describe('9.3 · SCORM packages', () => {
  before(async () => {
    await connectDatabase()
    assert.ok(await Role.findOne({ name: 'EMPLOYEE' }), 'EMPLOYEE role is missing — boot the server once')
    author = await makeUser('Muallif')
    learner = await makeUser('Oquvchi')
  })

  after(async () => {
    await ScormState.deleteMany({ userId: { $in: userIds } })
    await ScormPackage.deleteMany({ courseId: { $in: courseIds } })
    await Notification.deleteMany({ userId: { $in: userIds } })
    await CourseAssignment.deleteMany({ userId: { $in: userIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await scormQueue.obliterate({ force: true }).catch(() => {})
    await deliveryQueue.obliterate({ force: true }).catch(() => {})
    await certificateQueue.obliterate({ force: true }).catch(() => {})
    await Promise.all([scormQueue.close(), deliveryQueue.close(), certificateQueue.close()])
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the manifest', () => {
    test('1.2: version, launch file and mastery score', () => {
      const parsed = parseManifest(MANIFEST_12)
      assert.equal(parsed.version, '1.2')
      // The launch file comes from the *leaf* item — the top-level item is
      // the module title and has no resource of its own.
      assert.equal(parsed.launchHref, 'content/index.html')
      assert.equal(parsed.masteryScore, 80)
      assert.equal(parsed.title, 'Mehnat xavfsizligi')
    })

    test('2004: namespaced tags, and a mastery score on a 0-1 scale', () => {
      const parsed = parseManifest(`<?xml version="1.0"?>
        <imscp:manifest identifier="p2004" xmlns:imscp="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:imsss="http://www.imsglobal.org/xsd/imsss" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
          <imscp:metadata><imscp:schemaversion>2004 4th Edition</imscp:schemaversion></imscp:metadata>
          <imscp:organizations default="o1">
            <imscp:organization identifier="o1"><imscp:title>Kurs</imscp:title>
              <imscp:item identifier="it1" identifierref="res1"><imscp:title>Start</imscp:title>
                <imsss:sequencing><imsss:objectives><imsss:primaryObjective>
                  <imsss:minNormalizedMeasure>0.7</imsss:minNormalizedMeasure>
                </imsss:primaryObjective></imsss:objectives></imsss:sequencing>
              </imscp:item>
            </imscp:organization>
          </imscp:organizations>
          <imscp:resources><imscp:resource identifier="res1" adlcp:scormType="sco" href="start.html"/></imscp:resources>
        </imscp:manifest>`)
      assert.equal(parsed.version, '2004')
      assert.equal(parsed.launchHref, 'start.html')
      // 0.7 is a normalised measure, not seven percent.
      assert.equal(parsed.masteryScore, 70)
    })

    test('the version falls back to the namespaces when schemaversion is missing', () => {
      assert.equal(detectVersion('<manifest xmlns:imsss="http://www.imsglobal.org/xsd/imsss"/>', {}), '2004')
      assert.equal(detectVersion('<manifest/>', {}), '1.2')
    })

    test('a zip of slides is not a package', () => {
      assert.throws(() => parseManifest('<html><body>slides</body></html>'), /no <manifest> element/)
    })
  })

  describe('paths out of a zip', () => {
    test('traversal, absolute paths and drive letters are refused', () => {
      for (const attempt of ['../../etc/passwd', '..%2F..%2Fetc%2Fpasswd', 'C:\\evil.html', 'a/../../b']) {
        assert.equal(safeRelativePath(attempt), null, `${attempt} must be refused`)
      }
      // A leading slash is not an escape — it lands inside the package.
      assert.equal(safeRelativePath('/index.html'), 'index.html')
      assert.equal(safeRelativePath('dir\\file.js'), 'dir/file.js')
      assert.equal(safeRelativePath('a/./b.css'), 'a/b.css')
    })

    test('an unknown extension is a download, never guessed at', () => {
      // A file served as text/html when it is not is how a package would
      // host a page borrowing our origin.
      assert.equal(contentTypeFor('a.exe'), 'application/octet-stream')
      assert.equal(contentTypeFor('a.HTML'), 'text/html; charset=utf-8')
      assert.equal(contentTypeFor('a.js'), 'text/javascript; charset=utf-8')
    })

    test('the shallowest manifest wins', () => {
      // Half the exports in the world are zipped with a wrapper folder, and
      // some ship a second package as an asset.
      const found = findManifestEntry(['My Course/imsmanifest.xml', 'My Course/assets/inner/imsmanifest.xml'])
      assert.equal(found.manifestPath, 'My Course/imsmanifest.xml')
      assert.equal(found.prefix, 'My Course/')
      assert.equal(findManifestEntry(['a.html']), null)
    })
  })

  describe('importing', () => {
    test('a package unpacks, reads its manifest and becomes READY', async () => {
      const { topic } = await makeCourse()
      const { extracted, storage } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html><body>Salom</body></html>',
        'content/app.js': 'console.log(1)',
      })

      assert.equal(extracted.processingStatus, 'READY')
      assert.equal(extracted.version, '1.2')
      assert.equal(extracted.launchHref, 'content/index.html')
      assert.equal(extracted.masteryScore, 80)
      assert.equal(extracted.fileCount, 3)

      const prefix = packagePrefix(extracted._id.toString())
      assert.ok(storage.objects.has(`${prefix}content/index.html`))
      // Stored with the type it will be served as, not as octet-stream.
      assert.equal(storage.objects.get(`${prefix}content/app.js`).contentType, 'text/javascript; charset=utf-8')
    })

    test('a wrapper folder is stripped, so relative paths still resolve', async () => {
      const { topic } = await makeCourse()
      const { extracted, storage } = await importPackage(topic, {
        'My Course/imsmanifest.xml': MANIFEST_12,
        'My Course/content/index.html': '<html></html>',
      })
      assert.equal(extracted.processingStatus, 'READY')
      assert.ok(storage.objects.has(`${packagePrefix(extracted._id.toString())}content/index.html`))
    })

    test('nothing lands outside the package prefix', async () => {
      const { topic } = await makeCourse()
      const { extracted, storage } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
        // JSZip normalises `../` out of a name as it writes the archive, so
        // this arrives as `etc/passwd` — which is the point: whatever a
        // packer wrote, every object has to end up under this package's own
        // prefix. The name-level guard is pinned down directly in
        // safeRelativePath's tests above.
        '../../../etc/passwd': 'root:x:0:0',
      })
      assert.equal(extracted.processingStatus, 'READY')
      const prefix = packagePrefix(extracted._id.toString())
      const keys = [...storage.objects.keys()].filter((key) => !key.startsWith('zips/'))
      assert.ok(keys.length > 0)
      keys.forEach((key) => assert.ok(key.startsWith(prefix), `${key} escaped the package prefix`))
      assert.equal(keys.some((key) => key === 'etc/passwd'), false)
    })

    test('an archive with no manifest fails with a reason the author can read', async () => {
      const { topic } = await makeCourse()
      const buffer = await zipOf({ 'slide1.html': '<html></html>' })
      const storage = memoryStorage()
      const created = await scormPackageService.upload(
        authorActor(),
        topic._id.toString(),
        { title: 'Slides' },
        { buffer, size: buffer.length, originalname: 'slides.zip' },
        { storage }
      )
      await assert.rejects(() => extractScormPackage(created.id, { storage }))

      const row = await ScormPackage.findById(created.id).lean()
      assert.equal(row.processingStatus, 'FAILED')
      assert.match(row.processingError, /not a SCORM package/)
    })

    test('a manifest pointing at a missing file fails the import', async () => {
      const { topic } = await makeCourse()
      const buffer = await zipOf({ 'imsmanifest.xml': MANIFEST_12 })
      const storage = memoryStorage()
      const created = await scormPackageService.upload(
        authorActor(),
        topic._id.toString(),
        {},
        { buffer, size: buffer.length, originalname: 'broken.zip' },
        { storage }
      )
      await assert.rejects(() => extractScormPackage(created.id, { storage }))
      const row = await ScormPackage.findById(created.id).lean()
      assert.equal(row.processingStatus, 'FAILED')
      assert.match(row.processingError, /content\/index\.html/)
    })

    test('only a zip is accepted, by magic bytes', async () => {
      const { topic } = await makeCourse()
      const buffer = Buffer.from('%PDF-1.7\n...')
      await assert.rejects(
        () =>
          scormPackageService.upload(
            authorActor(),
            topic._id.toString(),
            {},
            { buffer, size: buffer.length, originalname: 'course.zip' },
            { storage: memoryStorage() }
          ),
        { code: 'UNSUPPORTED_FILE_TYPE' }
      )
    })

    test('a package takes its place in the topic sequence', async () => {
      const { topic } = await makeCourse()
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      assert.equal(extracted.order, 0)
      assert.equal(await nextOrder(topic._id), 1)

      await scormPackageService.update(authorActor(), extracted._id.toString(), { status: 'PUBLISHED' })
      const items = await topicContentService.getContent(learnerActor(), topic._id.toString())
      assert.deepEqual(
        items.map((item) => item.contentType),
        ['SCORM']
      )
    })
  })

  describe('serving it', () => {
    test('a file comes back with its own content type', async () => {
      const { topic } = await makeCourse()
      const { extracted, storage } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html><body>Salom</body></html>',
      })
      const { body, contentType } = await scormPackageService.openFile(
        extracted._id.toString(),
        'content/index.html',
        { storage }
      )
      assert.equal(contentType, 'text/html; charset=utf-8')
      const chunks = []
      for await (const chunk of body) chunks.push(chunk)
      assert.match(Buffer.concat(chunks).toString(), /Salom/)
    })

    test('a traversal on the way out is refused as well', async () => {
      const { topic } = await makeCourse()
      const { extracted, storage } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      // The path arrives from the package's own markup, so it is checked
      // here too, not only at extraction time.
      await assert.rejects(
        () => scormPackageService.openFile(extracted._id.toString(), '../../../etc/passwd', { storage }),
        { code: 'INVALID_PATH' }
      )
    })

    test('a launch token opens one package for one person, and nothing else', async () => {
      const mine = await makeCourse()
      const other = await makeCourse()
      const a = await importPackage(mine.topic, { 'imsmanifest.xml': MANIFEST_12, 'content/index.html': '<html></html>' })
      const b = await importPackage(other.topic, { 'imsmanifest.xml': MANIFEST_12, 'content/index.html': '<html></html>' })

      const token = signLaunchToken(learner._id, a.extracted._id)
      assert.equal(verifyLaunchToken(token, a.extracted._id.toString()).userId, learner._id.toString())
      assert.throws(() => verifyLaunchToken(token, b.extracted._id.toString()), { code: 'LAUNCH_TOKEN_MISMATCH' })
      assert.throws(() => verifyLaunchToken('nonsense', a.extracted._id.toString()), { code: 'INVALID_LAUNCH_TOKEN' })
    })

    test('a package that is still unpacking cannot be launched or published', async () => {
      const { topic } = await makeCourse()
      const buffer = await zipOf({ 'imsmanifest.xml': MANIFEST_12, 'content/index.html': '<html></html>' })
      const created = await scormPackageService.upload(
        authorActor(),
        topic._id.toString(),
        {},
        { buffer, size: buffer.length, originalname: 'course.zip' },
        { storage: memoryStorage() }
      )
      assert.equal(created.processingStatus, 'PENDING')
      await assert.rejects(() => scormPackageService.launch(authorActor(), created.id), { code: 'SCORM_NOT_READY' })
      // Publishing one would put an item in the curriculum that cannot open
      // and that the completion rule would count against every learner.
      await assert.rejects(() => scormPackageService.update(authorActor(), created.id, { status: 'PUBLISHED' }), {
        code: 'SCORM_NOT_READY',
      })
    })

    test('the player page carries the runtime API for both versions', async () => {
      const { topic } = await makeCourse()
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      const context = await scormPackageService.playerContext(extracted._id.toString(), learner._id, 'Oquvchi Scorm')
      const html = renderScormPlayer({ ...context, packageId: extracted._id.toString() })

      // Both objects, whatever the manifest said: a mislabelled export that
      // looks for the other one is common.
      assert.match(html, /window\.API = api12/)
      assert.match(html, /window\.API_1484_11 = api2004/)
      // The launch URL keeps the token in the *path*, which is what makes
      // the content's own relative links work.
      assert.match(context.launchUrl, /\/f\/[\w.-]+\/content\/index\.html$/)
      assert.match(html, /cmi\.core\.student_name/)
    })

    test('a draft package does not exist as far as a learner is concerned', async () => {
      const { topic } = await makeCourse()
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      await assert.rejects(() => scormPackageService.getById(learnerActor(), extracted._id.toString()), {
        statusCode: 404,
      })
      assert.equal((await scormPackageService.listByTopic(learnerActor(), topic._id.toString())).length, 0)
      assert.equal((await scormPackageService.listByTopic(authorActor(), topic._id.toString())).length, 1)
    })
  })

  describe('the data model, both versions', () => {
    test('1.2 folds completion and success into one element', () => {
      assert.deepEqual(
        {
          ...normalizeCmi('1.2', { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '85' }),
          totalTimeSeconds: 0,
        },
        {
          completionStatus: 'completed',
          successStatus: 'passed',
          scoreRaw: 85,
          scoreMin: null,
          scoreMax: null,
          totalTimeSeconds: 0,
          location: '',
          suspendData: '',
          exitMode: '',
        }
      )
      // A failed attempt is finished, and not a success.
      const failed = normalizeCmi('1.2', { 'cmi.core.lesson_status': 'failed' })
      assert.equal(failed.completionStatus, 'completed')
      assert.equal(failed.successStatus, 'failed')
      // 'browsed' is looking around, not finishing.
      assert.equal(normalizeCmi('1.2', { 'cmi.core.lesson_status': 'browsed' }).completionStatus, 'incomplete')
    })

    test('2004 keeps them apart, and a scaled score becomes a percentage', () => {
      const state = normalizeCmi('2004', {
        'cmi.completion_status': 'completed',
        'cmi.success_status': 'passed',
        'cmi.score.scaled': '0.8',
      })
      assert.equal(state.completionStatus, 'completed')
      assert.equal(state.successStatus, 'passed')
      // Otherwise a package that only reports a scaled score is invisible
      // in every report.
      assert.equal(state.scoreRaw, 80)
      assert.equal(state.scoreMax, 100)
    })

    test('both time formats are parsed into seconds', () => {
      assert.equal(normalizeCmi('1.2', { 'cmi.core.total_time': '0001:30:00.00' }).totalTimeSeconds, 5400)
      assert.equal(normalizeCmi('2004', { 'cmi.total_time': 'PT1H30M5S' }).totalTimeSeconds, 5405)
      assert.equal(normalizeCmi('2004', { 'cmi.total_time': 'nonsense' }).totalTimeSeconds, 0)
    })

    test('a mastery score has to be met, not merely reached', () => {
      const finished = normalizeCmi('1.2', { 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '70' })
      assert.equal(meetsPackage(finished, 80), false)
      assert.equal(meetsPackage(finished, 60), true)
      assert.equal(meetsPackage(finished, null), true)

      // The 1.2 trap: a failed quiz reports a finished attempt. Counting it
      // would hand out completion for a failed test (AT-02).
      assert.equal(meetsPackage(normalizeCmi('1.2', { 'cmi.core.lesson_status': 'failed' }), null), false)

      // A score out of 20 rather than out of 100.
      const scaled = normalizeCmi('1.2', {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.score.raw': '16',
        'cmi.core.score.max': '20',
      })
      assert.equal(meetsPackage(scaled, 75), true)
      assert.equal(meetsPackage(scaled, 85), false)

      // A mastery score with no score reported: trusting the content's own
      // completion beats stranding every learner of a package whose author
      // never wired the score up.
      assert.equal(meetsPackage(normalizeCmi('1.2', { 'cmi.core.lesson_status': 'completed' }), 80), true)
    })
  })

  describe('running it', () => {
    test('a commit merges elements and never loses what it does not carry', async () => {
      const { topic } = await makeCourse()
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      const row = await ScormPackage.findById(extracted._id)

      await scormRuntimeService.commit(learner._id, row, {
        cmi: { 'cmi.core.lesson_status': 'incomplete', 'cmi.suspend_data': 'slide=3', 'cmi.core.lesson_location': '3' },
      })
      const second = await scormRuntimeService.commit(learner._id, row, {
        cmi: { 'cmi.core.score.raw': '90' },
      })

      // The second commit carried one element; the suspend data survives.
      assert.equal(second.cmi['cmi.suspend_data'], 'slide=3')
      assert.equal(second.scoreRaw, 90)
      assert.equal(second.completionStatus, 'incomplete')
      assert.equal(second.completedAt, null)
      assert.equal(second.location, '3')
    })

    test('finishing marks completion once, and stays finished', async () => {
      const { topic } = await makeCourse()
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      const row = await ScormPackage.findById(extracted._id)

      const done = await scormRuntimeService.commit(learner._id, row, {
        cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '95' },
        finished: true,
      })
      assert.ok(done.completedAt)
      const completedAt = done.completedAt

      // Re-opening it and quitting on the first slide does not un-complete it.
      const later = await scormRuntimeService.commit(learner._id, row, {
        cmi: { 'cmi.core.lesson_status': 'incomplete' },
      })
      assert.deepEqual(later.completedAt, completedAt)
    })
  })

  describe('completion (AT-01, AT-02)', () => {
    test('a course made only of a package can be finished', async () => {
      const { course, topic } = await makeCourse({ assign: true })
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      await scormPackageService.update(authorActor(), extracted._id.toString(), { status: 'PUBLISHED' })

      const items = await collectCourseItems(course._id, learner._id)
      assert.deepEqual(
        items.map((item) => item.kind),
        ['scorm']
      )
      assert.equal(await statusOf(course), 'ACTIVE')

      const row = await ScormPackage.findById(extracted._id)
      // 70 against a mastery score of 80 — finished, and not passed.
      await scormRuntimeService.commit(learner._id, row, {
        cmi: { 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '70' },
      })
      assert.equal((await courseCompletionService.evaluate(learner._id, course._id)).complete, false)
      assert.equal(await statusOf(course), 'ACTIVE')

      await scormRuntimeService.commit(learner._id, row, {
        cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90' },
      })
      assert.equal(await statusOf(course), 'COMPLETED')
    })

    test('a package that failed to unpack holds nobody back', async () => {
      const { course, topic } = await makeCourse({ assign: true })
      const { extracted } = await importPackage(topic, {
        'imsmanifest.xml': MANIFEST_12,
        'content/index.html': '<html></html>',
      })
      await scormPackageService.update(authorActor(), extracted._id.toString(), { status: 'PUBLISHED' })
      // A package that breaks *after* publication: the item stops counting
      // rather than pinning the course below 100 forever.
      await ScormPackage.updateOne({ _id: extracted._id }, { $set: { processingStatus: 'FAILED' } })

      const items = await collectCourseItems(course._id, learner._id)
      assert.equal(items.length, 0)
    })
  })
})
