import { verifyAccessToken, hashOpaqueToken } from '../utils/tokens.js'
import { faceVerificationChallengeRepository } from '../repositories/faceVerificationChallenge.repository.js'
import { ApiError } from '../utils/ApiError.js'

// The one endpoint (/auth/face/verify) reachable two ways:
//  - with a normal access token — the once-a-day video-playback gate, where
//    the user is already fully logged in;
//  - with the short-lived challenge token /auth/login issued when face
//    verification is still needed to finish signing in — no session exists
//    yet, so there is nothing to put in an Authorization header.
// Exactly one of req.user/req.faceChallenge ends up meaningful; the
// controller reads req.faceChallenge to tell which case it's in.
export async function authenticateOrFaceChallenge(req, res, next) {
  const header = req.headers.authorization ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyAccessToken(token)
      req.user = {
        id: payload.sub,
        roleId: payload.roleId,
        roleName: payload.roleName,
        permissions: payload.permissions,
      }
      req.faceChallenge = null
      next()
    } catch {
      next(ApiError.unauthorized('Invalid or expired access token', 'INVALID_ACCESS_TOKEN'))
    }
    return
  }

  const verificationToken = req.body?.verificationToken
  if (!verificationToken) {
    next(ApiError.unauthorized('Missing access token or verification token', 'MISSING_CREDENTIALS'))
    return
  }

  try {
    const challenge = await faceVerificationChallengeRepository.findActiveByTokenHash(
      hashOpaqueToken(verificationToken)
    )
    if (!challenge) {
      next(ApiError.unauthorized('Invalid or expired verification token', 'INVALID_VERIFICATION_TOKEN'))
      return
    }
    req.user = { id: challenge.userId.toString(), roleId: null, roleName: null, permissions: [] }
    req.faceChallenge = challenge
    next()
  } catch (error) {
    next(error)
  }
}
