import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { usersRouter } from './users.routes.js'
import { groupsRouter } from './groups.routes.js'
import { coursesRouter } from './courses.routes.js'
import { topicsRouter } from './topics.routes.js'
import { assignmentsRouter } from './assignments.routes.js'
import { videosRouter } from './videos.routes.js'
import { videoAccessRouter } from './videoAccess.routes.js'
import { videoStreamRouter } from './videoStream.routes.js'
import { materialsRouter } from './materials.routes.js'
import { trashRouter } from './trash.routes.js'
import { assessmentsRouter } from './assessments.routes.js'
import { analyticsRouter } from './analytics.routes.js'
import { videoAnalyticsRouter } from './videoAnalytics.routes.js'
import { newsRouter } from './news.routes.js'
import { newsAnalyticsRouter } from './newsAnalytics.routes.js'
import { tasksRouter } from './tasks.routes.js'
import { eventsRouter } from './events.routes.js'
import { notificationsRouter } from './notifications.routes.js'
import { aiChatRouter } from './aiChat.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { reportsRouter } from './reports.routes.js'
import { uploadsRouter } from './uploads.routes.js'
import { gamificationRouter } from './gamification.routes.js'
import { chatRouter } from './chat.routes.js'
import { attentionPolicyRouter } from './attentionPolicy.routes.js'

export const v1Router = Router()

v1Router.use('/health', healthRouter)
v1Router.use('/auth', authRouter)
v1Router.use('/users', usersRouter)
v1Router.use('/groups', groupsRouter)
v1Router.use('/courses', coursesRouter)
v1Router.use('/topics', topicsRouter)
v1Router.use('/assignments', assignmentsRouter)
v1Router.use('/videos', videosRouter)
v1Router.use('/video-access', videoAccessRouter)
v1Router.use('/video-stream', videoStreamRouter)
v1Router.use('/materials', materialsRouter)
v1Router.use('/trash', trashRouter)
v1Router.use('/assessments', assessmentsRouter)
v1Router.use('/analytics', analyticsRouter)
v1Router.use('/video-analytics', videoAnalyticsRouter)
v1Router.use('/news', newsRouter)
v1Router.use('/news-analytics', newsAnalyticsRouter)
v1Router.use('/tasks', tasksRouter)
v1Router.use('/events', eventsRouter)
v1Router.use('/notifications', notificationsRouter)
v1Router.use('/ai-chat', aiChatRouter)
v1Router.use('/dashboard', dashboardRouter)
v1Router.use('/reports', reportsRouter)
v1Router.use('/uploads', uploadsRouter)
v1Router.use('/gamification', gamificationRouter)
v1Router.use('/chat', chatRouter)
v1Router.use('/attention-policy', attentionPolicyRouter)
