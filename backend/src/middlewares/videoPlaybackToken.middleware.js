import { videoAccessService } from '../services/videos/videoAccess.service.js'
import { ApiError } from '../utils/ApiError.js'

// Every video-stream request (manifest AND every single segment) carries
// its own ?token= and is re-validated here individually — a leaked segment
// URL stops working the moment the short-lived token expires, not just the
// initial manifest request.
export function verifyPlaybackToken(req, res, next) {
  const token = req.query.token
  if (!token) {
    next(ApiError.unauthorized('Missing playback token', 'MISSING_PLAYBACK_TOKEN'))
    return
  }
  try {
    req.playback = videoAccessService.verifyToken(String(token), req.params.videoId)
    next()
  } catch (error) {
    next(error)
  }
}

// Tagged for the generated document (11.3): these routes carry their own
// short-lived token in the query rather than a session header, because a
// <video> element cannot send an Authorization header.
verifyPlaybackToken.openapi = { kind: 'security', scheme: 'playbackToken' }
