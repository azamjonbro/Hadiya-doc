// 9.4 — caption tracks.
//
// Captions are the one content feature here with an accessibility mandate
// behind it: mandatory training that only works with sound excludes exactly
// the people who cannot skip it. So the tests are about the two ways a
// track can quietly not work — a file that parses but shows nothing, and a
// track the player cannot fetch — rather than about the happy path alone.
//
// The conversion is where most real files go wrong. Everything exports SRT
// (a transcription service, a translator's tool, the .srt that came with
// the video), Windows tools add a BOM, and a VTT that keeps its own header
// after conversion ends up with a cue that reads "WEBVTT" on screen.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Course } from '../src/models/course.model.js'
import { Topic } from '../src/models/topic.model.js'
import { Video } from '../src/models/video.model.js'
import { hashPassword } from '../src/utils/hash.js'
import { normalizeLanguage, srtToVtt, toWebVtt, countCues } from '../src/services/videos/subtitleFormat.js'
import { subtitleService } from '../src/services/videos/subtitle.service.js'
import { videoService } from '../src/services/videos/video.service.js'
import { isConvertibleSubtitle } from '../src/video/ffmpegUtils.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
let seq = 0
let author
let learner
const courseIds = []
const userIds = []

const authorActor = () => ({ id: author._id.toString(), permissions: ['video:view', 'video:manage', 'course:create'] })
const learnerActor = () => ({ id: learner._id.toString(), permissions: ['video:view'] })

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
    async deleteObject(key) {
      objects.delete(key)
    },
  }
}

const SRT = [
  '1',
  '00:00:01,500 --> 00:00:04,000',
  'Salom, dunyo',
  '',
  '2',
  '00:00:05,000 --> 00:00:07,250',
  'Ikkinchi qator',
  'va uning davomi',
  '',
].join('\r\n')

async function makeVideo({ status = 'PUBLISHED' } = {}) {
  const course = await Course.create({
    title: `Subtitle course ${stamp}-${seq}`,
    slug: `subtitle-course-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  courseIds.push(course._id)
  const topic = await Topic.create({
    courseId: course._id,
    title: 'T',
    slug: `sub-t-${stamp}-${seq++}`,
    status: 'PUBLISHED',
    createdBy: author._id,
  })
  const video = await Video.create({
    courseId: course._id,
    topicId: topic._id,
    title: 'V',
    order: 0,
    status,
    processingStatus: 'READY',
    hlsManifestKey: `processed/x-${stamp}/master.m3u8`,
    qualities: ['360p'],
    createdBy: author._id,
  })
  return { course, topic, video }
}

const fileOf = (text) => ({ buffer: Buffer.from(text, 'utf8'), size: Buffer.byteLength(text), originalname: 'subs.srt' })

describe('9.4 · caption tracks', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    author = await User.create({
      firstName: 'Muallif',
      lastName: 'Sub',
      fullName: 'Muallif Sub',
      jshshir: `18${stamp}001`,
      passwordHash: await hashPassword('SubTest123!'),
      roleId: role._id,
    })
    learner = await User.create({
      firstName: 'Oquvchi',
      lastName: 'Sub',
      fullName: 'Oquvchi Sub',
      jshshir: `18${stamp}002`,
      passwordHash: await hashPassword('SubTest123!'),
      roleId: role._id,
    })
    userIds.push(author._id, learner._id)
  })

  after(async () => {
    await Video.deleteMany({ courseId: { $in: courseIds } })
    await Topic.deleteMany({ courseId: { $in: courseIds } })
    await Course.deleteMany({ _id: { $in: courseIds } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('the file', () => {
    test('SRT becomes WebVTT, commas and all', () => {
      const vtt = srtToVtt(SRT)
      assert.match(vtt, /^WEBVTT\n/)
      // The comma is SRT's decimal separator; VTT wants a period.
      assert.match(vtt, /00:00:01\.500 --> 00:00:04\.000/)
      // Cue numbers are dropped: a bare integer identifier makes some
      // players print it as part of the subtitle.
      assert.doesNotMatch(vtt, /^\d+$/m)
      // A multi-line cue stays multi-line.
      assert.match(vtt, /Ikkinchi qator\nva uning davomi/)
      assert.equal(countCues(vtt), 2)
    })

    test('a real VTT keeps one header, not two', () => {
      // The second header would become the first cue's text — a subtitle
      // that says "WEBVTT" on screen.
      const { vtt } = toWebVtt('﻿WEBVTT - Sarlavha\n\n00:01.000 --> 00:03.000\nQisqa\n')
      assert.equal(vtt.match(/WEBVTT/g).length, 1)
      // MM:SS.mmm is legal VTT and refused by some players; normalised.
      assert.match(vtt, /00:00:01\.000 --> 00:00:03\.000/)
    })

    test('a file with no cues is refused', () => {
      // A track that displays nothing is worse than no track: the learner
      // turns captions on and concludes the platform is broken.
      assert.equal(toWebVtt('just some prose').error, 'The file contains no subtitle cues')
      assert.equal(toWebVtt('').error, 'The file contains no subtitle cues')
    })

    test('language codes are normalised, and nonsense is refused', () => {
      assert.equal(normalizeLanguage('uz'), 'uz')
      assert.equal(normalizeLanguage('RU'), 'ru')
      assert.equal(normalizeLanguage('ru-ru'), 'ru-RU')
      assert.equal(normalizeLanguage('o zbek'), null)
      assert.equal(normalizeLanguage(''), null)
    })

    test('bitmap subtitle codecs are not convertible', () => {
      // They are pictures of text; turning them into VTT would need OCR.
      assert.equal(isConvertibleSubtitle('subrip'), true)
      assert.equal(isConvertibleSubtitle('mov_text'), true)
      assert.equal(isConvertibleSubtitle('dvd_subtitle'), false)
      assert.equal(isConvertibleSubtitle('hdmv_pgs_subtitle'), false)
    })
  })

  describe('managing tracks', () => {
    test('the first track added becomes the default', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      const tracks = await subtitleService.add(
        authorActor(),
        video._id.toString(),
        { lang: 'uz', label: "O'zbek" },
        fileOf(SRT),
        { storage }
      )
      assert.equal(tracks.length, 1)
      assert.equal(tracks[0].lang, 'uz')
      assert.equal(tracks[0].isDefault, true)
      assert.equal(tracks[0].cueCount, 2)
      // Stored as VTT whatever arrived, with the right content type — a
      // browser will not read a track served as text/plain.
      const [stored] = [...storage.objects.values()]
      assert.match(stored.body.toString(), /^WEBVTT/)
      assert.equal(stored.contentType, 'text/vtt; charset=utf-8')
    })

    test('a second upload for the same language replaces it', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      await subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz' }, fileOf(SRT), { storage })
      const tracks = await subtitleService.add(
        authorActor(),
        video._id.toString(),
        { lang: 'uz', label: 'Tuzatilgan' },
        fileOf('1\n00:00:02,000 --> 00:00:03,000\nYangi matn\n'),
        { storage }
      )
      // Two "Uzbek" entries in the menu with no way to tell them apart is
      // not a feature; the second upload is a correction.
      assert.equal(tracks.length, 1)
      assert.equal(tracks[0].label, 'Tuzatilgan')
      assert.equal(tracks[0].cueCount, 1)
    })

    test('only one track is ever the default', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      await subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz' }, fileOf(SRT), { storage })
      let tracks = await subtitleService.add(
        authorActor(),
        video._id.toString(),
        { lang: 'ru', isDefault: true },
        fileOf(SRT),
        { storage }
      )
      assert.deepEqual(
        tracks.map((track) => [track.lang, track.isDefault]),
        [
          ['uz', false],
          ['ru', true],
        ]
      )

      const uzId = tracks.find((track) => track.lang === 'uz').id
      tracks = await subtitleService.setDefault(authorActor(), video._id.toString(), uzId)
      assert.deepEqual(
        tracks.map((track) => [track.lang, track.isDefault]),
        [
          ['uz', true],
          ['ru', false],
        ]
      )
    })

    test('removing the default promotes another one', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      await subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz' }, fileOf(SRT), { storage })
      const withRu = await subtitleService.add(authorActor(), video._id.toString(), { lang: 'ru' }, fileOf(SRT), {
        storage,
      })
      const uzId = withRu.find((track) => track.lang === 'uz').id

      const tracks = await subtitleService.remove(authorActor(), video._id.toString(), uzId, { storage })
      // Otherwise the video keeps captions that never come on by themselves.
      assert.deepEqual(
        tracks.map((track) => [track.lang, track.isDefault]),
        [['ru', true]]
      )
      assert.equal(storage.objects.size, 1)
    })

    test('a bad language or an unreadable file is refused', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      await assert.rejects(
        () => subtitleService.add(authorActor(), video._id.toString(), { lang: 'not a language' }, fileOf(SRT), { storage }),
        { code: 'INVALID_LANGUAGE' }
      )
      await assert.rejects(
        () => subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz' }, fileOf('no cues here'), { storage }),
        { code: 'INVALID_SUBTITLE_FILE' }
      )
    })
  })

  describe('reading them back', () => {
    test('the video payload carries its tracks, for the player to build <track> from', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      await subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz', label: "O'zbek" }, fileOf(SRT), {
        storage,
      })
      const payload = await videoService.getById(learnerActor(), video._id.toString())
      assert.equal(payload.subtitles.length, 1)
      assert.equal(payload.subtitles[0].label, "O'zbek")
      assert.equal(payload.subtitles[0].isDefault, true)
      assert.ok(payload.subtitles[0].id)
    })

    test('a draft video keeps its tracks to itself', async () => {
      const { video } = await makeVideo({ status: 'DRAFT' })
      const storage = memoryStorage()
      await subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz' }, fileOf(SRT), { storage })
      await assert.rejects(() => videoService.listSubtitles(learnerActor(), video._id.toString()), { statusCode: 404 })
      assert.equal((await videoService.listSubtitles(authorActor(), video._id.toString())).length, 1)
    })

    test('a track is fetched by id, and the file comes back as VTT', async () => {
      const { video } = await makeVideo()
      const storage = memoryStorage()
      const [track] = await subtitleService.add(authorActor(), video._id.toString(), { lang: 'uz' }, fileOf(SRT), {
        storage,
      })
      const { body, lang } = await subtitleService.openTrack(video._id.toString(), track.id, { storage })
      assert.equal(lang, 'uz')
      const chunks = []
      for await (const chunk of body) chunks.push(chunk)
      assert.match(Buffer.concat(chunks).toString(), /^WEBVTT/)

      // An id from another video is not a track on this one — nothing is
      // resolved from a language string the client controls.
      await assert.rejects(
        () => subtitleService.openTrack(video._id.toString(), new mongoose.Types.ObjectId().toString(), { storage }),
        { statusCode: 404 }
      )
    })
  })
})
