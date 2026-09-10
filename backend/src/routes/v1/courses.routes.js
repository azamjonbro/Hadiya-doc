import { Router } from 'express'
import { PERMISSIONS } from '@lms/shared'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requirePermission, requireRole } from '../../middlewares/rbac.middleware.js'
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js'
import { courseController } from '../../controllers/course.controller.js'
import { courseCategoryController } from '../../controllers/courseCategory.controller.js'
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
  duplicateCourseSchema,
  courseCategoryCreateSchema,
  courseCategoryUpdateSchema,
} from '../../validators/course.validator.js'
import { upsertReviewSchema, listReviewsQuerySchema } from '../../validators/courseReview.validator.js'
import {
  createQuestionSchema,
  createAnswerSchema,
  listQuestionsQuerySchema,
} from '../../validators/courseQuestion.validator.js'
import { idempotent } from '../../middlewares/idempotency.middleware.js'

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
// Before '/:id' — Express matches in order and 'trash' is not a course id.
coursesRouter.get('/trash', requirePermission(PERMISSIONS.COURSE_DELETE), courseController.listTrash)

// Same ordering rule: 'categories' and 'tags' are literal segments, so they
// have to be declared before the '/:id' catch-all or they arrive as ids.
// Reading them is course:read — every catalog renders the filter — while
// changing them is course:create, the admin-tier permission.
coursesRouter.get('/categories', requirePermission(PERMISSIONS.COURSE_READ), courseCategoryController.list)
coursesRouter.post(
  '/categories',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateBody(courseCategoryCreateSchema),
  courseCategoryController.create
)
coursesRouter.patch(
  '/categories/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(courseCategoryUpdateSchema),
  courseCategoryController.update
)
coursesRouter.delete(
  '/categories/:id',
  requirePermission(PERMISSIONS.COURSE_DELETE),
  courseCategoryController.remove
)
coursesRouter.get('/tags', requirePermission(PERMISSIONS.COURSE_READ), courseCategoryController.tags)
coursesRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_READ), courseController.getById)
coursesRouter.get('/:id/progress', requirePermission(PERMISSIONS.COURSE_READ), courseController.getMyProgress)
coursesRouter.get(
  '/:id/users/:userId/progress',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_ALL),
  courseController.getProgressForUser
)
// Creating a whole course, so it is gated on course:create rather than
// course:update — copying somebody else's course is not editing it.
coursesRouter.post(
  '/:id/duplicate',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateBody(duplicateCourseSchema),
  courseController.duplicate
)
coursesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateBody(updateCourseSchema),
  courseController.update
)
// Deleting a course moves it to the trash — reversible, and the only route
// the admin's delete button calls. `/archive` stays a separate, milder state
// (retired but still listed).
coursesRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_DELETE), courseController.moveToTrash)
coursesRouter.post('/:id/archive', requirePermission(PERMISSIONS.COURSE_DELETE), courseController.archive)
coursesRouter.post('/:id/restore', requirePermission(PERMISSIONS.COURSE_DELETE), courseController.restore)
// Emptying the bin, as opposed to filling it — SUPERADMIN only, and it takes
// the course's topics, videos and analytics with it.
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

coursesRouter.post(
  '/:id/enroll',
  requirePermission(PERMISSIONS.COURSE_READ),
  idempotent(),
  courseAssignmentController.enrollSelf
)

coursesRouter.get(
  '/:id/assignments',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  courseAssignmentController.listForCourse
)
coursesRouter.post(
  '/:id/assignments',
  requirePermission(PERMISSIONS.COURSE_ASSIGN),
  idempotent(),
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
