import { Server, MemoryLocker } from '@tus/server'
import { S3Store } from '@tus/s3-store'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { Topic } from '../models/topic.model.js'
import { videoRepository } from '../repositories/video.repository.js'
import { auditLogRepository } from '../repositories/auditLog.repository.js'
import { enqueueVideoProcessing } from '../jobs/videoProcessingQueue.js'
import { nextOrder } from '../services/courses/contentItem.js'

const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm'])
export const VIDEO_UPLOAD_PATH = '/api/v1/videos/upload'

// The wrapped tus request exposes the original Express req (and whatever
// our auth middleware attached to it, e.g. `.user`) via `runtime.node.req`
// — @tus/server wraps req/res into a Fetch-API-style object internally,
// but the Node req object identity is preserved.
function expressUserFromTusRequest(tusReq) {
  return tusReq.runtime?.node?.req?.user ?? tusReq.node?.req?.user ?? null
}

const datastore = new S3Store({
  s3ClientConfig: {
    bucket: env.S3_BUCKET_ORIGINALS,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  },
})

export const tusServer = new Server({
  path: VIDEO_UPLOAD_PATH,
  datastore,
  locker: new MemoryLocker(),
  allowedOrigins: env.allowedOrigins,
  allowedCredentials: true,
  respectForwardedHeaders: true,

  // The upload URL tus hands back is relative ("/api/v1/videos/upload/<id>")
  // rather than absolute, and tus-js-client resolves it against the endpoint
  // it already called — so it inherits the scheme and host of the request the
  // browser actually made.
  //
  // Absolute is what tus builds by default, from X-Forwarded-Proto. Behind a
  // Cloudflare tunnel that header is a lie: TLS terminates at the edge, the
  // tunnel reaches nginx over plain http, and nginx sets the header from
  // $scheme — so tus announced http:// to a page loaded over https. The
  // browser blocks that as mixed content, and the upload dies on the HEAD
  // with an opaque "[object ProgressEvent]" rather than an HTTP status.
  // Deriving the URL from the request removes the guess entirely: nothing to
  // configure, nothing to drift when the domain or the proxy changes.
  relativeLocation: true,

  async onUploadCreate(req, upload) {
    const metadata = upload.metadata ?? {}

    if (!metadata.topicId) throw { status_code: 400, body: 'topicId metadata is required\n' }
    if (!metadata.title) throw { status_code: 400, body: 'title metadata is required\n' }

    const topic = await Topic.findById(metadata.topicId).catch(() => null)
    if (!topic) throw { status_code: 404, body: 'Topic not found\n' }

    const filename = metadata.filename ?? ''
    const extension = filename.split('.').pop()?.toLowerCase()
    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      throw { status_code: 400, body: 'Unsupported video file type\n' }
    }

    return { metadata }
  },

  async onUploadFinish(req, upload) {
    const metadata = upload.metadata ?? {}
    const topic = await Topic.findById(metadata.topicId).catch(() => null)
    if (!topic) throw { status_code: 404, body: 'Topic not found\n' }

    const actor = expressUserFromTusRequest(req)

    const video = await videoRepository.create({
      topicId: topic._id,
      courseId: topic.courseId,
      title: metadata.title,
      description: metadata.description ?? '',
      fileSize: upload.size ?? 0,
      originalKey: upload.storage?.path ?? upload.id,
      processingStatus: 'PENDING',
      status: 'DRAFT',
      required: metadata.required !== 'false',
      // Uploaded videos join the same sequence as everything else in the
      // topic (9.1); an explicit order from the client still wins.
      order: metadata.order === undefined ? await nextOrder(topic._id) : Number(metadata.order),
      createdBy: actor?.id ?? null,
    })

    if (actor) {
      await auditLogRepository.record({
        actor: actor.id,
        action: 'VIDEO_UPLOADED',
        entity: 'Video',
        entityId: video._id.toString(),
        metadata: { topicId: topic._id.toString(), title: video.title, fileSize: video.fileSize },
      })
    }

    logger.info('Video upload finished', { videoId: video._id.toString(), fileSize: video.fileSize })

    await enqueueVideoProcessing(video._id.toString())

    return {}
  },
})
