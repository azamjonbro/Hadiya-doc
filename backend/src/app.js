import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { requestLogger } from './middlewares/requestLogger.middleware.js'
import { baseRateLimiter } from './middlewares/rateLimit.middleware.js'
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js'
import { v1Router } from './routes/v1/index.js'
import { videoUploadRouter } from './routes/v1/videoUpload.routes.js'
import { VIDEO_UPLOAD_PATH } from './video/tusServer.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  // Trust exactly one proxy hop (the nginx reverse proxy in front of this
  // container — see nginx/reverse-proxy.conf) so req.ip reads the real
  // client address from X-Forwarded-For instead of the proxy's own IP.
  // Without this, every per-IP rate limiter (login, AI chat, uploads, ...)
  // collapses onto one shared bucket in production — one abusive client
  // locks out every other user behind the same proxy. Harmless in local
  // dev, where there's no proxy sending X-Forwarded-For to trust.
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(requestLogger)

  // Mounted before the generic CORS middleware — tus manages its own
  // CORS/OPTIONS handling for this path (see videoUpload.routes.js), and
  // must run standalone so its resumable-upload response headers aren't
  // overridden by the default API CORS config below.
  app.use(VIDEO_UPLOAD_PATH, videoUploadRouter)

  app.use(
    cors({
      origin: env.allowedOrigins,
      credentials: true,
    })
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(baseRateLimiter)

  app.use('/api/v1', v1Router)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
