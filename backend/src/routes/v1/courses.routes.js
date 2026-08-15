import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireRole } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { courseController } from '../../controllers/course.controller.js'
import { courseAssignmentController } from '../../controllers/courseAssignment.controller.js'
import { courseReviewController } from '../../controllers/courseReview.controller.js'
import { courseQuestionController } from '../../controllers/courseQuestion.controller.js'
import { attentionPolicyController } from '../../controllers/attentionPolicy.controller.js'
import { attentionPolicySchema } from '../../validators/attentionPolicy.validator.js'
import {
  createCourseSchema,
  updateCourseSchema,
  listCoursesQuerySchema,
  createTopicSchema,
  createAssignmentSchema,
} from '../../validators/course.validator.js'
import { upsertReviewSchema, listReviewsQuerySchema } from '../../validators/courseReview.validator.js'
import {
  createQuestionSchema,
  createAnswerSchema,
  listQuestionsQuerySchema,
} from '../../validators/courseQuestion.validator.js'

export const coursesRouter = Router()

coursesRouter.use(authenticate)

coursesRouter.get(
  '/',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateQuery(listCoursesQuerySchema),
  courseController.list
)
coursesRouter.post(
  '/',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateBody(createCourseSchema),
  courseController.create
)
coursesRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_READ), courseController.getById)
coursesRouter.get('/:id/progress', requirePermission(PERMISSIONS.COURSE_READ), courseController.getMyProgress)
coursesRouter.get(
  '/:id/users/:userId/progress',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  courseController.getProgressForUser
)
coursesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateCourseSchema),
  courseController.update
)
coursesRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_DELETE), courseController.archive)
// Hard delete, as opposed to the reversible archive above — SUPERADMIN only.
coursesRouter.delete(
  '/:id/permanent',
  requirePermission(PERMISSIONS.COURSE_DELETE),
  requireRole('SUPERADMIN'),
  courseController.destroy
)

// The employee app reads the merged policy before playback starts; the admin
// app reads the annotated form (inherited vs overridden) to render the panel.
coursesRouter.get(
  '/:id/attention-policy/effective',
  requirePermission(PERMISSIONS.COURSE_READ),
  attentionPolicyController.getEffectiveForCourse
)
coursesRouter.get(
  '/:id/attention-policy',
  requirePermission(PERMISSIONS.COURSE_READ),
  attentionPolicyController.getForCourse
)
coursesRouter.put(
  '/:id/attention-policy',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(attentionPolicySchema),
  attentionPolicyController.updateForCourse
)
coursesRouter.delete(
  '/:id/attention-policy',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  attentionPolicyController.removeCourseOverride
)

coursesRouter.get('/:id/topics', requirePermission(PERMISSIONS.COURSE_READ), courseController.listTopics)
coursesRouter.post(
  '/:id/topics',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(createTopicSchema),
  courseController.createTopic
)

coursesRouter.post('/:id/enroll', requirePermission(PERMISSIONS.COURSE_READ), courseAssignmentController.enrollSelf)

coursesRouter.get(
  '/:id/assignments',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  courseAssignmentController.listForCourse
)
coursesRouter.post(
  '/:id/assignments',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  validateBody(createAssignmentSchema),
  courseAssignmentController.assign
)

// Reviews and Q&A: gated on course:read only (every employee has it) plus
// the course actually being visible to them — not the master spec, added
// on explicit request. Anyone who can see the course can review/ask/
// answer; deleting is limited to the author or course:update holders.
coursesRouter.get(
  '/:id/reviews',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateQuery(listReviewsQuerySchema),
  courseReviewController.list
)
coursesRouter.put(
  '/:id/reviews',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateBody(upsertReviewSchema),
  courseReviewController.upsert
)
coursesRouter.delete('/:id/reviews/:reviewId', requirePermission(PERMISSIONS.COURSE_READ), courseReviewController.remove)

coursesRouter.get(
  '/:id/questions',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateQuery(listQuestionsQuerySchema),
  courseQuestionController.list
)
coursesRouter.post(
  '/:id/questions',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateBody(createQuestionSchema),
  courseQuestionController.create
)
coursesRouter.post(
  '/:id/questions/:questionId/answers',
  requirePermission(PERMISSIONS.COURSE_READ),
  validateBody(createAnswerSchema),
  courseQuestionController.answer
)
coursesRouter.delete('/:id/questions/:questionId', requirePermission(PERMISSIONS.COURSE_READ), courseQuestionController.remove)
