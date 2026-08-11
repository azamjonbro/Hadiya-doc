import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { baseRateLimiter } from './middlewares/rateLimit.middleware.js'
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js'
import { v1Router } from './routes/v1/index.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
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
