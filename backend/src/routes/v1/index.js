import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { usersRouter } from './users.routes.js'
import { coursesRouter } from './courses.routes.js'
import { topicsRouter } from './topics.routes.js'
import { assignmentsRouter } from './assignments.routes.js'
import { videosRouter } from './videos.routes.js'
import { videoAccessRouter } from './videoAccess.routes.js'
import { videoStreamRouter } from './videoStream.routes.js'
import { analyticsRouter } from './analytics.routes.js'
import { videoAnalyticsRouter } from './videoAnalytics.routes.js'

export const v1Router = Router()

v1Router.use('/health', healthRouter)
v1Router.use('/auth', authRouter)
v1Router.use('/users', usersRouter)
v1Router.use('/courses', coursesRouter)
v1Router.use('/topics', topicsRouter)
v1Router.use('/assignments', assignmentsRouter)
v1Router.use('/videos', videosRouter)
v1Router.use('/video-access', videoAccessRouter)
v1Router.use('/video-stream', videoStreamRouter)
v1Router.use('/analytics', analyticsRouter)
v1Router.use('/video-analytics', videoAnalyticsRouter)
