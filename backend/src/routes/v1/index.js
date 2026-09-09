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
import { pushRouter } from './push.routes.js'
import { orgRouter } from './org.routes.js'
import { aiChatRouter } from './aiChat.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { branchesRouter } from './branches.routes.js'
import { rolesRouter } from './roles.routes.js'
import { orgListsRouter } from './orgLists.routes.js'
import { proctorRouter } from './proctor.routes.js'
import { reportsRouter } from './reports.routes.js'
import { auditRouter } from './audit.routes.js'
import { uploadsRouter } from './uploads.routes.js'
import { gamificationRouter } from './gamification.routes.js'
import { chatRouter } from './chat.routes.js'
import { attentionPolicyRouter } from './attentionPolicy.routes.js'
import { facePolicyRouter } from './facePolicy.routes.js'
import { certificatesRouter, publicCertificatesRouter } from './certificates.routes.js'

export const v1Router = Router()

// Public first, and deliberately at its own prefix: /public/* is the only
// part of the API that answers without a token, and keeping it visible in
// one place is what makes "which endpoints are unauthenticated" a question
// with a readable answer.
v1Router.use('/public/certificates', publicCertificatesRouter)

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
v1Router.use('/push', pushRouter)
v1Router.use('/org', orgRouter)
v1Router.use('/ai-chat', aiChatRouter)
v1Router.use('/dashboard', dashboardRouter)
v1Router.use('/branches', branchesRouter)
v1Router.use('/roles', rolesRouter)
v1Router.use('/org-lists', orgListsRouter)
v1Router.use('/proctor', proctorRouter)
v1Router.use('/reports', reportsRouter)
v1Router.use('/audit-logs', auditRouter)
v1Router.use('/uploads', uploadsRouter)
v1Router.use('/gamification', gamificationRouter)
v1Router.use('/chat', chatRouter)
v1Router.use('/attention-policy', attentionPolicyRouter)
v1Router.use('/face-policy', facePolicyRouter)
v1Router.use('/certificates', certificatesRouter)
