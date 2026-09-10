import { Router } from 'express'
import { verifyPlaybackToken } from '../../middlewares/videoPlaybackToken.middleware.js'
import { videoStreamRateLimiter } from '../../middlewares/videoStreamRateLimit.middleware.js'
import { videoStreamController } from '../../controllers/videoStream.controller.js'

export const videoStreamRouter = Router()

// Authorization here is the short-lived ?token= (see videoAccess.routes.js
// for how one is issued), NOT the normal Authorization: Bearer flow — a
// <video>/hls.js player fetching dozens of segment URLs doesn't attach the
// app's access token, so every request instead carries and re-validates
// its own scoped, expiring playback token.
videoStreamRouter.use(videoStreamRateLimiter)
videoStreamRouter.get('/:videoId/master.m3u8', verifyPlaybackToken, videoStreamController.masterManifest)
// Before the generic quality route on purpose: `/:videoId/:quality/:file`
// would match this too, and "subtitles" is not a rendition.
videoStreamRouter.get('/:videoId/subtitles/:trackId', verifyPlaybackToken, videoStreamController.subtitle)
videoStreamRouter.get('/:videoId/:quality/:file', verifyPlaybackToken, videoStreamController.qualityFile)
